export const STOCK_CHECK_ERROR_CODES = {
  STOCK_CHANGED_DURING_CHECK: "STOCK_CHANGED_DURING_CHECK",
  VERSION_REQUIRED: "VERSION_REQUIRED",
  FUEL_STOCK_NOT_INITIALIZED: "FUEL_STOCK_NOT_INITIALIZED",
} as const;

export type StockCheckInput = {
  fuelTypeId: unknown;
  actualLiters: unknown;
  expectedSystemLiters?: unknown;
  expectedVersion?: unknown;
  note?: unknown;
  date?: unknown;
};

export type ParsedStockCheckInput = {
  fuelTypeId: number;
  actualLiters: number;
  expectedSystemLiters: number | null;
  expectedVersion: number | null;
  note: string | null;
  date: Date;
};

export function parseStockCheckInput(raw: unknown): ParsedStockCheckInput {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const fuelTypeId = Number(body.fuelTypeId);
  if (!Number.isInteger(fuelTypeId) || fuelTypeId <= 0) {
    throw new Error("รหัสชนิดน้ำมันไม่ถูกต้อง");
  }

  const actualLiters = Number(body.actualLiters);
  if (!Number.isFinite(actualLiters) || actualLiters < 0) {
    throw new Error("จำนวนลิตรที่วัดได้จริงไม่ถูกต้อง");
  }

  let expectedSystemLiters: number | null = null;
  if (body.expectedSystemLiters !== undefined && body.expectedSystemLiters !== null && body.expectedSystemLiters !== "") {
    const expected = Number(body.expectedSystemLiters);
    if (!Number.isFinite(expected)) throw new Error("จำนวนลิตรในระบบที่อ้างอิงไม่ถูกต้อง");
    expectedSystemLiters = expected;
  }

  let expectedVersion: number | null = null;
  if (body.expectedVersion !== undefined && body.expectedVersion !== null && body.expectedVersion !== "") {
    if (typeof body.expectedVersion !== "number" && typeof body.expectedVersion !== "string") {
      throw new Error("เวอร์ชันสต็อกไม่ถูกต้อง");
    }
    const rawStr = typeof body.expectedVersion === "string" ? body.expectedVersion.trim() : null;
    const version = rawStr !== null ? Number(rawStr) : Number(body.expectedVersion);
    if (!Number.isInteger(version) || version < 0) {
      throw new Error("เวอร์ชันสต็อกไม่ถูกต้อง");
    }
    expectedVersion = version;
  }

  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;

  let date = new Date();
  if (body.date !== undefined && body.date !== null && body.date !== "") {
    date = new Date(String(body.date));
    if (Number.isNaN(date.getTime())) throw new Error("วันที่ไม่ถูกต้อง");
  }

  return {
    fuelTypeId,
    actualLiters,
    expectedSystemLiters,
    expectedVersion,
    note,
    date,
  };
}
