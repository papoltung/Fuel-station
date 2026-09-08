import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["owner"]);
  if (!auth.ok) return auth.response;

  const id = Number((await params).id);
  const body = await request.json().catch(() => null) as { fuelTypeId?: unknown; label?: unknown; isActive?: unknown } | null;
  const fuelTypeId = Number(body?.fuelTypeId);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(fuelTypeId) || fuelTypeId <= 0) {
    return NextResponse.json({ error: "หัวจ่ายหรือชนิดน้ำมันไม่ถูกต้อง", code: "PUMP_CONFIG_INVALID" }, { status: 400 });
  }

  const fuelType = await prisma.fuelType.findUnique({ where: { id: fuelTypeId } });
  if (!fuelType) return NextResponse.json({ error: "ไม่พบชนิดน้ำมัน", code: "FUEL_TYPE_NOT_FOUND" }, { status: 404 });

  try {
    const pump = await prisma.pump.update({
      where: { id },
      data: {
        fuelTypeId,
        ...(typeof body?.label === "string" && body.label.trim() ? { label: body.label.trim().slice(0, 80) } : {}),
        ...(typeof body?.isActive === "boolean" ? { isActive: body.isActive } : {}),
      },
      include: { fuelType: true },
    });
    return NextResponse.json(pump);
  } catch {
    return NextResponse.json({ error: "ตั้งค่าหัวจ่ายไม่สำเร็จ", code: "PUMP_CONFIG_FAILED" }, { status: 500 });
  }
}
