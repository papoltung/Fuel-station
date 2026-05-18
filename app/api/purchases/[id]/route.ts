import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!id) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });

    await prisma.$transaction(async (tx) => {
      const purchase = await tx.fuelPurchase.findUnique({ where: { id } });
      if (!purchase) throw new Error("ไม่พบรายการ");

      await tx.fuelPurchase.delete({ where: { id } });

      await tx.fuelStock.update({
        where: { fuelTypeId: purchase.fuelTypeId },
        data: { currentLiters: { decrement: purchase.liters } },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("purchases DELETE error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
