import { PAYMENT_METHODS } from "@/lib/sale-input";

export const PRODUCT_SALE_ERROR_CODES = {
  INSUFFICIENT_STOCK: "INSUFFICIENT_STOCK",
} as const;

export function normalizeOptionalText(value?: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

export type ProductSaleInput = {
  clientRequestId?: unknown;
  productId?: unknown;
  quantity?: unknown;
  unitPrice?: unknown;
  totalAmount?: unknown;
  paymentMethod?: unknown;
  customerName?: unknown;
  note?: unknown;
  date?: unknown;
};

export type ParsedProductSaleInput = {
  clientRequestId: string | null;
  productId: number;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  paymentMethod: string;
  customerName: string | null;
  note: string | null;
  date: Date | null;
  sellerName: string;
};

function finitePositive(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label}ไม่ถูกต้อง`);
  return number;
}

export function parseProductSaleInput(raw: unknown, sellerName: string): ParsedProductSaleInput {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const productId = finitePositive(body.productId, "รหัสสินค้า");
  if (!Number.isInteger(productId)) throw new Error("รหัสสินค้าไม่ถูกต้อง");

  const quantity = finitePositive(body.quantity, "จำนวนสินค้า");
  const unitPrice = finitePositive(body.unitPrice, "ราคาสินค้า");

  let totalAmount: number;
  if (body.totalAmount !== undefined && body.totalAmount !== null && body.totalAmount !== "") {
    totalAmount = finitePositive(body.totalAmount, "ยอดเงินรวม");
  } else {
    totalAmount = quantity * unitPrice;
  }

  const rawPaymentMethod = String(body.paymentMethod ?? "").trim();
  if (!PAYMENT_METHODS.includes(rawPaymentMethod as (typeof PAYMENT_METHODS)[number])) {
    throw new Error("วิธีชำระเงินไม่ถูกต้อง");
  }
  const paymentMethod = rawPaymentMethod;

  const customerName = normalizeOptionalText(body.customerName);
  if (paymentMethod === "credit" && !customerName) {
    throw new Error("กรุณาระบุชื่อลูกค้าเครดิต");
  }

  const note = normalizeOptionalText(body.note);
  const clientRequestId = normalizeOptionalText(body.clientRequestId);

  let date: Date | null = null;
  if (body.date !== undefined && body.date !== null && body.date !== "") {
    date = new Date(String(body.date));
    if (Number.isNaN(date.getTime())) throw new Error("วันที่ไม่ถูกต้อง");
  }

  const normalizedSeller = sellerName.trim();
  if (!normalizedSeller) throw new Error("ข้อมูลผู้ขายไม่ครบ");

  return {
    clientRequestId,
    productId,
    quantity,
    unitPrice,
    totalAmount,
    paymentMethod,
    customerName,
    note,
    date,
    sellerName: normalizedSeller,
  };
}

export type StoredProductSale = {
  productId: number;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  paymentMethod: string;
  customerName: string | null;
  note: string | null;
  sellerName: string;
  date: Date;
};

export function isSameProductSaleRequest(
  existing: StoredProductSale,
  input: ParsedProductSaleInput
): boolean {
  return (
    existing.productId === input.productId &&
    existing.quantity === input.quantity &&
    existing.unitPrice === input.unitPrice &&
    existing.totalAmount === input.totalAmount &&
    existing.paymentMethod === input.paymentMethod &&
    normalizeOptionalText(existing.customerName) === input.customerName &&
    normalizeOptionalText(existing.note) === input.note &&
    existing.sellerName === input.sellerName &&
    (!input.date || existing.date.getTime() === input.date.getTime())
  );
}
