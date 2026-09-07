import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, ROLES } from "@/lib/authz";

export async function GET() {
  const auth = await requireRole(["owner", "manager"]);
  if (!auth.ok) return auth.response;
  return NextResponse.json(await prisma.appUser.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }], select: { id: true, email: true, name: true, avatarUrl: true, role: true, lastSeenAt: true, createdAt: true } }));
}

export async function PATCH(request: NextRequest) {
  const auth = await requireRole(["owner"]);
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null) as { userId?: unknown; role?: unknown } | null;
  const userId = Number(body?.userId);
  const role = String(body?.role ?? "");
  if (!Number.isInteger(userId) || !ROLES.includes(role as (typeof ROLES)[number])) return NextResponse.json({ error: "ข้อมูลยศไม่ถูกต้อง" }, { status: 400 });
  if (userId === auth.user.id && role !== "owner") return NextResponse.json({ error: "ไม่สามารถลดยศ Owner ของบัญชีตัวเองได้" }, { status: 409 });
  const updated = await prisma.appUser.update({ where: { id: userId }, data: { role }, select: { id: true, role: true } }).catch(() => null);
  return updated ? NextResponse.json(updated) : NextResponse.json({ error: "ไม่พบผู้ใช้งาน" }, { status: 404 });
}
