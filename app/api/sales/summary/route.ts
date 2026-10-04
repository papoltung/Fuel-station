import { NextRequest, NextResponse } from "next/server";
import { getSalesSummaryData } from "@/lib/sales-summary-service";
import { requireRole } from "@/lib/authz";

export async function GET(req: NextRequest) {
  const auth = await requireRole(["owner", "manager", "staff"]);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const dateStr = searchParams.get("date") ?? new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().split("T")[0];

  const summary = await getSalesSummaryData(dateStr);
  return NextResponse.json(summary);
}
