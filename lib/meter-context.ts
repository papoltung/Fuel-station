export const METER_ERROR_CODES = {
  INVALID_INPUT: "METER_INVALID_INPUT",
  EXPECTED_PUMP_MISMATCH: "EXPECTED_PUMP_MISMATCH",
  PUMP_NOT_FOUND: "PUMP_NOT_FOUND",
  PUMP_METER_ALREADY_OPEN: "PUMP_METER_ALREADY_OPEN",
  PUMP_FUEL_NOT_CONFIGURED: "PUMP_FUEL_NOT_CONFIGURED",
  METER_FUEL_MISMATCH: "METER_FUEL_MISMATCH",
} as const;

export function validatePumpFuel(input: {
  configuredFuelTypeId: number | null;
  requestedFuelTypeId: number;
}) {
  if (input.configuredFuelTypeId === null) return { ok: false as const, code: METER_ERROR_CODES.PUMP_FUEL_NOT_CONFIGURED };
  if (input.configuredFuelTypeId !== input.requestedFuelTypeId) return { ok: false as const, code: METER_ERROR_CODES.METER_FUEL_MISMATCH };
  return { ok: true as const };
}

export function canCloseMeter(input: {
  actorId: number;
  actorRole: string;
  openedById?: number | null;
  shiftOwnerId?: number;
  shiftStatus?: string;
  meterEnd: number | null;
}) {
  if (input.meterEnd !== null || input.shiftStatus === "closed") return false;
  const ownerId = input.openedById ?? input.shiftOwnerId;
  return input.actorRole === "owner" || input.actorId === ownerId;
}
