import { canCloseMeter, METER_ERROR_CODES } from "./meter-context";

export const METER_CLOSE_ERROR_CODES = {
  NOT_FOUND: "NOT_FOUND",
  METER_CONTEXT_REQUIRED: "METER_CONTEXT_REQUIRED",
  METER_ALREADY_CLOSED: "METER_ALREADY_CLOSED",
  METER_FORBIDDEN: "METER_FORBIDDEN",
  INVALID_INPUT: METER_ERROR_CODES.INVALID_INPUT,
} as const;

export type MeterCloseError = (typeof METER_CLOSE_ERROR_CODES)[keyof typeof METER_CLOSE_ERROR_CODES];

export interface MeterPeriodRecord {
  id: number;
  date: Date;
  fuelTypeId: number;
  pumpId: number | null;
  meterStart: number;
  meterEnd: number | null;
  liters: number | null;
  pricePerLiter: number;
  totalRevenue: number | null;
  note: string | null;
  openedById: number | null;
  openedByName: string | null;
  openedByEmail: string | null;
  closedById: number | null;
  closedByName: string | null;
  closedByEmail: string | null;
  closedAt: Date | null;
}

export interface MeterCloseActor {
  id: number;
  role: string;
  name: string;
  email: string;
}

export interface MeterCloseInput {
  id: number;
  meterEnd: number;
}

export function parseMeterCloseInput(raw: { id: unknown; meterEnd: unknown }): { ok: true; input: MeterCloseInput } | { ok: false; error: string; code: string } {
  const id = Number(raw.id);
  const meterEnd = Number(raw.meterEnd);

  if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(meterEnd) || meterEnd < 0) {
    return { ok: false, error: "เลขมิเตอร์ไม่ถูกต้อง", code: METER_CLOSE_ERROR_CODES.INVALID_INPUT };
  }

  return { ok: true, input: { id, meterEnd } };
}

export function validateMeterClosePreconditions(
  existing: MeterPeriodRecord | null,
  actor: MeterCloseActor,
  proposedEnd: number
): { ok: true; liters: number; totalRevenue: number } | { ok: false; error: string; code: MeterCloseError; status: number } {
  if (!existing) {
    return { ok: false, error: "ไม่พบรายการมิเตอร์", code: METER_CLOSE_ERROR_CODES.NOT_FOUND, status: 404 };
  }

  if (existing.pumpId === null || existing.openedById === null) {
    return {
      ok: false,
      error: "รายการเก่าไม่มีข้อมูลผู้เปิดหรือหัวจ่าย จึงปิดรายการไม่ได้",
      code: METER_CLOSE_ERROR_CODES.METER_CONTEXT_REQUIRED,
      status: 409,
    };
  }

  if (existing.meterEnd !== null) {
    return {
      ok: false,
      error: "รอบมิเตอร์นี้ปิดไปแล้ว กรุณาโหลดหน้าใหม่",
      code: METER_CLOSE_ERROR_CODES.METER_ALREADY_CLOSED,
      status: 409,
    };
  }

  if (!canCloseMeter({ actorId: actor.id, actorRole: actor.role, openedById: existing.openedById, meterEnd: existing.meterEnd })) {
    return {
      ok: false,
      error: "มีเฉพาะผู้เปิดรอบหรือ Owner เท่านั้นที่ปิดมิเตอร์ได้",
      code: METER_CLOSE_ERROR_CODES.METER_FORBIDDEN,
      status: 403,
    };
  }

  if (proposedEnd <= existing.meterStart) {
    return {
      ok: false,
      error: "มิเตอร์ปลายต้องมากกว่ามิเตอร์ต้น",
      code: METER_CLOSE_ERROR_CODES.INVALID_INPUT,
      status: 400,
    };
  }

  const liters = proposedEnd - existing.meterStart;
  const totalRevenue = liters * existing.pricePerLiter;

  return { ok: true, liters, totalRevenue };
}
