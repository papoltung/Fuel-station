import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isSameSaleRequest, parseSaleInput } from "@/lib/sale-input";
import { requireRole } from "@/lib/authz";
import { saleSnapshot } from "@/lib/sale-audit";

export async function GET(req: NextRequest) {
  const dateStr = new URL(req.url).searchParams.get("date");
  let where = {};
  if (dateStr) {
    const start = new Date(dateStr + "T00:00:00+07:00");
    const end = new Date(dateStr + "T23:59:59.999+07:00");
    where = { date: { gte: start, lte: end } };
  }
  const sales = await prisma.sale.findMany({ where, include: { fuelType: true }, orderBy: { createdAt: "desc" }, take: dateStr ? undefined : 200 });
  return NextResponse.json(sales);
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(["owner", "manager", "staff"]);
  if (!auth.ok) return auth.response;
  let input: ReturnType<typeof parseSaleInput>;
  let expectedShiftId: number | undefined;
  try {
    const body = await req.json() as Record<string, unknown>;
    const rawExpectedShiftId = body.expectedShiftId;
    if (rawExpectedShiftId !== undefined) {
      const parsedExpectedShiftId = Number(rawExpectedShiftId);
      if (!Number.isInteger(parsedExpectedShiftId) || parsedExpectedShiftId <= 0) throw new Error("EXPECTED_SHIFT_INVALID");
      expectedShiftId = parsedExpectedShiftId;
    }
    input = parseSaleInput({ ...body, sellerName: auth.user.name });
  } catch (error) {
    if (error instanceof Error && error.message === "EXPECTED_SHIFT_INVALID") return NextResponse.json({ error: "กะอ้างอิงไม่ถูกต้อง", code: "EXPECTED_SHIFT_INVALID" }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  // Idempotent replay is allowed after the original shift closes. Only a new
  // sale needs an active shift.
  if (input.clientRequestId) {
    const existing = await prisma.sale.findUnique({ where: { clientRequestId: input.clientRequestId }, include: { fuelType: true, shift: true } });
    if (existing) {
      if (existing.shift?.openedById !== auth.user.id) return NextResponse.json({ error: "ไม่อนุญาตให้ใช้รายการของบัญชีอื่น" }, { status: 403 });
      if (isSameSaleRequest(existing, input)) return NextResponse.json(existing, { status: 200, headers: { "Idempotent-Replay": "true" } });
      return NextResponse.json({ error: "รหัสรายการนี้ถูกใช้กับข้อมูลอื่นแล้ว" }, { status: 409 });
    }
  }

  try {
    const sale = await prisma.$transaction(async (tx) => {
      const shift = expectedShiftId
        ? await tx.shift.findUnique({ where: { id: expectedShiftId } })
        : await tx.shift.findFirst({ where: { openedById: auth.user.id, status: "open" }, orderBy: { openedAt: "desc" } });
      if (!shift) throw new Error(expectedShiftId ? "EXPECTED_SHIFT_NOT_OPEN" : "NO_OPEN_SHIFT");
      if (shift.openedById !== auth.user.id || shift.status !== "open") throw new Error("EXPECTED_SHIFT_NOT_OPEN");
      const created = await tx.sale.create({
        data: {
          clientRequestId: input.clientRequestId,
          date: input.date ? new Date(input.date) : new Date(),
          sellerName: input.sellerName,
          fuelTypeId: input.fuelTypeId,
          pumpNo: input.pumpNo,
          meterStart: input.meterStart,
          meterEnd: input.meterEnd,
          liters: input.liters,
          pricePerLiter: input.pricePerLiter,
          totalAmount: input.totalAmount,
          paymentMethod: input.paymentMethod,
          customerName: input.customerName,
          note: input.note,
          shiftId: shift.id,
        },
        include: { fuelType: true },
      });
      await tx.fuelStock.upsert({
        where: { fuelTypeId: input.fuelTypeId },
        create: { fuelTypeId: input.fuelTypeId, currentLiters: -input.liters },
        update: { currentLiters: { decrement: input.liters } },
      });
      await tx.saleAudit.create({ data: { saleId: created.id, action: "create", actorId: auth.user.id, actorName: auth.user.name, actorEmail: auth.user.email, afterData: saleSnapshot(created) } });
      return created;
    });
    return NextResponse.json(sale, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "NO_OPEN_SHIFT") return NextResponse.json({ error: "กรุณาเปิดกะก่อนบันทึกการขาย", code: "NO_OPEN_SHIFT" }, { status: 409 });
    if (error instanceof Error && error.message === "EXPECTED_SHIFT_NOT_OPEN") return NextResponse.json({ error: "กะเดิมปิดแล้วหรือไม่ใช่กะของบัญชีนี้", code: "EXPECTED_SHIFT_NOT_OPEN" }, { status: 409 });
    if (input.clientRequestId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.sale.findUnique({ where: { clientRequestId: input.clientRequestId }, include: { fuelType: true, shift: true } });
      if (existing?.shift?.openedById === auth.user.id && isSameSaleRequest(existing, input)) return NextResponse.json(existing, { status: 200, headers: { "Idempotent-Replay": "true" } });
      return NextResponse.json({ error: "รหัสรายการนี้ถูกใช้กับข้อมูลอื่นแล้ว" }, { status: 409 });
    }
    console.error("sales POST error:", error);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}
