import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { PRODUCT_SALE_ERROR_CODES } from "@/lib/product-sale";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  let where = {};
  if (date) {
    const start = new Date(date + "T00:00:00+07:00");
    const end = new Date(date + "T23:59:59.999+07:00");
    where = { date: { gte: start, lte: end } };
  }
  const sales = await prisma.productSale.findMany({ where, include: { product: true }, orderBy: { createdAt: "desc" } });
  return NextResponse.json(sales);
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(["owner", "manager", "staff"]);
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const productId = Number(body?.productId);
  const quantity = Number(body?.quantity);
  const unitPrice = Number(body?.unitPrice);
  const totalAmount = Number(body?.totalAmount);
  const paymentMethod = String(body?.paymentMethod ?? "");
  const customerName = typeof body?.customerName === "string" ? body.customerName : null;
  const note = typeof body?.note === "string" ? body.note : null;
  const date = typeof body?.date === "string" ? body.date : null;
  if (!Number.isInteger(productId) || productId <= 0 || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice <= 0 || !Number.isFinite(totalAmount) || totalAmount <= 0 || !paymentMethod) {
    return NextResponse.json({ error: "ข้อมูลการขายสินค้าไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const sale = await prisma.$transaction(async (tx) => {
      const shift = await tx.shift.findFirst({ where: { openedById: auth.user.id, status: "open" }, orderBy: { openedAt: "desc" } });
      if (!shift) throw new Error("NO_OPEN_SHIFT");
      const product = await tx.product.findUnique({ where: { id: productId }, select: { costPrice: true, currentStock: true } });
      if (!product || product.currentStock < quantity) throw new Error(PRODUCT_SALE_ERROR_CODES.INSUFFICIENT_STOCK);
      const created = await tx.productSale.create({
        data: {
          productId,
          quantity,
          unitPrice,
          totalAmount,
          costPriceAtSale: product.costPrice > 0 ? product.costPrice : null,
          paymentMethod,
          sellerName: auth.user.name,
          customerName: customerName?.trim() || null,
          note: note?.trim() || null,
          date: date ? new Date(date) : new Date(),
          shiftId: shift.id,
        },
        include: { product: true },
      });
      await tx.product.update({ where: { id: productId }, data: { currentStock: { decrement: Math.round(quantity) } } });
      return created;
    });
    return NextResponse.json(sale, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "NO_OPEN_SHIFT") return NextResponse.json({ error: "กรุณาเปิดกะก่อนบันทึกการขาย", code: "NO_OPEN_SHIFT" }, { status: 409 });
    if (error instanceof Error && error.message === PRODUCT_SALE_ERROR_CODES.INSUFFICIENT_STOCK) return NextResponse.json({ error: "สินค้าไม่พอ", code: PRODUCT_SALE_ERROR_CODES.INSUFFICIENT_STOCK }, { status: 409 });
    console.error("product-sales POST error:", error);
    return NextResponse.json({ error: "บันทึกการขายสินค้าไม่สำเร็จ" }, { status: 500 });
  }
}
