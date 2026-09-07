export const PAYMENT_METHODS = ["cash", "transfer", "credit"] as const;

type SaleInput = {
  clientRequestId?: unknown;
  sellerName?: unknown;
  fuelTypeId?: unknown;
  pumpNo?: unknown;
  pricePerLiter?: unknown;
  paymentMethod?: unknown;
  customerName?: unknown;
  note?: unknown;
  date?: unknown;
  totalAmount?: unknown;
  meterStart?: unknown;
  meterEnd?: unknown;
};

function finitePositive(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label}ไม่ถูกต้อง`);
  return number;
}

function optionalText(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

export function parseSaleInput(input: SaleInput) {
  const fuelTypeId = finitePositive(input.fuelTypeId, "ชนิดน้ำมัน");
  if (!Number.isInteger(fuelTypeId)) throw new Error("ชนิดน้ำมันไม่ถูกต้อง");

  const pricePerLiter = finitePositive(input.pricePerLiter, "ราคาต่อลิตร");
  const sellerName = optionalText(input.sellerName);
  const pumpNo = optionalText(input.pumpNo);
  if (!sellerName || !pumpNo) throw new Error("ข้อมูลผู้ขายหรือหัวจ่ายไม่ครบ");

  if (!PAYMENT_METHODS.includes(input.paymentMethod as (typeof PAYMENT_METHODS)[number])) {
    throw new Error("วิธีชำระเงินไม่ถูกต้อง");
  }
  const paymentMethod = input.paymentMethod as (typeof PAYMENT_METHODS)[number];
  const customerName = optionalText(input.customerName);
  if (paymentMethod === "credit" && !customerName) throw new Error("กรุณาระบุชื่อลูกค้าเครดิต");

  let totalAmount: number;
  let liters: number;
  let meterStart: number | null = null;
  let meterEnd: number | null = null;
  if (input.totalAmount !== undefined && input.totalAmount !== "") {
    totalAmount = finitePositive(input.totalAmount, "ยอดเงิน");
    liters = totalAmount / pricePerLiter;
  } else {
    meterStart = Number(input.meterStart);
    meterEnd = Number(input.meterEnd);
    if (!Number.isFinite(meterStart) || !Number.isFinite(meterEnd) || meterEnd <= meterStart) {
      throw new Error("มิเตอร์ปลายต้องมากกว่าเริ่ม");
    }
    liters = meterEnd - meterStart;
    totalAmount = liters * pricePerLiter;
  }

  const clientRequestId = optionalText(input.clientRequestId);
  if (!clientRequestId || clientRequestId.length > 100) throw new Error("รหัสรายการไม่ถูกต้อง");
  const date = optionalText(input.date) ?? undefined;
  if (date && Number.isNaN(new Date(date).getTime())) throw new Error("วันที่ไม่ถูกต้อง");

  return {
    clientRequestId,
    sellerName,
    fuelTypeId,
    pumpNo,
    pricePerLiter,
    totalAmount,
    liters,
    paymentMethod,
    customerName,
    note: optionalText(input.note),
    date,
    meterStart,
    meterEnd,
  };
}

type StoredSale = {
  clientRequestId: string | null;
  sellerName: string;
  fuelTypeId: number;
  pumpNo: string;
  pricePerLiter: number;
  totalAmount: number;
  liters: number;
  paymentMethod: string;
  customerName: string | null;
  note: string | null;
  date: Date;
  meterStart: number | null;
  meterEnd: number | null;
};

export function isSameSaleRequest(existing: StoredSale, input: ReturnType<typeof parseSaleInput>) {
  return existing.clientRequestId === input.clientRequestId
    && existing.fuelTypeId === input.fuelTypeId
    && existing.sellerName === input.sellerName
    && existing.pumpNo === input.pumpNo
    && existing.pricePerLiter === input.pricePerLiter
    && existing.totalAmount === input.totalAmount
    && existing.liters === input.liters
    && existing.paymentMethod === input.paymentMethod
    && existing.customerName === input.customerName
    && existing.note === input.note
    && existing.meterStart === input.meterStart
    && existing.meterEnd === input.meterEnd
    && (!input.date || existing.date.getTime() === new Date(input.date).getTime());
}
