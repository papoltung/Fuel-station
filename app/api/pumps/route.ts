import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";

export async function GET() {
  const auth = await requireRole(["owner", "manager", "staff"]);
  if (!auth.ok) return auth.response;

  const pumps = await prisma.pump.findMany({
    where: { isActive: true },
    include: { fuelType: true },
    orderBy: { number: "asc" },
  });
  return NextResponse.json(pumps);
}
