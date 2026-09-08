"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Shift = {
  id: number;
  status: "open" | "closed";
  openedAt: string;
  closedAt: string | null;
  openingCash: number;
  cashSales: number | null;
  expectedCash: number | null;
  actualCash: number | null;
  difference: number | null;
  openedById: number;
  openedByName: string;
  closedByName: string | null;
  _count: { sales: number; productSales: number };
};

function money(value: number | null | undefined) {
  return `฿${Number(value ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateTime(value: string | null) {
  return value ? new Date(value).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "—";
}

export default function ShiftsPage() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [openingCash, setOpeningCash] = useState("");
  const [actualCash, setActualCash] = useState("");
  const [closingId, setClosingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/shifts", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "โหลดข้อมูลกะไม่สำเร็จ");
      setShifts(Array.isArray(data.shifts) ? data.shifts : []);
      setCurrentShift(data.currentShift ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "โหลดข้อมูลกะไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function openShift(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(openingCash);
    if (!Number.isFinite(value) || value < 0) return setError("กรุณากรอกเงินตั้งต้นเป็นตัวเลขตั้งแต่ 0 บาทขึ้นไป");
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/shifts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ openingCash: value }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "เปิดกะไม่สำเร็จ");
      setOpeningCash("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "เปิดกะไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function closeShift(id: number) {
    const value = Number(actualCash);
    if (!Number.isFinite(value) || value < 0) return setError("กรุณากรอกเงินสดจริงเป็นตัวเลขตั้งแต่ 0 บาทขึ้นไป");
    setClosingId(id);
    setError("");
    try {
      const response = await fetch(`/api/shifts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actualCash: value }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "ปิดกะไม่สำเร็จ");
      setActualCash("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ปิดกะไม่สำเร็จ");
    } finally {
      setClosingId(null);
    }
  }

  const ownOpenShift = currentShift;
  const openShifts = useMemo(() => shifts.filter((shift) => shift.status === "open"), [shifts]);

  return (
    <main className="min-h-dvh bg-slate-50 px-4 py-5 text-slate-950 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/dashboard" className="text-sm font-semibold text-blue-700">← กลับภาพรวม</Link>
        <header className="my-6 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-sm font-semibold text-blue-700">FuelPOS</p><h1 className="mt-1 text-3xl font-black">กะทำงาน</h1><p className="mt-1 text-sm text-slate-500">เปิดกะก่อนขาย และปิดกะเพื่อตรวจเงินสดตามระบบ</p></div>
          <span className="rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm">เปิดอยู่ {openShifts.length} กะ</span>
        </header>

        {error && <div role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}

        {!ownOpenShift && <form onSubmit={openShift} className="mb-5 rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black">เปิดกะใหม่</h2><p className="mt-1 text-sm text-slate-500">เงินตั้งต้นจะถูกรวมกับยอดขายเงินสดเพื่อคำนวณเงินที่ควรมีตอนปิดกะ</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"><label className="flex-1 text-sm font-semibold">เงินตั้งต้น (บาท)<input type="number" min="0" step="0.001" value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-3 text-lg outline-none focus:border-blue-600" placeholder="0.00" /></label><button disabled={saving} className="min-h-12 rounded-xl bg-blue-600 px-6 font-bold text-white disabled:opacity-50">{saving ? "กำลังเปิด…" : "เปิดกะ"}</button></div>
        </form>}

        {loading ? <div role="status" className="rounded-2xl bg-white p-8 text-center text-slate-500">กำลังโหลดข้อมูลกะ…</div> : <div className="space-y-4">
          {shifts.length === 0 && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">ยังไม่มีประวัติกะ</div>}
          {shifts.map((shift) => <article key={shift.id} className={`rounded-2xl border bg-white p-5 shadow-sm ${shift.id === ownOpenShift?.id ? "border-blue-300 ring-2 ring-blue-50" : "border-slate-200"}`}>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="font-black">กะ #{shift.id}</h2><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${shift.status === "open" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{shift.status === "open" ? "กำลังเปิด" : "ปิดแล้ว"}</span></div><p className="mt-1 text-sm text-slate-500">เปิดโดย {shift.openedByName} · {dateTime(shift.openedAt)}</p>{shift.closedAt && <p className="text-xs text-slate-400">ปิดเมื่อ {dateTime(shift.closedAt)} โดย {shift.closedByName || "—"}</p>}</div><p className="text-right text-sm text-slate-500">ขายน้ำมัน {shift._count.sales} · สินค้า {shift._count.productSales}</p></div>
            <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><div className="rounded-xl bg-slate-50 p-3"><dt className="text-slate-500">เงินตั้งต้น</dt><dd className="mt-1 font-black">{money(shift.openingCash)}</dd></div><div className="rounded-xl bg-slate-50 p-3"><dt className="text-slate-500">ขายเงินสด</dt><dd className="mt-1 font-black">{shift.status === "open" ? "คำนวณตอนปิด" : money(shift.cashSales)}</dd></div><div className="rounded-xl bg-slate-50 p-3"><dt className="text-slate-500">ควรมี</dt><dd className="mt-1 font-black">{money(shift.expectedCash)}</dd></div><div className="rounded-xl bg-slate-50 p-3"><dt className="text-slate-500">ผลต่าง</dt><dd className={`mt-1 font-black ${shift.difference !== null && Math.abs(shift.difference) > 0.000001 ? "text-amber-700" : "text-emerald-700"}`}>{shift.status === "open" ? "—" : money(shift.difference)}</dd></div></dl>
            {shift.status === "open" && <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-end"><label className="flex-1 text-sm font-semibold">เงินสดจริงตอนปิดกะ (บาท)<input type="number" min="0" step="0.001" value={closingId === shift.id ? actualCash : ""} onChange={(event) => { setClosingId(shift.id); setActualCash(event.target.value); }} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 outline-none focus:border-blue-600" placeholder="กรอกเมื่อพร้อมปิดกะ" /></label><button onClick={() => void closeShift(shift.id)} disabled={closingId === shift.id && actualCash === ""} className="min-h-11 rounded-xl bg-slate-900 px-5 font-bold text-white disabled:opacity-50">ปิดกะ</button></div>}
          </article>)}
        </div>}
      </div>
    </main>
  );
}
