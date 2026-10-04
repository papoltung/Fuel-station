import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import {
  PRODUCT_SALE_ERROR_CODES,
  parseProductSaleInput,
  isSameProductSaleRequest,
} from "@/lib/product-sale";

export async function GET(req: NextRequest) {
  const auth = await requireRole(["owner", "manager", "staff"]);
  if (!auth.ok) return auth.response;

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

  let input: ReturnType<typeof parseProductSaleInput>;
  try {
    const body = await req.json().catch(() => null);
    input = parseProductSaleInput(body, auth.user.name);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "ข้อมูลการขายสินค้าไม่ถูกต้อง" },
      { status: 400 }
    );
  }

  // Pre-check for existing clientRequestId (fast path for sequential retries)
  if (input.clientRequestId) {
    const existing = await prisma.productSale.findUnique({
      where: { clientRequestId: input.clientRequestId },
      include: { product: true },
    });
    if (existing) {
      if (isSameProductSaleRequest(existing, input)) {
        return NextResponse.json(existing, {
          status: 200,
          headers: { "Idempotent-Replay": "true" },
        });
      }
      return NextResponse.json({ error: "รหัสรายการนี้ถูกใช้กับข้อมูลอื่นแล้ว" }, { status: 409 });
    }
  }

  try {
    const roundedQty = Math.round(input.quantity);
    const sale = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: input.productId },
        select: { costPrice: true },
      });
      if (!product) throw new Error("PRODUCT_NOT_FOUND");

      // 1. Create ProductSale first (claims clientRequestId; if concurrent duplicate, hits P2002 before touching stock)
      const created = await tx.productSale.create({
        data: {
          clientRequestId: input.clientRequestId,
          productId: input.productId,
          quantity: input.quantity,
          unitPrice: input.unitPrice,
          totalAmount: input.totalAmount,
          costPriceAtSale: product.costPrice > 0 ? product.costPrice : null,
          paymentMethod: input.paymentMethod,
          sellerName: input.sellerName,
          customerName: input.customerName,
          note: input.note,
          date: input.date ?? new Date(),
        },
      });

      // 2. Conditional atomic stock decrement: stock must be >= roundedQty
      const stockUpdate = await tx.product.updateMany({
        where: {
          id: input.productId,
          currentStock: { gte: roundedQty },
        },
        data: {
          currentStock: { decrement: roundedQty },
        },
      });

      if (stockUpdate.count !== 1) {
        throw new Error(PRODUCT_SALE_ERROR_CODES.INSUFFICIENT_STOCK);
      }

      // 3. Re-read ProductSale with fresh post-decrement product relation
      const freshSale = await tx.productSale.findUnique({
        where: { id: created.id },
        include: { product: true },
      });

      return freshSale!;
    });

    return NextResponse.json(sale, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === PRODUCT_SALE_ERROR_CODES.INSUFFICIENT_STOCK) {
      return NextResponse.json(
        { error: "สินค้าไม่พอ", code: PRODUCT_SALE_ERROR_CODES.INSUFFICIENT_STOCK },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === "PRODUCT_NOT_FOUND") {
      return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });
    }
    // Concurrency race: P2002 Unique constraint violation on clientRequestId
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      if (input.clientRequestId) {
        const existing = await prisma.productSale.findUnique({
          where: { clientRequestId: input.clientRequestId },
          include: { product: true },
        });
        if (existing) {
          if (isSameProductSaleRequest(existing, input)) {
            return NextResponse.json(existing, {
              status: 200,
              headers: { "Idempotent-Replay": "true" },
            });
          }
          return NextResponse.json({ error: "รหัสรายการนี้ถูกใช้กับข้อมูลอื่นแล้ว" }, { status: 409 });
        }
      }
    }

    console.error("product-sales POST error:", error);
    return NextResponse.json({ error: "บันทึกการขายสินค้าไม่สำเร็จ" }, { status: 500 });
  }
}
