import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!id) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });

    await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({ where: { id } });
      if (!sale) throw new Error("ไม่พบรายการ");

      await tx.sale.delete({ where: { id } });

      // คืนลิตรกลับสต๊อก
      await tx.fuelStock.update({
        where: { fuelTypeId: sale.fuelTypeId },
        data: { currentLiters: { increment: sale.liters } },
      }).catch(() => {}); // ถ้าไม่มี stock record ก็ข้ามไป
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("sales DELETE error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
