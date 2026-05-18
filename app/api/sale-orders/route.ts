import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const orders = await prisma.saleOrder.findMany({
    where: { status: "pending" },
    include: { fuelType: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(orders);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { fuelTypeId, pumpNo, totalAmount, pricePerLiter, paymentMethod, sellerName, customerName, note } = body;
  if (!fuelTypeId || !totalAmount || !pricePerLiter || !sellerName) {
    return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
  }
  const order = await prisma.saleOrder.create({
    data: {
      fuelTypeId: Number(fuelTypeId),
      pumpNo: pumpNo ?? "หัวจ่าย 1",
      totalAmount: Number(totalAmount),
      pricePerLiter: Number(pricePerLiter),
      paymentMethod: paymentMethod ?? "cash",
      sellerName,
      customerName: customerName || null,
      note: note || null,
    },
    include: { fuelType: true },
  });
  return NextResponse.json(order, { status: 201 });
}
