import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { PAYMENT_METHODS } from "@/lib/sale-input";
import { saleSnapshot } from "@/lib/sale-audit";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  const auth = await requireRole(["owner", "manager"]); if (!auth.ok) return auth.response;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "เลขรายการไม่ถูกต้อง" }, { status: 400 });
  const sale = await prisma.sale.findUnique({ where: { id }, include: { fuelType: true } });
  return sale ? NextResponse.json(sale) : NextResponse.json({ error: "ไม่พบรายการขาย" }, { status: 404 });
}

export async function PATCH(request: NextRequest, { params }: Context) {
  const auth = await requireRole(["owner", "manager"]); if (!auth.ok) return auth.response;
  const id = Number((await params).id);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const totalAmount = Number(body?.totalAmount), fuelTypeId = Number(body?.fuelTypeId), pricePerLiter = Number(body?.pricePerLiter);
  const paymentMethod = String(body?.paymentMethod ?? ""), pumpNo = String(body?.pumpNo ?? "").trim().slice(0, 80), reason = String(body?.reason ?? "").trim().slice(0, 300);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(fuelTypeId) || fuelTypeId <= 0 || !Number.isFinite(totalAmount) || totalAmount <= 0 || !Number.isFinite(pricePerLiter) || pricePerLiter <= 0 || !PAYMENT_METHODS.includes(paymentMethod as (typeof PAYMENT_METHODS)[number]) || !pumpNo || !reason) return NextResponse.json({ error: "ข้อมูลแก้ไขไม่ครบหรือไม่ถูกต้อง" }, { status: 400 });
  const liters = totalAmount / pricePerLiter;
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.sale.findUnique({ where: { id } }); if (!existing) throw new Error("NOT_FOUND");
      await tx.fuelStock.upsert({ where: { fuelTypeId: existing.fuelTypeId }, create: { fuelTypeId: existing.fuelTypeId, currentLiters: existing.liters }, update: { currentLiters: { increment: existing.liters } } });
      await tx.fuelStock.upsert({ where: { fuelTypeId }, create: { fuelTypeId, currentLiters: -liters }, update: { currentLiters: { decrement: liters } } });
      const sale = await tx.sale.update({ where: { id }, data: { fuelTypeId, totalAmount, pricePerLiter, liters, paymentMethod, pumpNo, customerName: typeof body?.customerName === "string" && body.customerName.trim() ? body.customerName.trim().slice(0, 200) : null, note: typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null } });
      await tx.saleAudit.create({ data: { saleId: id, action: "update", actorId: auth.user.id, actorName: auth.user.name, actorEmail: auth.user.email, beforeData: saleSnapshot(existing), afterData: saleSnapshot(sale), reason } }); return sale;
    });
    return NextResponse.json(updated);
  } catch (error) { const missing = error instanceof Error && error.message === "NOT_FOUND"; return NextResponse.json({ error: missing ? "ไม่พบรายการขาย" : "แก้ไขรายการไม่สำเร็จ" }, { status: missing ? 404 : 500 }); }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const auth = await requireRole(["owner", "manager"]); if (!auth.ok) return auth.response;
  const id = Number((await params).id);
  const body = await request.json().catch(() => null) as { reason?: unknown } | null;
  const reason = String(body?.reason ?? "").trim().slice(0, 300);
  if (!Number.isInteger(id) || id <= 0 || !reason) return NextResponse.json({ error: "กรุณาระบุเหตุผลที่ยกเลิก" }, { status: 400 });
  try {
    await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({ where: { id } }); if (!sale) throw new Error("NOT_FOUND");
      await tx.saleAudit.create({ data: { saleId: id, action: "cancel", actorId: auth.user.id, actorName: auth.user.name, actorEmail: auth.user.email, beforeData: saleSnapshot(sale), reason } });
      await tx.sale.delete({ where: { id } });
      await tx.fuelStock.upsert({ where: { fuelTypeId: sale.fuelTypeId }, create: { fuelTypeId: sale.fuelTypeId, currentLiters: sale.liters }, update: { currentLiters: { increment: sale.liters } } });
    }); return NextResponse.json({ ok: true });
  } catch (error) { const missing = error instanceof Error && error.message === "NOT_FOUND"; return NextResponse.json({ error: missing ? "ไม่พบรายการขาย" : "ยกเลิกรายการไม่สำเร็จ" }, { status: missing ? 404 : 500 }); }
}
