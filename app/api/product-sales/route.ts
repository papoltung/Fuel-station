import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  let where = {};
  if (date) {
    const start = new Date(date);
    const end = new Date(date);
    end.setDate(end.getDate() + 1);
    where = { date: { gte: start, lt: end } };
  }
  const sales = await prisma.productSale.findMany({
    where,
    include: { product: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(sales);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { productId, quantity, unitPrice, totalAmount, paymentMethod, sellerName, customerName, note, date } = body;
  if (!productId || !quantity || !paymentMethod || !sellerName) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const [sale] = await prisma.$transaction([
    prisma.productSale.create({
      data: {
        productId: Number(productId),
        quantity: Number(quantity),
        unitPrice: Number(unitPrice),
        totalAmount: Number(totalAmount),
        paymentMethod,
        sellerName,
        customerName: customerName || null,
        note: note || null,
        date: date ? new Date(date) : new Date(),
      },
      include: { product: true },
    }),
    prisma.product.update({
      where: { id: Number(productId) },
      data: { currentStock: { decrement: Math.round(quantity) } },
    }),
  ]);

  return NextResponse.json(sale, { status: 201 });
}
