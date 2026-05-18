import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idStr } = await params;
    const id = Number(idStr);
    const body = await req.json();
    const { meterEnd } = body;
    const end = Number(meterEnd);

    const existing = await prisma.meterPeriod.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });
    if (end <= existing.meterStart) return NextResponse.json({ error: "มิเตอร์ปลายต้องมากกว่าต้น" }, { status: 400 });

    const liters = end - existing.meterStart;
    const totalRevenue = liters * existing.pricePerLiter;

    const updated = await prisma.meterPeriod.update({
      where: { id },
      data: { meterEnd: end, liters, totalRevenue },
      include: { fuelType: true },
    });
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!id) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
    await prisma.meterPeriod.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
