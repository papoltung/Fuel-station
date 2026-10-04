import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { canCloseMeter, METER_ERROR_CODES } from "@/lib/meter-context";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["owner", "manager", "staff"]);
  if (!auth.ok) return auth.response;

  const id = Number((await params).id);
  const body = await req.json().catch(() => null) as { meterEnd?: unknown } | null;
  const end = Number(body?.meterEnd);
  if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(end) || end < 0) {
    return NextResponse.json({ error: "เลขมิเตอร์ไม่ถูกต้อง", code: METER_ERROR_CODES.INVALID_INPUT }, { status: 400 });
  }

  try {
    const existing = await prisma.meterPeriod.findUnique({
      where: { id },
      include: { pump: true, fuelType: true },
    });
    if (!existing) return NextResponse.json({ error: "ไม่พบรายการมิเตอร์", code: "NOT_FOUND" }, { status: 404 });
    if (!existing.pump || existing.openedById === null) {
      return NextResponse.json({ error: "รายการเก่าไม่มีข้อมูลผู้เปิดหรือหัวจ่าย จึงปิดรายการไม่ได้", code: "METER_CONTEXT_REQUIRED" }, { status: 409 });
    }
    if (existing.meterEnd !== null) {
      return NextResponse.json({ error: "รอบมิเตอร์นี้ปิดไปแล้ว กรุณาโหลดหน้าใหม่", code: "METER_ALREADY_CLOSED" }, { status: 409 });
    }
    if (!canCloseMeter({ actorId: auth.user.id, actorRole: auth.user.role, openedById: existing.openedById, meterEnd: existing.meterEnd })) {
      return NextResponse.json({ error: "มีเฉพาะผู้เปิดรอบหรือ Owner เท่านั้นที่ปิดมิเตอร์ได้", code: "METER_FORBIDDEN" }, { status: 403 });
    }
    if (end <= existing.meterStart) {
      return NextResponse.json({ error: "มิเตอร์ปลายต้องมากกว่ามิเตอร์ต้น", code: METER_ERROR_CODES.INVALID_INPUT }, { status: 400 });
    }

    const liters = end - existing.meterStart;
    const updated = await prisma.meterPeriod.update({
      where: {
        id,
        meterEnd: null,
      },
      data: {
        meterEnd: end,
        liters,
        totalRevenue: liters * existing.pricePerLiter,
        closedAt: new Date(),
        closedById: auth.user.id,
        closedByName: auth.user.name,
        closedByEmail: auth.user.email,
      },
      include: {
        fuelType: true,
        pump: true,
      },
    });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      const check = await prisma.meterPeriod.findUnique({ where: { id } });
      if (!check) {
        return NextResponse.json({ error: "ไม่พบรายการมิเตอร์", code: "NOT_FOUND" }, { status: 404 });
      }
      return NextResponse.json(
        { error: "รอบมิเตอร์นี้ปิดไปแล้ว กรุณาโหลดหน้าใหม่", code: "METER_ALREADY_CLOSED" },
        { status: 409 }
      );
    }
    console.error("meter-periods PATCH error:", error);
    return NextResponse.json({ error: "ปิดมิเตอร์ไม่สำเร็จ" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["owner"]);
  if (!auth.ok) return auth.response;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });

  try {
    await prisma.meterPeriod.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("meter-periods DELETE error:", error);
    return NextResponse.json({ error: "ลบรายการมิเตอร์ไม่สำเร็จ" }, { status: 500 });
  }
}
