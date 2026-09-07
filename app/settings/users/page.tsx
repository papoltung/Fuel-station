"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Role = "owner" | "manager" | "staff";
type User = { id: number; email: string; name: string; role: Role; lastSeenAt: string };
const LABEL: Record<Role, string> = { owner: "Owner", manager: "Manager", staff: "Staff" };
const DETAIL: Record<Role, string> = { owner: "ควบคุมระบบและจัดการยศ", manager: "จัดการราคา สต็อก และรายงาน", staff: "บันทึกขายและงานประจำวัน" };

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [me, setMe] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    const [meResponse, usersResponse] = await Promise.all([fetch("/api/me"), fetch("/api/users")]);
    if (meResponse.ok) setMe(await meResponse.json());
    if (usersResponse.ok) { setUsers(await usersResponse.json()); setError(""); }
    else { const data = await usersResponse.json(); setError(data.error || "โหลดผู้ใช้งานไม่สำเร็จ"); }
    setLoading(false);
  }
  useEffect(() => { queueMicrotask(load); }, []);

  async function changeRole(user: User, role: Role) {
    if (user.role === role || !window.confirm(`เปลี่ยนยศ ${user.name}\n${LABEL[user.role]} → ${LABEL[role]} ใช่หรือไม่?`)) return;
    setSavingId(user.id); setError("");
    const response = await fetch("/api/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: user.id, role }) });
    const data = await response.json();
    if (response.ok) setUsers((current) => current.map((item) => item.id === user.id ? { ...item, role } : item));
    else setError(data.error || "เปลี่ยนยศไม่สำเร็จ");
    setSavingId(null);
  }

  return <main className="min-h-dvh bg-slate-50 px-4 py-6 text-slate-950 sm:px-6"><div className="mx-auto max-w-5xl">
    <Link href="/settings" className="inline-flex min-h-11 items-center font-bold text-blue-600">← กลับหน้าตั้งค่า</Link>
    <div className="mt-4 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-3xl font-black">ผู้ใช้งานและสิทธิ์</h1><p className="mt-1 text-slate-500">บัญชีจะปรากฏหลังเข้าสู่ระบบด้วย Google อย่างน้อยหนึ่งครั้ง</p></div>{me && <span className="rounded-full bg-blue-50 px-3 py-1.5 text-sm font-bold text-blue-700">คุณคือ {LABEL[me.role]}</span>}</div>
    <section className="mt-6 grid gap-3 sm:grid-cols-3" aria-label="คำอธิบายยศ">{(["owner", "manager", "staff"] as const).map((role) => <article key={role} className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="font-black">{LABEL[role]}</h2><p className="mt-1 text-sm text-slate-500">{DETAIL[role]}</p></article>)}</section>
    <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 p-5"><h2 className="text-lg font-black">บัญชีในระบบ</h2><p className="text-sm text-slate-500">{users.length} บัญชี</p></div>
      {loading ? <div className="p-8 text-center text-slate-500" role="status">กำลังโหลด…</div> : error ? <div className="p-8 text-center" role="alert"><p className="font-semibold text-red-600">{error}</p><Link href="/dashboard" className="mt-3 inline-block font-bold text-blue-600">กลับหน้าภาพรวม</Link></div> : <div className="divide-y divide-slate-100">{users.map((user) => <article key={user.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center"><span className="grid size-11 shrink-0 place-items-center rounded-full bg-blue-100 font-black text-blue-700">{user.name.slice(0, 1).toUpperCase()}</span><div className="min-w-0 flex-1"><h3 className="truncate font-black">{user.name}</h3><p className="truncate text-sm text-slate-500">{user.email}</p><p className="mt-1 text-xs text-slate-400">ใช้งานล่าสุด {new Date(user.lastSeenAt).toLocaleString("th-TH")}</p></div><div><label htmlFor={`role-${user.id}`} className="sr-only">ยศของ {user.name}</label><select id={`role-${user.id}`} value={user.role} disabled={me?.role !== "owner" || savingId === user.id || me?.id === user.id} onChange={(event) => changeRole(user, event.target.value as Role)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 font-bold disabled:bg-slate-100 disabled:text-slate-500"><option value="owner">Owner</option><option value="manager">Manager</option><option value="staff">Staff</option></select></div></article>)}</div>}
    </section>
  </div></main>;
}
