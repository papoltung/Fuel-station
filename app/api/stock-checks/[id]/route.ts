import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!id) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });

    await prisma.stockCheck.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("stock-checks DELETE error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
