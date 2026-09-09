import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isSameSaleRequest, parseOptionalPositiveInteger, parseSaleInput } from "@/lib/sale-input";
import { requireRole } from "@/lib/authz";
import { saleSnapshot } from "@/lib/sale-audit";
import { METER_ERROR_CODES, validatePumpFuel } from "@/lib/meter-context";

export async function GET(req: NextRequest) {
  const dateStr = new URL(req.url).searchParams.get("date");
  let where = {};
  if (dateStr) {
    const start = new Date(dateStr + "T00:00:00+07:00");
    const end = new Date(dateStr + "T23:59:59.999+07:00");
    where = { date: { gte: start, lte: end } };
  }
  const sales = await prisma.sale.findMany({ where, include: { fuelType: true, pump: true, shift: { select: { id: true, status: true, openedById: true } } }, orderBy: { createdAt: "desc" }, take: dateStr ? undefined : 200 });
  return NextResponse.json(sales);
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(["owner", "manager", "staff"]);
  if (!auth.ok) return auth.response;
  let input: ReturnType<typeof parseSaleInput>;
  let expectedPumpId: number | undefined;
  let pumpId: number | undefined;
  try {
    const body = await req.json() as Record<string, unknown>;
    const rawExpectedPumpId = body.expectedPumpId;
    if (rawExpectedPumpId !== undefined) {
      const parsedExpectedPumpId = Number(rawExpectedPumpId);
      expectedPumpId = Number.isInteger(parsedExpectedPumpId) && parsedExpectedPumpId > 0 ? parsedExpectedPumpId : -1;
    }
    pumpId = parseOptionalPositiveInteger(body.pumpId);
    input = parseSaleInput({ ...body, sellerName: auth.user.name });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  if (expectedPumpId === -1) {
    return NextResponse.json({ error: "หัวจ่ายอ้างอิงไม่ถูกต้อง", code: "EXPECTED_PUMP_INVALID" }, { status: 400 });
  }
  if (expectedPumpId !== undefined && (!pumpId || expectedPumpId !== pumpId)) {
    return NextResponse.json({ error: "รายการออฟไลน์อ้างอิงหัวจ่ายคนละหัว", code: METER_ERROR_CODES.EXPECTED_PUMP_MISMATCH }, { status: 409 });
  }

  if (input.clientRequestId) {
    const existing = await prisma.sale.findUnique({ where: { clientRequestId: input.clientRequestId }, include: { fuelType: true, shift: true, pump: true } });
    if (existing) {
      const createdBy = await prisma.saleAudit.findFirst({ where: { saleId: existing.id, action: "create" }, select: { actorId: true } });
      if ((createdBy?.actorId ?? existing.shift?.openedById) !== auth.user.id) return NextResponse.json({ error: "ไม่อนุญาตให้ใช้รายการของบัญชีอื่น" }, { status: 403 });
      if (isSameSaleRequest(existing, input, pumpId)) return NextResponse.json(existing, { status: 200, headers: { "Idempotent-Replay": "true" } });
      return NextResponse.json({ error: "รหัสรายการนี้ถูกใช้กับข้อมูลอื่นแล้ว" }, { status: 409 });
    }
  }

  try {
    const sale = await prisma.$transaction(async (tx) => {
      const pump = pumpId ? await tx.pump.findUnique({ where: { id: pumpId } }) : null;
      if (pumpId && (!pump || !pump.isActive)) throw new Error(METER_ERROR_CODES.PUMP_NOT_FOUND);
      if (pump) {
        const fuelMatch = validatePumpFuel({ configuredFuelTypeId: pump.fuelTypeId, requestedFuelTypeId: input.fuelTypeId });
        if (!fuelMatch.ok) throw new Error(fuelMatch.code);
      }
      const created = await tx.sale.create({
        data: {
          clientRequestId: input.clientRequestId,
          date: input.date ? new Date(input.date) : new Date(),
          sellerName: input.sellerName,
          fuelTypeId: input.fuelTypeId,
          pumpNo: input.pumpNo ?? "",
          meterStart: input.meterStart,
          meterEnd: input.meterEnd,
          liters: input.liters,
          pricePerLiter: input.pricePerLiter,
          totalAmount: input.totalAmount,
          paymentMethod: input.paymentMethod,
          customerName: input.customerName,
          note: input.note,
          shiftId: null,
          pumpId: pump?.id ?? null,
        },
        include: { fuelType: true, pump: true, shift: { select: { id: true, status: true, openedById: true } } },
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
    if (input.clientRequestId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.sale.findUnique({ where: { clientRequestId: input.clientRequestId }, include: { fuelType: true, shift: true, pump: true } });
      const createdBy = existing ? await prisma.saleAudit.findFirst({ where: { saleId: existing.id, action: "create" }, select: { actorId: true } }) : null;
      if (existing && (createdBy?.actorId ?? existing.shift?.openedById) === auth.user.id && isSameSaleRequest(existing, input, pumpId)) return NextResponse.json(existing, { status: 200, headers: { "Idempotent-Replay": "true" } });
      return NextResponse.json({ error: "รหัสรายการนี้ถูกใช้กับข้อมูลอื่นแล้ว" }, { status: 409 });
    }
    if (error instanceof Error && error.message === METER_ERROR_CODES.PUMP_NOT_FOUND) return NextResponse.json({ error: "ไม่พบหัวจ่ายหรือหัวจ่ายถูกปิดใช้งาน", code: METER_ERROR_CODES.PUMP_NOT_FOUND }, { status: 404 });
    if (error instanceof Error && error.message === METER_ERROR_CODES.EXPECTED_PUMP_MISMATCH) return NextResponse.json({ error: "หัวจ่ายของรายการออฟไลน์ไม่ตรงกับหัวจ่ายเดิม", code: METER_ERROR_CODES.EXPECTED_PUMP_MISMATCH }, { status: 409 });
    if (error instanceof Error && error.message === METER_ERROR_CODES.PUMP_FUEL_NOT_CONFIGURED) return NextResponse.json({ error: "หัวจ่ายนี้ยังไม่ได้ตั้งค่าชนิดน้ำมัน", code: METER_ERROR_CODES.PUMP_FUEL_NOT_CONFIGURED }, { status: 409 });
    if (error instanceof Error && error.message === METER_ERROR_CODES.METER_FUEL_MISMATCH) return NextResponse.json({ error: "ชนิดน้ำมันไม่ตรงกับหัวจ่าย", code: METER_ERROR_CODES.METER_FUEL_MISMATCH }, { status: 409 });
    console.error("sales POST error:", error);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}
