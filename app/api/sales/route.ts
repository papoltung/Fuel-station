import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isSameSaleRequest, parseSaleInput } from "@/lib/sale-input";
import { requireRole } from "@/lib/authz";
import { saleSnapshot } from "@/lib/sale-audit";
import { METER_ERROR_CODES, resolveMeterContext, resolveOpenMeterFuel, validatePumpFuel } from "@/lib/meter-context";

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
  let expectedShiftId: number | undefined;
  let expectedPumpId: number | undefined;
  let pumpId: number | undefined;
  try {
    const body = await req.json() as Record<string, unknown>;
    const rawExpectedShiftId = body.expectedShiftId;
    if (rawExpectedShiftId !== undefined) {
      const parsedExpectedShiftId = Number(rawExpectedShiftId);
      if (!Number.isInteger(parsedExpectedShiftId) || parsedExpectedShiftId <= 0) throw new Error("EXPECTED_SHIFT_INVALID");
      expectedShiftId = parsedExpectedShiftId;
    }
    const rawExpectedPumpId = body.expectedPumpId;
    if (rawExpectedPumpId !== undefined) {
      const parsedExpectedPumpId = Number(rawExpectedPumpId);
      expectedPumpId = Number.isInteger(parsedExpectedPumpId) && parsedExpectedPumpId > 0 ? parsedExpectedPumpId : -1;
    }
    const parsedPumpId = body.pumpId === undefined
      ? Number(String(body.pumpNo ?? "").match(/(\d+)\s*$/)?.[1] ?? NaN)
      : Number(body.pumpId);
    pumpId = Number.isInteger(parsedPumpId) && parsedPumpId > 0 ? parsedPumpId : undefined;
    input = parseSaleInput({ ...body, sellerName: auth.user.name });
  } catch (error) {
    if (error instanceof Error && error.message === "EXPECTED_SHIFT_INVALID") return NextResponse.json({ error: "กะอ้างอิงไม่ถูกต้อง", code: "EXPECTED_SHIFT_INVALID" }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  if (expectedPumpId === -1) {
    return NextResponse.json({ error: "หัวจ่ายอ้างอิงไม่ถูกต้อง", code: "EXPECTED_PUMP_INVALID" }, { status: 400 });
  }
  if (!pumpId) {
    return NextResponse.json({ error: "กรุณาเลือกหัวจ่ายที่ตั้งค่าไว้", code: METER_ERROR_CODES.PUMP_NOT_FOUND }, { status: 400 });
  }
  if (expectedPumpId !== undefined && expectedPumpId !== pumpId) {
    return NextResponse.json({ error: "รายการออฟไลน์อ้างอิงหัวจ่ายคนละหัว", code: METER_ERROR_CODES.EXPECTED_PUMP_MISMATCH }, { status: 409 });
  }

  // Idempotent replay is allowed after the original shift closes. Only a new
  // sale needs an active shift.
  if (input.clientRequestId) {
    const existing = await prisma.sale.findUnique({ where: { clientRequestId: input.clientRequestId }, include: { fuelType: true, shift: true, pump: true } });
    if (existing) {
      if (existing.shift?.openedById !== auth.user.id) return NextResponse.json({ error: "ไม่อนุญาตให้ใช้รายการของบัญชีอื่น" }, { status: 403 });
      if (isSameSaleRequest(existing, input, pumpId)) return NextResponse.json(existing, { status: 200, headers: { "Idempotent-Replay": "true" } });
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
      const pump = await tx.pump.findUnique({ where: { id: pumpId } });
      if (!pump || !pump.isActive) throw new Error(METER_ERROR_CODES.PUMP_NOT_FOUND);
      const fuelMatch = validatePumpFuel({ configuredFuelTypeId: pump.fuelTypeId, requestedFuelTypeId: input.fuelTypeId });
      if (!fuelMatch.ok) throw new Error(fuelMatch.code);
      if (expectedShiftId !== undefined && expectedPumpId !== undefined) {
        const context = resolveMeterContext({ expectedShiftId, expectedPumpId, shiftId: shift.id, pumpId: pump.id });
        if (!context.ok) throw new Error(context.code);
      }
      const openMeter = await tx.meterPeriod.findFirst({ where: { shiftId: shift.id, pumpId: pump.id, meterEnd: null } });
      const openMeterFuel = resolveOpenMeterFuel({ openMeterFuelTypeId: openMeter?.fuelTypeId ?? null, requestedFuelTypeId: input.fuelTypeId });
      if (!openMeterFuel.ok) throw new Error(openMeterFuel.code);
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
          pumpId: pump.id,
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
    if (error instanceof Error && error.message === "NO_OPEN_SHIFT") return NextResponse.json({ error: "กรุณาเปิดกะก่อนบันทึกการขาย", code: "NO_OPEN_SHIFT" }, { status: 409 });
    if (error instanceof Error && error.message === "EXPECTED_SHIFT_NOT_OPEN") return NextResponse.json({ error: "กะเดิมปิดแล้วหรือไม่ใช่กะของบัญชีนี้", code: "EXPECTED_SHIFT_NOT_OPEN" }, { status: 409 });
    if (input.clientRequestId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.sale.findUnique({ where: { clientRequestId: input.clientRequestId }, include: { fuelType: true, shift: true, pump: true } });
      if (existing?.shift?.openedById === auth.user.id && isSameSaleRequest(existing, input, pumpId)) return NextResponse.json(existing, { status: 200, headers: { "Idempotent-Replay": "true" } });
      return NextResponse.json({ error: "รหัสรายการนี้ถูกใช้กับข้อมูลอื่นแล้ว" }, { status: 409 });
    }
    if (error instanceof Error && error.message === METER_ERROR_CODES.PUMP_NOT_FOUND) return NextResponse.json({ error: "ไม่พบหัวจ่ายหรือหัวจ่ายถูกปิดใช้งาน", code: METER_ERROR_CODES.PUMP_NOT_FOUND }, { status: 404 });
    if (error instanceof Error && error.message === METER_ERROR_CODES.EXPECTED_PUMP_MISMATCH) return NextResponse.json({ error: "หัวจ่ายของรายการออฟไลน์ไม่ตรงกับกะเดิม", code: METER_ERROR_CODES.EXPECTED_PUMP_MISMATCH }, { status: 409 });
    if (error instanceof Error && error.message === METER_ERROR_CODES.PUMP_FUEL_NOT_CONFIGURED) return NextResponse.json({ error: "หัวจ่ายนี้ยังไม่ได้ตั้งค่าชนิดน้ำมัน", code: METER_ERROR_CODES.PUMP_FUEL_NOT_CONFIGURED }, { status: 409 });
    if (error instanceof Error && error.message === METER_ERROR_CODES.METER_FUEL_MISMATCH) return NextResponse.json({ error: "ชนิดน้ำมันไม่ตรงกับหัวจ่ายหรือรอบมิเตอร์", code: METER_ERROR_CODES.METER_FUEL_MISMATCH }, { status: 409 });
    if (error instanceof Error && error.message === METER_ERROR_CODES.NO_OPEN_METER) return NextResponse.json({ error: "กรุณาเปิดรอบมิเตอร์ของหัวจ่ายนี้ก่อนบันทึกการขาย", code: METER_ERROR_CODES.NO_OPEN_METER }, { status: 409 });
    console.error("sales POST error:", error);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}
