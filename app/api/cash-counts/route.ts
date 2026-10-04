import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";

export async function GET() {
  const auth = await requireRole(["owner", "manager", "staff"]);
  if (!auth.ok) return auth.response;

  try {
    const records = await prisma.cashCount.findMany({
      orderBy: { date: "desc" },
      take: 30,
    });
    return NextResponse.json(records);
  } catch (e) {
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(["owner", "manager", "staff"]);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { counts, total, note, date } = body;
    const record = await prisma.cashCount.create({
      data: {
        date: date ? new Date(date) : new Date(),
        counts: JSON.stringify(counts),
        total: Number(total),
        note: note || null,
      },
    });
    return NextResponse.json(record, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
