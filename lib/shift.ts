export type ShiftStatus = "open" | "closed";

export function calculateShiftClose(input: {
  openingCash: number;
  cashSales: number;
  actualCash: number;
}) {
  const expectedCash = input.openingCash + input.cashSales;
  return {
    cashSales: input.cashSales,
    expectedCash,
    // Keep sub-satang mismatches visible while normalising IEEE-754 noise.
    difference: Math.round((input.actualCash - expectedCash) * 1_000_000) / 1_000_000,
  };
}

export function canCloseShift(input: {
  actorRole: string;
  actorId: number;
  openedById: number;
  status: ShiftStatus | string;
}) {
  if (input.status !== "open") return false;
  return input.actorRole === "owner" || input.actorId === input.openedById;
}

export function parseOpeningCash(input: { openingCash: unknown }):
  | { value: number; error?: undefined }
  | { value?: undefined; error: "INVALID_OPENING_CASH" } {
  if (typeof input.openingCash !== "number" || !Number.isFinite(input.openingCash) || input.openingCash < 0) {
    return { error: "INVALID_OPENING_CASH" };
  }
  return { value: input.openingCash };
}
