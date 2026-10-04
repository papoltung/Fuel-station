export const SALE_MUTATION_ERROR_CODES = {
  SALE_CHANGED: "SALE_CHANGED",
  SALE_CANCELLED: "SALE_CANCELLED",
  VERSION_REQUIRED: "VERSION_REQUIRED",
  SALE_NOT_FOUND: "SALE_NOT_FOUND",
  INSUFFICIENT_FUEL_STOCK: "INSUFFICIENT_FUEL_STOCK",
} as const;

export type SaleEditInput = {
  id: unknown;
  expectedVersion?: unknown;
  fuelTypeId: unknown;
  totalAmount: unknown;
  pricePerLiter: unknown;
  paymentMethod: unknown;
  pumpNo: unknown;
  customerName?: unknown;
  note?: unknown;
  reason: unknown;
};

export type ParsedSaleEditInput = {
  id: number;
  expectedVersion: number | null;
  fuelTypeId: number;
  totalAmount: number;
  pricePerLiter: number;
  liters: number;
  paymentMethod: string;
  pumpNo: string;
  customerName: string | null;
  note: string | null;
  reason: string;
};

export type SaleCancelInput = {
  id: unknown;
  expectedVersion?: unknown;
  reason: unknown;
};

export type ParsedSaleCancelInput = {
  id: number;
  expectedVersion: number | null;
  reason: string;
};

const VALID_PAYMENT_METHODS = ["cash", "transfer", "credit", "qr"] as const;

export function parseSaleEditInput(raw: unknown): ParsedSaleEditInput {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("เลขรายการไม่ถูกต้อง");
  }

  let expectedVersion: number | null = null;
  if (body.expectedVersion !== undefined && body.expectedVersion !== null && body.expectedVersion !== "") {
    if (typeof body.expectedVersion !== "number" && typeof body.expectedVersion !== "string") {
      throw new Error("เวอร์ชันรายการขายไม่ถูกต้อง");
    }
    const rawStr = typeof body.expectedVersion === "string" ? body.expectedVersion.trim() : null;
    const version = rawStr !== null ? Number(rawStr) : Number(body.expectedVersion);
    if (!Number.isInteger(version) || version < 0) {
      throw new Error("เวอร์ชันรายการขายไม่ถูกต้อง");
    }
    expectedVersion = version;
  }

  const fuelTypeId = Number(body.fuelTypeId);
  if (!Number.isInteger(fuelTypeId) || fuelTypeId <= 0) {
    throw new Error("รหัสชนิดน้ำมันไม่ถูกต้อง");
  }

  const totalAmount = Number(body.totalAmount);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    throw new Error("ยอดเงินไม่ถูกต้อง");
  }

  const pricePerLiter = Number(body.pricePerLiter);
  if (!Number.isFinite(pricePerLiter) || pricePerLiter <= 0) {
    throw new Error("ราคาต่อลิตรไม่ถูกต้อง");
  }

  const paymentMethod = String(body.paymentMethod ?? "");
  if (!VALID_PAYMENT_METHODS.includes(paymentMethod as (typeof VALID_PAYMENT_METHODS)[number])) {
    throw new Error("วิธีชำระเงินไม่ถูกต้อง");
  }

  const pumpNo = String(body.pumpNo ?? "").trim().slice(0, 80);
  if (!pumpNo) {
    throw new Error("กรุณาระบุหัวจ่าย");
  }

  const reason = String(body.reason ?? "").trim().slice(0, 300);
  if (!reason) {
    throw new Error("กรุณาระบุเหตุผลที่แก้ไข");
  }

  const customerName = typeof body.customerName === "string" && body.customerName.trim() ? body.customerName.trim().slice(0, 200) : null;
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;
  const liters = totalAmount / pricePerLiter;

  return {
    id,
    expectedVersion,
    fuelTypeId,
    totalAmount,
    pricePerLiter,
    liters,
    paymentMethod,
    pumpNo,
    customerName,
    note,
    reason,
  };
}

export function parseSaleCancelInput(raw: unknown): ParsedSaleCancelInput {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("เลขรายการไม่ถูกต้อง");
  }

  let expectedVersion: number | null = null;
  if (body.expectedVersion !== undefined && body.expectedVersion !== null && body.expectedVersion !== "") {
    if (typeof body.expectedVersion !== "number" && typeof body.expectedVersion !== "string") {
      throw new Error("เวอร์ชันรายการขายไม่ถูกต้อง");
    }
    const rawStr = typeof body.expectedVersion === "string" ? body.expectedVersion.trim() : null;
    const version = rawStr !== null ? Number(rawStr) : Number(body.expectedVersion);
    if (!Number.isInteger(version) || version < 0) {
      throw new Error("เวอร์ชันรายการขายไม่ถูกต้อง");
    }
    expectedVersion = version;
  }

  const reason = String(body.reason ?? "").trim().slice(0, 300);
  if (!reason) {
    throw new Error("กรุณาระบุเหตุผลที่ยกเลิก");
  }

  return {
    id,
    expectedVersion,
    reason,
  };
}
