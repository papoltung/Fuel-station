import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { shouldRefreshLastSeen } from "@/lib/user-activity";

export const ROLES = ["owner", "manager", "staff"] as const;
export type Role = typeof ROLES[number];
type AuthResult = { ok: true; user: { id: number; authUserId: string; email: string; name: string; avatarUrl: string | null; role: string } } | { ok: false; response: NextResponse };

async function upsertUser(tx: Prisma.TransactionClient, authUser: { id: string; email?: string; user_metadata?: Record<string, unknown> }) {
  const email = authUser.email?.trim().toLowerCase();
  if (!email) throw new Error("EMAIL_REQUIRED");
  const metadata = authUser.user_metadata ?? {};
  const name = String(metadata.full_name || metadata.name || email.split("@")[0]).slice(0, 120);
  const avatarUrl = metadata.avatar_url || metadata.picture ? String(metadata.avatar_url || metadata.picture).slice(0, 500) : null;
  const existing = await tx.appUser.findUnique({ where: { authUserId: authUser.id } });
  if (existing) return tx.appUser.update({ where: { id: existing.id }, data: { email, name, avatarUrl, lastSeenAt: new Date() } });
  const count = await tx.appUser.count();
  return tx.appUser.create({ data: { authUserId: authUser.id, email, name, avatarUrl, role: count === 0 ? "owner" : "staff" } });
}

export async function currentAppUser(): Promise<AuthResult> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, response: NextResponse.json({ error: "ระบบเข้าสู่ระบบยังไม่พร้อม" }, { status: 503 }) };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 }) };
  try {
    const existing = await prisma.appUser.findUnique({ where: { authUserId: user.id } });
    if (existing) {
      if (!shouldRefreshLastSeen(existing.lastSeenAt)) return { ok: true, user: existing };
      const metadata = user.user_metadata ?? {};
      const email = user.email?.trim().toLowerCase();
      if (!email) throw new Error("EMAIL_REQUIRED");
      const appUser = await prisma.appUser.update({ where: { id: existing.id }, data: {
        email,
        name: String(metadata.full_name || metadata.name || email.split("@")[0]).slice(0, 120),
        avatarUrl: metadata.avatar_url || metadata.picture ? String(metadata.avatar_url || metadata.picture).slice(0, 500) : null,
        lastSeenAt: new Date(),
      } });
      return { ok: true, user: appUser };
    }

    let appUser = null;
    for (let attempt = 0; attempt < 3 && !appUser; attempt += 1) {
      try {
        appUser = await prisma.$transaction((tx) => upsertUser(tx, user), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        const retryable = error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code);
        if (!retryable || attempt === 2) throw error;
      }
    }
    if (!appUser) throw new Error("USER_CREATE_FAILED");
    return { ok: true, user: appUser };
  } catch {
    return { ok: false, response: NextResponse.json({ error: "ไม่สามารถตรวจสอบสิทธิ์ผู้ใช้ได้" }, { status: 500 }) };
  }
}

export async function requireRole(allowed: Role[]): Promise<AuthResult> {
  const result = await currentAppUser();
  if (!result.ok) return result;
  if (!allowed.includes(result.user.role as Role)) return { ok: false, response: NextResponse.json({ error: "คุณไม่มีสิทธิ์ทำรายการนี้" }, { status: 403 }) };
  return result;
}
