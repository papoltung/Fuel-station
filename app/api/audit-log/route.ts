import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";

export async function GET(request: NextRequest) {
  const auth = await requireRole(["owner", "manager"]);
  if (!auth.ok) return auth.response;

  const action = new URL(request.url).searchParams.get("action");
  const where = action && ["create", "update", "cancel"].includes(action) ? { action } : {};
  const rows = await prisma.saleAudit.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json(rows);
}
