import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  try {
    const { id, paymentId } = await params;
    const payment = await prisma.supplierDebtPayment.findUnique({ where: { id: Number(paymentId) } });
    if (!payment) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });

    await prisma.$transaction(async (tx) => {
      await tx.supplierDebtPayment.delete({ where: { id: Number(paymentId) } });
      // คืนยอดกลับ
      await tx.supplierDebt.update({
        where: { id: Number(id) },
        data: { amount: { increment: payment.amount }, isPaid: false, paidAt: null },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
