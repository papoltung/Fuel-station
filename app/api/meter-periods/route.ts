import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { METER_ERROR_CODES, validatePumpFuel } from "@/lib/meter-context";

function parsePositive(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseNonNegative(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseDate(value: unknown) {
  if (value === undefined || value === "") return new Date();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function meterErrorMessage(code: string) {
  switch (code) {
    case METER_ERROR_CODES.EXPECTED_SHIFT_NOT_OPEN: return "กะอ้างอิงไม่ใช่กะที่เปิดอยู่ของบัญชีนี้";
    case METER_ERROR_CODES.PUMP_NOT_FOUND: return "ไม่พบหัวจ่ายหรือหัวจ่ายถูกปิดใช้งาน";
    case METER_ERROR_CODES.PUMP_FUEL_NOT_CONFIGURED: return "หัวจ่ายนี้ยังไม่ได้ตั้งค่าชนิดน้ำมัน";
    case METER_ERROR_CODES.METER_FUEL_MISMATCH: return "ชนิดน้ำมันไม่ตรงกับหัวจ่ายที่ตั้งค่าไว้";
    case METER_ERROR_CODES.PUMP_METER_ALREADY_OPEN: return "หัวจ่ายนี้มีรอบมิเตอร์ที่ยังไม่ปิดอยู่แล้ว";
    default: return "ข้อมูลมิเตอร์ไม่ถูกต้อง";
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(["owner", "manager", "staff"]);
  if (!auth.ok) return auth.response;

  const date = req.nextUrl.searchParams.get("date");
  const dateWhere = date ? {
    date: {
      gte: new Date(`${date}T00:00:00+07:00`),
      lte: new Date(`${date}T23:59:59.999+07:00`),
    },
  } : {};
  const ownerWhere = auth.user.role === "owner" ? {} : { shift: { openedById: auth.user.id } };

  try {
    const periods = await prisma.meterPeriod.findMany({
      where: { ...dateWhere, ...ownerWhere },
      include: {
        fuelType: true,
        pump: true,
        shift: { select: { id: true, status: true, openedById: true, openedByName: true, closedAt: true } },
      },
      orderBy: { date: "desc" },
      take: 100,
    });
    return NextResponse.json(periods);
  } catch (error) {
    console.error("meter-periods GET error:", error);
    return NextResponse.json({ error: "ไม่สามารถโหลดข้อมูลมิเตอร์ได้" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(["owner", "manager", "staff"]);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const fuelTypeId = parsePositive(body?.fuelTypeId);
  const pumpId = parsePositive(body?.pumpId);
  const meterStart = parseNonNegative(body?.meterStart);
  const pricePerLiter = parsePositive(body?.pricePerLiter);
  const meterEnd = body?.meterEnd !== undefined && body.meterEnd !== "" ? Number(body.meterEnd) : null;
  const date = parseDate(body?.date);
  const expectedShiftId = body?.expectedShiftId === undefined ? undefined : Number(body.expectedShiftId);

  if (!fuelTypeId || !Number.isInteger(fuelTypeId) || !pumpId || !Number.isInteger(pumpId) || meterStart === null || !pricePerLiter || !date || (meterEnd !== null && (!Number.isFinite(meterEnd) || meterEnd <= meterStart))) {
    return NextResponse.json({ error: "ข้อมูลมิเตอร์ไม่ครบหรือไม่ถูกต้อง", code: METER_ERROR_CODES.INVALID_INPUT }, { status: 400 });
  }
  if (expectedShiftId !== undefined && (!Number.isInteger(expectedShiftId) || expectedShiftId <= 0)) {
    return NextResponse.json({ error: "กะอ้างอิงไม่ถูกต้อง", code: METER_ERROR_CODES.EXPECTED_SHIFT_INVALID }, { status: 400 });
  }

  try {
    const period = await prisma.$transaction(async (tx) => {
      const shift = expectedShiftId
        ? await tx.shift.findUnique({ where: { id: expectedShiftId } })
        : await tx.shift.findFirst({ where: { openedById: auth.user.id, status: "open" }, orderBy: { openedAt: "desc" } });
      if (!shift || shift.status !== "open" || shift.openedById !== auth.user.id) throw new Error(METER_ERROR_CODES.EXPECTED_SHIFT_NOT_OPEN);

      const pump = await tx.pump.findUnique({ where: { id: pumpId } });
      if (!pump || !pump.isActive) throw new Error(METER_ERROR_CODES.PUMP_NOT_FOUND);
      const fuelMatch = validatePumpFuel({ configuredFuelTypeId: pump.fuelTypeId, requestedFuelTypeId: fuelTypeId });
      if (!fuelMatch.ok) throw new Error(fuelMatch.code);

      const openPeriod = await tx.meterPeriod.findFirst({ where: { pumpId, meterEnd: null } });
      if (openPeriod) throw new Error(METER_ERROR_CODES.PUMP_METER_ALREADY_OPEN);

      const liters = meterEnd === null ? null : meterEnd - meterStart;
      return tx.meterPeriod.create({
        data: {
          date,
          fuelTypeId,
          pumpId,
          shiftId: shift.id,
          meterStart,
          meterEnd,
          liters,
          pricePerLiter,
          totalRevenue: liters === null ? null : liters * pricePerLiter,
          note: typeof body?.note === "string" ? body.note.trim() || null : null,
          openedById: auth.user.id,
          openedByName: auth.user.name,
          openedByEmail: auth.user.email,
          ...(meterEnd === null ? {} : {
            closedAt: new Date(),
            closedById: auth.user.id,
            closedByName: auth.user.name,
            closedByEmail: auth.user.email,
          }),
        },
        include: {
          fuelType: true,
          pump: true,
          shift: { select: { id: true, status: true, openedById: true, openedByName: true, closedAt: true } },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json(period, { status: 201 });
  } catch (error) {
    if (error instanceof Error && Object.values(METER_ERROR_CODES).includes(error.message as never)) {
      const status = error.message === METER_ERROR_CODES.PUMP_NOT_FOUND ? 404 : 409;
      return NextResponse.json({ error: meterErrorMessage(error.message), code: error.message }, { status });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: meterErrorMessage(METER_ERROR_CODES.PUMP_METER_ALREADY_OPEN), code: METER_ERROR_CODES.PUMP_METER_ALREADY_OPEN }, { status: 409 });
    }
    console.error("meter-periods POST error:", error);
    return NextResponse.json({ error: "เปิดมิเตอร์ไม่สำเร็จ" }, { status: 500 });
  }
}
