import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const body = await req.json();

  if (body.action === "confirm") {
    const order = await prisma.saleOrder.findUnique({ where: { id } });
    if (!order) return NextResponse.json({ error: "ไม่พบการ์ด" }, { status: 404 });

    const liters = order.totalAmount / order.pricePerLiter;
    const now = new Date();

    const [sale] = await prisma.$transaction([
      prisma.sale.create({
        data: {
          date: now,
          sellerName: order.sellerName,
          fuelTypeId: order.fuelTypeId,
          pumpNo: order.pumpNo,
          liters,
          pricePerLiter: order.pricePerLiter,
          totalAmount: order.totalAmount,
          paymentMethod: order.paymentMethod,
          customerName: order.customerName,
          note: order.note,
        },
      }),
      prisma.saleOrder.update({ where: { id }, data: { status: "done" } }),
      prisma.fuelStock.updateMany({
        where: { fuelTypeId: order.fuelTypeId },
        data: { currentLiters: { decrement: liters } },
      }),
    ]);

    return NextResponse.json(sale);
  }

  if (body.action === "cancel") {
    await prisma.saleOrder.update({ where: { id }, data: { status: "cancelled" } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "action ไม่ถูกต้อง" }, { status: 400 });
}
