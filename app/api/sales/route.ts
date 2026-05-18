import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dateStr = searchParams.get("date");

  let where = {};
  if (dateStr) {
    const start = new Date(dateStr);
    start.setHours(0, 0, 0, 0);
    const end = new Date(dateStr);
    end.setHours(23, 59, 59, 999);
    where = { date: { gte: start, lte: end } };
  }

  const sales = await prisma.sale.findMany({
    where,
    include: { fuelType: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(sales);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { sellerName, fuelTypeId, pumpNo, pricePerLiter, paymentMethod, customerName, note, date, totalAmount: rawTotal, meterStart, meterEnd } = body;

  const price = Number(pricePerLiter);
  if (!price || price <= 0) return NextResponse.json({ error: "ราคาต่อลิตรไม่ถูกต้อง" }, { status: 400 });

  let liters: number;
  let totalAmount: number;

  if (rawTotal !== undefined && rawTotal !== "") {
    totalAmount = Number(rawTotal);
    liters = totalAmount / price;
  } else if (meterStart !== undefined && meterEnd !== undefined) {
    liters = Number(meterEnd) - Number(meterStart);
    totalAmount = liters * price;
    if (liters <= 0) return NextResponse.json({ error: "มิเตอร์ปิดต้องมากกว่าเริ่ม" }, { status: 400 });
  } else {
    return NextResponse.json({ error: "กรอกยอดเงินหรือเลขมิเตอร์" }, { status: 400 });
  }

  const ftId = Number(fuelTypeId);

  const sale = await prisma.$transaction(async (tx) => {
    const s = await tx.sale.create({
      data: {
        date: date ? new Date(date) : new Date(),
        sellerName,
        fuelTypeId: ftId,
        pumpNo,
        meterStart: meterStart ? Number(meterStart) : null,
        meterEnd: meterEnd ? Number(meterEnd) : null,
        liters,
        pricePerLiter: price,
        totalAmount,
        paymentMethod,
        customerName: customerName || null,
        note: note || null,
      },
      include: { fuelType: true },
    });
    await tx.fuelStock.upsert({
      where: { fuelTypeId: ftId },
      create: { fuelTypeId: ftId, currentLiters: -liters },
      update: { currentLiters: { decrement: liters } },
    });
    return s;
  });

  return NextResponse.json(sale, { status: 201 });
}
