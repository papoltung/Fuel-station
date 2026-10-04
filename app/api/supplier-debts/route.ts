import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";

export async function GET() {
  const auth = await requireRole(["owner"]);
  if (!auth.ok) return auth.response;

  try {
    const debts = await prisma.supplierDebt.findMany({ orderBy: { date: "desc" }, include: { payments: { orderBy: { paidAt: "asc" } } } });
    return NextResponse.json(debts);
  } catch (e) {
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(["owner"]);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { supplier, amount, note, date } = body;
    if (!supplier || !amount || Number(amount) <= 0)
      return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
    const debt = await prisma.supplierDebt.create({
      data: {
        date: date ? new Date(date) : new Date(),
        supplier,
        amount: Number(amount),
        note: note || null,
        isPaid: false,
      },
    });
    return NextResponse.json(debt, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
