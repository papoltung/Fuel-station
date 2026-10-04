import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["owner", "manager"]);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const sale = await prisma.productSale.findUnique({ where: { id: Number(id) } });
  if (!sale) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.$transaction([
    prisma.productSale.delete({ where: { id: Number(id) } }),
    prisma.product.update({
      where: { id: sale.productId },
      data: { currentStock: { increment: Math.round(sale.quantity) } },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
