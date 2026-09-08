import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["owner"]);
  if (!auth.ok) return auth.response;
  try {
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!id) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
    const body = await req.json();
    const cost = body.costPerLiter === undefined ? undefined : Number(body.costPerLiter);
    const reason = String(body.reason ?? "").trim();
    if (cost !== undefined && (!Number.isFinite(cost) || cost <= 0 || !reason)) return NextResponse.json({ error: "กรอกราคาทุนและเหตุผลให้ถูกต้อง" }, { status: 400 });
    const updated = await prisma.$transaction(async tx => {
      const existing = await tx.fuelPurchase.findUnique({ where: { id } });
      if (!existing) throw new Error("ไม่พบรายการ");
      const purchase = await tx.fuelPurchase.update({ where: { id }, data: {
        isPaid: body.isPaid ?? existing.isPaid, paidNote: body.paidNote ?? existing.paidNote,
        ...(cost === undefined ? {} : { costPerLiter: cost, totalCost: existing.liters * cost }),
      }, include: { fuelType: true } });
      if (cost !== undefined && cost !== existing.costPerLiter) await tx.fuelPurchaseAudit.create({ data: {
        fuelPurchaseId: id, actorId: auth.user.id, actorName: auth.user.name, actorEmail: auth.user.email,
        oldCost: existing.costPerLiter, newCost: cost, reason: reason.slice(0, 300),
      } });
      return purchase;
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
