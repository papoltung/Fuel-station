import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get("date");
    const where = date ? {
      date: { gte: new Date(`${date}T00:00:00+07:00`), lte: new Date(`${date}T23:59:59.999+07:00`) },
    } : undefined;
    const periods = await prisma.meterPeriod.findMany({
      where,
      include: { fuelType: true },
      orderBy: { date: "desc" },
      take: 100,
    });
    return NextResponse.json(periods);
  } catch (e) {
    console.error("meter-periods GET error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fuelTypeId, meterStart, meterEnd, pricePerLiter, note, date } = body;

    const ftId = Number(fuelTypeId);
    const start = Number(meterStart);
    const price = Number(pricePerLiter);
    const end = meterEnd !== undefined && meterEnd !== "" ? Number(meterEnd) : null;

    if (!ftId || isNaN(start) || price <= 0) {
      return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
    }
    if (end !== null && end <= start) {
      return NextResponse.json({ error: "มิเตอร์ปลายต้องมากกว่าต้น" }, { status: 400 });
    }

    const liters = end !== null ? end - start : null;
    const totalRevenue = liters !== null ? liters * price : null;

    const period = await prisma.meterPeriod.create({
      data: {
        date: date ? new Date(date) : new Date(),
        fuelTypeId: ftId,
        meterStart: start,
        meterEnd: end,
        liters,
        pricePerLiter: price,
        totalRevenue,
        note: note || null,
      },
      include: { fuelType: true },
    });

    return NextResponse.json(period, { status: 201 });
  } catch (e) {
    console.error("meter-periods POST error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
