import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const purchases = await prisma.fuelPurchase.findMany({
      include: { fuelType: true, audits: { orderBy: { createdAt: "desc" }, take: 3 } },
      orderBy: { date: "desc" },
      take: 50,
    });
    return NextResponse.json(purchases);
  } catch (e) {
    console.error("purchases GET error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fuelTypeId, liters, costPerLiter, invoiceNo, supplier, note, date, isPaid, paidNote } = body;

    const ftId = Number(fuelTypeId);
    const ltr = Number(liters);
    const cost = Number(costPerLiter);

    if (!ftId || ltr <= 0 || cost <= 0) {
      return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
    }

    const purchase = await prisma.$transaction(async (tx) => {
      const p = await tx.fuelPurchase.create({
        data: {
          date: date ? new Date(date) : new Date(),
          fuelTypeId: ftId,
          liters: ltr,
          costPerLiter: cost,
          totalCost: ltr * cost,
          invoiceNo: invoiceNo || null,
          supplier: supplier || null,
          note: note || null,
          isPaid: isPaid !== false,
          paidNote: paidNote || null,
        },
        include: { fuelType: true },
      });
      await tx.fuelStock.upsert({
        where: { fuelTypeId: ftId },
        create: { fuelTypeId: ftId, currentLiters: ltr },
        update: { currentLiters: { increment: ltr } },
      });
      return p;
    });

    return NextResponse.json(purchase, { status: 201 });
  } catch (e) {
    console.error("purchases POST error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
