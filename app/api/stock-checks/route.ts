import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const checks = await prisma.stockCheck.findMany({
      include: { fuelType: true },
      orderBy: { date: "desc" },
      take: 30,
    });
    return NextResponse.json(checks);
  } catch (e) {
    console.error("stock-checks GET error:", e);
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fuelTypeId, actualLiters, note, date } = body;

    const ftId = Number(fuelTypeId);
    const actual = Number(actualLiters);

    if (!ftId || isNaN(actual)) {
      return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
    }

    const stock = await prisma.fuelStock.findUnique({ where: { fuelTypeId: ftId } });
    const systemLiters = stock?.currentLiters ?? 0;
    const difference = actual - systemLiters;

    const check = await prisma.$transaction(async (tx) => {
      const c = await tx.stockCheck.create({
        data: {
          date: date ? new Date(date) : new Date(),
          fuelTypeId: ftId,
          systemLiters,
          actualLiters: actual,
          difference,
          note: note || null,
        },
        include: { fuelType: true },
      });
      // อัพเดตสต๊อกให้ตรงกับที่วัดจริง
      await tx.fuelStock.upsert({
        where: { fuelTypeId: ftId },
        create: { fuelTypeId: ftId, currentLiters: actual },
        update: { currentLiters: actual },
      });
      return c;
    });

    return NextResponse.json(check, { status: 201 });
  } catch (e) {
    console.error("stock-checks POST error:", e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}
