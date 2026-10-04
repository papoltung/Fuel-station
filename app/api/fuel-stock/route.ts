import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";

export async function GET() {
  const auth = await requireRole(["owner"]);
  if (!auth.ok) return auth.response;

  try {
    const stocks = await prisma.fuelStock.findMany({
      include: { fuelType: true },
      orderBy: { fuelTypeId: "asc" },
    });
    return NextResponse.json(stocks);
  } catch (e) {
    console.error("fuel-stock error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
