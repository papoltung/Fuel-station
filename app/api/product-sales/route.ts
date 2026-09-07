import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  let where = {};
  if (date) {
    const start = new Date(date + "T00:00:00+07:00");
    const end = new Date(date + "T23:59:59.999+07:00");
    where = { date: { gte: start, lte: end } };
  }
  const sales = await prisma.productSale.findMany({
    where,
    include: { product: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(sales);
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(["owner", "manager", "staff"]);
  if (!auth.ok) return auth.response;
  const body = await req.json();
  const { productId, quantity, unitPrice, totalAmount, paymentMethod, customerName, note, date } = body;
  if (!productId || !quantity || !paymentMethod) {
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
        sellerName: auth.user.name,
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
