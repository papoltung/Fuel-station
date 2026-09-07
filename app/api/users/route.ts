import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, ROLES } from "@/lib/authz";
import { canAssignRole } from "@/lib/role-policy";

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
  if (!canAssignRole({ actorId: auth.user.id, actorRole: auth.user.role, targetId: userId, nextRole: role as (typeof ROLES)[number] })) {
    return NextResponse.json({ error: userId === auth.user.id ? "ไม่สามารถลดยศ Owner ของบัญชีตัวเองได้" : "เฉพาะ Owner เท่านั้นที่เปลี่ยนยศได้" }, { status: userId === auth.user.id ? 409 : 403 });
  }
  const updated = await prisma.appUser.update({ where: { id: userId }, data: { role }, select: { id: true, role: true } }).catch(() => null);
  return updated ? NextResponse.json(updated) : NextResponse.json({ error: "ไม่พบผู้ใช้งาน" }, { status: 404 });
}
