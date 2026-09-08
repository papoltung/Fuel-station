import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { parseOpeningCash } from "@/lib/shift";

export async function GET() {
  const auth = await requireRole(["owner", "manager", "staff"]);
  if (!auth.ok) return auth.response;

  const shifts = await prisma.shift.findMany({
    where: auth.user.role === "owner" ? undefined : { openedById: auth.user.id },
    orderBy: { openedAt: "desc" },
    take: 50,
    include: { _count: { select: { sales: true, productSales: true } } },
  });
  const currentShift = shifts.find((shift) => shift.openedById === auth.user.id && shift.status === "open") ?? null;
  return NextResponse.json({ currentShift, shifts });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(["owner", "manager", "staff"]);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null) as { openingCash?: unknown } | null;
  const opening = parseOpeningCash({ openingCash: body?.openingCash });
  if (opening.error) return NextResponse.json({ error: "เงินตั้งต้นต้องเป็นตัวเลขตั้งแต่ 0 บาทขึ้นไป" }, { status: 400 });

  try {
    const shift = await prisma.$transaction(async (tx) => {
      const active = await tx.shift.findFirst({ where: { openedById: auth.user.id, status: "open" } });
      if (active) throw new Error("SHIFT_ALREADY_OPEN");
      return tx.shift.create({
        data: {
          openingCash: opening.value,
          openedById: auth.user.id,
          openedByName: auth.user.name,
          openedByEmail: auth.user.email,
        },
        include: { _count: { select: { sales: true, productSales: true } } },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json(shift, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "SHIFT_ALREADY_OPEN") {
      return NextResponse.json({ error: "คุณมีกะที่ยังไม่ปิดอยู่แล้ว" }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "คุณมีกะที่ยังไม่ปิดอยู่แล้ว" }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "มีการเปิดกะพร้อมกัน กรุณาลองใหม่" }, { status: 409 });
    }
    console.error("shifts POST error:", error);
    return NextResponse.json({ error: "เปิดกะไม่สำเร็จ" }, { status: 500 });
  }
}
