import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const stocks = await prisma.fuelStock.findMany({
      include: { fuelType: true },
      orderBy: { fuelTypeId: "asc" },
    });
    return NextResponse.json(stocks);
  } catch (e) {
    console.error("fuel-stock error:", e);
    return NextResponse.json([], { status: 200 });
  }
}
