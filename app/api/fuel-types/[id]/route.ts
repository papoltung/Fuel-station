import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["owner"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const ftId = Number(id);
  try {
    const [salesCount, purchasesCount] = await Promise.all([
      prisma.sale.count({ where: { fuelTypeId: ftId } }),
      prisma.fuelPurchase.count({ where: { fuelTypeId: ftId } }),
    ]);
    if (salesCount > 0 || purchasesCount > 0) {
      return NextResponse.json({ error: `มีข้อมูลขาย/รับน้ำมันอยู่ ${salesCount + purchasesCount} รายการ ลบไม่ได้` }, { status: 400 });
    }
    await prisma.fuelStock.deleteMany({ where: { fuelTypeId: ftId } });
    await prisma.stockCheck.deleteMany({ where: { fuelTypeId: ftId } });
    await prisma.fuelType.delete({ where: { id: ftId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["owner", "manager"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const body = await req.json();
  const { currentPrice } = body;

  if (currentPrice === undefined || isNaN(Number(currentPrice))) {
    return NextResponse.json({ error: "ราคาไม่ถูกต้อง" }, { status: 400 });
  }

  const updated = await prisma.fuelType.update({
    where: { id: Number(id) },
    data: { currentPrice: Number(currentPrice) },
  });

  return NextResponse.json(updated);
}
