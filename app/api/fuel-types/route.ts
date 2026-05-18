import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const fuelTypes = await prisma.fuelType.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(fuelTypes);
}
