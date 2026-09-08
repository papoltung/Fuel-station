export type MeterContextResult =
  | { ok: true }
  | { ok: false; code: "EXPECTED_SHIFT_NOT_OPEN" | "EXPECTED_PUMP_MISMATCH" };

export const METER_ERROR_CODES = {
  INVALID_INPUT: "METER_INVALID_INPUT",
  EXPECTED_SHIFT_INVALID: "EXPECTED_SHIFT_INVALID",
  EXPECTED_SHIFT_NOT_OPEN: "EXPECTED_SHIFT_NOT_OPEN",
  EXPECTED_PUMP_MISMATCH: "EXPECTED_PUMP_MISMATCH",
  PUMP_NOT_FOUND: "PUMP_NOT_FOUND",
  PUMP_METER_ALREADY_OPEN: "PUMP_METER_ALREADY_OPEN",
  PUMP_FUEL_NOT_CONFIGURED: "PUMP_FUEL_NOT_CONFIGURED",
  METER_FUEL_MISMATCH: "METER_FUEL_MISMATCH",
  NO_OPEN_METER: "NO_OPEN_METER",
} as const;

export function validatePumpFuel(input: {
  configuredFuelTypeId: number | null;
  requestedFuelTypeId: number;
}) {
  if (input.configuredFuelTypeId === null) return { ok: false as const, code: METER_ERROR_CODES.PUMP_FUEL_NOT_CONFIGURED };
  if (input.configuredFuelTypeId !== input.requestedFuelTypeId) return { ok: false as const, code: METER_ERROR_CODES.METER_FUEL_MISMATCH };
  return { ok: true as const };
}

export function resolveOpenMeterFuel(input: {
  openMeterFuelTypeId: number | null;
  requestedFuelTypeId: number;
}) {
  if (input.openMeterFuelTypeId === null) return { ok: false as const, code: METER_ERROR_CODES.NO_OPEN_METER };
  if (input.openMeterFuelTypeId !== input.requestedFuelTypeId) return { ok: false as const, code: METER_ERROR_CODES.METER_FUEL_MISMATCH };
  return { ok: true as const };
}

export function canCloseMeter(input: {
  actorId: number;
  actorRole: string;
  shiftOwnerId: number;
  shiftStatus: string;
  meterEnd: number | null;
}) {
  if (input.shiftStatus !== "open" || input.meterEnd !== null) return false;
  return input.actorRole === "owner" || input.actorId === input.shiftOwnerId;
}

export function resolveMeterContext(input: {
  expectedShiftId: number;
  expectedPumpId: number;
  shiftId: number;
  pumpId: number;
}): MeterContextResult {
  if (input.expectedShiftId !== input.shiftId) return { ok: false, code: "EXPECTED_SHIFT_NOT_OPEN" };
  if (input.expectedPumpId !== input.pumpId) return { ok: false, code: "EXPECTED_PUMP_MISMATCH" };
  return { ok: true };
}
