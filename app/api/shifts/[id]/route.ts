import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { calculateShiftClose, canCloseShift } from "@/lib/shift";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  const auth = await requireRole(["owner", "manager", "staff"]);
  if (!auth.ok) return auth.response;
  const id = Number((await params).id);
  const body = await request.json().catch(() => null) as { actualCash?: unknown } | null;
  const actualCash = body?.actualCash;
  if (!Number.isInteger(id) || id <= 0 || typeof actualCash !== "number" || !Number.isFinite(actualCash) || actualCash < 0) {
    return NextResponse.json({ error: "เงินสดจริงไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const closed = await prisma.$transaction(async (tx) => {
      const shift = await tx.shift.findUnique({ where: { id } });
      if (!shift) throw new Error("SHIFT_NOT_FOUND");
      if (!canCloseShift({ actorRole: auth.user.role, actorId: auth.user.id, openedById: shift.openedById, status: shift.status })) throw new Error(shift.status === "open" ? "SHIFT_FORBIDDEN" : "SHIFT_ALREADY_CLOSED");
      const openMeterCount = await tx.meterPeriod.count({ where: { shiftId: id, meterEnd: null } });
      if (openMeterCount > 0) throw new Error("OPEN_METERS_EXIST");

      const [fuelCash, productCash] = await Promise.all([
        tx.sale.aggregate({ where: { shiftId: id, paymentMethod: "cash" }, _sum: { totalAmount: true } }),
        tx.productSale.aggregate({ where: { shiftId: id, paymentMethod: "cash" }, _sum: { totalAmount: true } }),
      ]);
      const cashSales = (fuelCash._sum.totalAmount ?? 0) + (productCash._sum.totalAmount ?? 0);
      const totals = calculateShiftClose({ openingCash: shift.openingCash, cashSales, actualCash });
      const result = await tx.shift.updateMany({
        where: { id, status: "open" },
        data: {
          status: "closed",
          closedAt: new Date(),
          cashSales: totals.cashSales,
          expectedCash: totals.expectedCash,
          actualCash,
          difference: totals.difference,
          closedById: auth.user.id,
          closedByName: auth.user.name,
          closedByEmail: auth.user.email,
        },
      });
      if (result.count !== 1) throw new Error("SHIFT_ALREADY_CLOSED");
      return tx.shift.findUniqueOrThrow({ where: { id }, include: { _count: { select: { sales: true, productSales: true } } } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json(closed);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "SHIFT_NOT_FOUND") return NextResponse.json({ error: "ไม่พบกะนี้" }, { status: 404 });
    if (message === "SHIFT_FORBIDDEN") return NextResponse.json({ error: "คุณปิดได้เฉพาะกะของตัวเอง" }, { status: 403 });
    if (message === "SHIFT_ALREADY_CLOSED") return NextResponse.json({ error: "กะนี้ถูกปิดไปแล้ว" }, { status: 409 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return NextResponse.json({ error: "มีการปิดกะพร้อมกัน กรุณาลองใหม่" }, { status: 409 });
    if (message === "OPEN_METERS_EXIST") return NextResponse.json({ error: "ยังมีรอบมิเตอร์ที่เปิดอยู่ กรุณาปิดมิเตอร์ก่อนปิดกะ", code: "OPEN_METERS_EXIST" }, { status: 409 });
    console.error("shifts PATCH error:", error);
    return NextResponse.json({ error: "ปิดกะไม่สำเร็จ" }, { status: 500 });
  }
}
