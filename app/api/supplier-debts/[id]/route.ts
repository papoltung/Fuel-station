import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const debt = await prisma.supplierDebt.findUnique({ where: { id: Number(id) } });
    if (!debt) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });

    const updated = await prisma.$transaction(async (tx) => {
      if (body.partialAmount !== undefined) {
        const paid = Number(body.partialAmount);
        const remaining = debt.amount - paid;
        await tx.supplierDebtPayment.create({ data: { debtId: Number(id), amount: paid, note: body.paidNote || null } });
        return tx.supplierDebt.update({
          where: { id: Number(id) },
          data: remaining <= 0
            ? { amount: 0, isPaid: true, paidAt: new Date() }
            : { amount: remaining },
          include: { payments: { orderBy: { paidAt: "asc" } } },
        });
      } else {
        await tx.supplierDebtPayment.create({ data: { debtId: Number(id), amount: debt.amount, note: body.paidNote || null } });
        return tx.supplierDebt.update({
          where: { id: Number(id) },
          data: { isPaid: true, paidAt: new Date(), paidNote: body.paidNote || null },
          include: { payments: { orderBy: { paidAt: "asc" } } },
        });
      }
    });
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.supplierDebt.delete({ where: { id: Number(id) } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
