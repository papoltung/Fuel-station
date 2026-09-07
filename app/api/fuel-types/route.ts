import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";

export const dynamic = "force-dynamic";

export async function GET() {
  const fuelTypes = await prisma.fuelType.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(fuelTypes, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireRole(["owner", "manager"]);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    if (!Array.isArray(body.prices) || body.prices.length === 0 || body.prices.length > 20) return NextResponse.json({ error: "รายการราคาไม่ถูกต้อง" }, { status: 400 });
    const prices: Array<{ id: number; currentPrice: number }> = body.prices.map((item: unknown) => {
      const value = item as { id?: unknown; currentPrice?: unknown };
      return { id: Number(value.id), currentPrice: Number(value.currentPrice) };
    });
    const invalid = prices.some(({ id, currentPrice }) => !Number.isInteger(id) || id <= 0 || !Number.isFinite(currentPrice) || currentPrice < 0 || currentPrice > 999);
    if (invalid || new Set(prices.map(({ id }) => id)).size !== prices.length) return NextResponse.json({ error: "ราคาต้องอยู่ระหว่าง 0–999 บาท และห้ามมีรายการซ้ำ" }, { status: 400 });
    await prisma.$transaction(prices.map(({ id, currentPrice }) => prisma.fuelType.update({ where: { id }, data: { currentPrice } })));
    return NextResponse.json(await prisma.fuelType.findMany({ orderBy: { name: "asc" } }));
  } catch { return NextResponse.json({ error: "บันทึกราคาไม่สำเร็จ" }, { status: 500 }); }
}
