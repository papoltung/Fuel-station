import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const product = await prisma.product.update({
    where: { id: Number(id) },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.unit !== undefined && { unit: body.unit }),
      ...(body.size !== undefined && { size: body.size }),
      ...(body.category !== undefined && { category: body.category }),
      ...(body.currentPrice !== undefined && { currentPrice: body.currentPrice }),
      ...(body.costPrice !== undefined && { costPrice: body.costPrice }),
      ...(body.currentStock !== undefined && { currentStock: body.currentStock }),
      ...(body.minStock !== undefined && { minStock: body.minStock }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      ...(body.image !== undefined && { image: body.image }),
    },
  });
  return NextResponse.json(product);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const salesCount = await prisma.productSale.count({ where: { productId: Number(id) } });
  if (salesCount > 0) {
    return NextResponse.json({ error: `ลบไม่ได้ — มีประวัติขาย ${salesCount} รายการ ซ่อนแทน` }, { status: 409 });
  }
  await prisma.product.delete({ where: { id: Number(id) } });
  return NextResponse.json({ ok: true });
}
