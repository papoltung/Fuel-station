"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type FuelType = { id: number; name: string; label: string; currentPrice: number };
const HUB = [
  ["฿", "ราคาน้ำมัน", "ราคาขายต่อลิตร", "#fuel-prices"], ["♙", "ผู้ใช้งาน", "บัญชีพนักงาน", "/settings/users"],
  ["⌘", "สิทธิ์", "บทบาทและการเข้าถึง", "/settings/users"], ["⌂", "ข้อมูลสถานี", "ชื่อและรายละเอียด", "#station"],
  ["◉", "การแจ้งเตือน", "สต็อกและยอดขาย", "#notifications"], ["⚙", "ระบบ", "ภาษา เวลา และข้อมูล", "#system"],
];
const formatPrice = (value: number) => value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function SettingsPage() {
  const [fuels, setFuels] = useState<FuelType[]>([]);
  const [prices, setPrices] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function apply(data: FuelType[]) {
    setFuels(data);
    setPrices(Object.fromEntries(data.map((fuel) => [fuel.id, formatPrice(fuel.currentPrice)])));
  }
  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/fuel-types");
      if (!response.ok) throw new Error();
      apply(await response.json()); setError("");
    } catch { setError("โหลดราคาน้ำมันไม่สำเร็จ กรุณาลองอีกครั้ง"); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    queueMicrotask(async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/fuel-types");
        if (!response.ok) throw new Error();
        const data: FuelType[] = await response.json();
        setFuels(data);
        setPrices(Object.fromEntries(data.map((fuel) => [fuel.id, formatPrice(fuel.currentPrice)])));
        setError("");
      } catch { setError("โหลดราคาน้ำมันไม่สำเร็จ กรุณาลองอีกครั้ง"); }
      finally { setLoading(false); }
    });
  }, []);

  const changes = useMemo(() => fuels.flatMap((fuel) => {
    const nextPrice = Number(prices[fuel.id]);
    return Number.isFinite(nextPrice) && nextPrice >= 0 && nextPrice !== fuel.currentPrice ? [{ ...fuel, nextPrice }] : [];
  }), [fuels, prices]);
  const invalid = fuels.some((fuel) => prices[fuel.id]?.trim() === "" || !Number.isFinite(Number(prices[fuel.id])) || Number(prices[fuel.id]) < 0 || Number(prices[fuel.id]) > 999);

  function reset() {
    setPrices(Object.fromEntries(fuels.map((fuel) => [fuel.id, formatPrice(fuel.currentPrice)]))); setMessage("");
  }
  async function save() {
    if (!changes.length || invalid) return;
    const summary = changes.map((fuel) => `${fuel.label}: ${formatPrice(fuel.currentPrice)} → ${formatPrice(fuel.nextPrice)} บาท/ลิตร`).join("\n");
    if (!window.confirm(`ยืนยันการเปลี่ยนราคาน้ำมัน\n\n${summary}`)) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/fuel-types", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prices: changes.map(({ id, nextPrice }) => ({ id, currentPrice: nextPrice })) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "บันทึกราคาไม่สำเร็จ");
      const count = changes.length; apply(data); setMessage(`บันทึกราคาแล้ว ${count} รายการ`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกราคาไม่สำเร็จ"); }
    finally { setSaving(false); }
  }
  function priceInput(fuel: FuelType, mobile = false) {
    const id = `${mobile ? "mobile-" : ""}price-${fuel.id}`;
    return <div className={`flex items-center rounded-xl border border-slate-200 bg-white px-3 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 ${mobile ? "mt-2" : "max-w-52"}`}><label className="sr-only" htmlFor={id}>ราคาใหม่ {fuel.label}</label><input id={id} type="number" inputMode="decimal" min="0" max="999" step="0.01" value={prices[fuel.id] ?? ""} onChange={(event) => setPrices((current) => ({ ...current, [fuel.id]: event.target.value }))} className={`min-w-0 flex-1 bg-transparent font-black tabular-nums outline-none ${mobile ? "min-h-12 text-xl" : "min-h-11"}`} /><span className="text-xs text-slate-400">บาท</span></div>;
  }
  function badge(fuel: FuelType) {
    const changed = changes.some((item) => item.id === fuel.id);
    return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${changed ? "bg-amber-50 text-amber-700" : fuel.currentPrice > 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{changed ? "รอบันทึก" : fuel.currentPrice > 0 ? "ใช้งาน" : "ยังไม่ตั้งราคา"}</span>;
  }

  return <div className="min-h-dvh bg-slate-50 text-slate-950">
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur"><div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6"><Link href="/dashboard" className="grid size-11 place-items-center rounded-xl text-xl text-slate-600 hover:bg-slate-100" aria-label="กลับหน้าภาพรวม">←</Link><div><p className="font-black">Fuel<span className="text-blue-600">POS</span></p><p className="text-xs text-slate-500">ตั้งค่าระบบ</p></div>{changes.length > 0 && <span className="ml-auto rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">ยังไม่บันทึก {changes.length} รายการ</span>}</div></header>
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="hidden lg:block"><nav aria-label="หมวดตั้งค่า" className="sticky top-22 space-y-1 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><p className="px-3 pb-2 pt-1 text-xs font-black uppercase tracking-wider text-slate-400">ทั่วไป</p><a href="#fuel-prices" className="flex min-h-11 items-center gap-3 rounded-xl bg-blue-50 px-3 text-sm font-bold text-blue-700">฿ ราคาน้ำมัน</a><Link href="/meter" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">◴ หัวจ่าย / มิเตอร์</Link><Link href="/settings/products" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">□ สินค้า</Link><p className="px-3 pb-2 pt-4 text-xs font-black uppercase tracking-wider text-slate-400">ผู้ใช้งาน</p><Link href="/settings/users" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">♙ ผู้ใช้งาน</Link><Link href="/settings/users" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">⌘ บทบาทและสิทธิ์</Link><p className="px-3 pb-2 pt-4 text-xs font-black uppercase tracking-wider text-slate-400">ระบบ</p><Link href="/help" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">? ช่วยเหลือ</Link></nav></aside>
      <div className="min-w-0"><div className="mb-6"><h1 className="text-3xl font-black tracking-tight">ตั้งค่า</h1><p className="mt-1 text-slate-500">จัดการข้อมูลและการทำงานของสถานี</p></div>
        <section aria-label="หมวดการตั้งค่า"><div className="grid grid-cols-2 gap-3 md:grid-cols-3">{HUB.map(([icon, label, detail, href], index) => <a key={label} href={href} className={`flex min-h-24 items-start gap-3 rounded-2xl border bg-white p-4 shadow-sm ${index === 0 ? "border-blue-200 ring-1 ring-blue-100" : "border-slate-200 hover:border-slate-300"}`}><span className={`grid size-10 shrink-0 place-items-center rounded-xl font-black ${index === 0 ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}>{icon}</span><span><strong className="block text-sm">{label}</strong><small className="mt-1 block text-xs leading-5 text-slate-500">{detail}</small></span></a>)}</div></section>
        <section id="fuel-prices" aria-labelledby="fuel-title" className="mt-6 scroll-mt-24 rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5 sm:p-6"><div><h2 id="fuel-title" className="text-xl font-black">ราคาน้ำมัน</h2><p className="mt-1 text-sm text-slate-500">อัปเดตราคาที่ใช้คำนวณการขาย</p></div>{!loading && <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">{fuels.length} ประเภท</span>}</div>
          {loading ? <div className="space-y-3 p-6" aria-busy="true">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-14 animate-pulse rounded-xl bg-slate-100" />)}</div> : error && !fuels.length ? <div role="alert" className="p-8 text-center"><p className="text-sm font-semibold text-red-600">{error}</p><button onClick={load} className="mt-4 min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white">ลองอีกครั้ง</button></div> : <>
            <div className="hidden overflow-x-auto md:block"><table className="w-full border-collapse text-left"><thead><tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><th className="px-6 py-3">ประเภทน้ำมัน</th><th className="px-6 py-3">ราคาปัจจุบัน</th><th className="px-6 py-3">ราคาใหม่</th><th className="px-6 py-3">สถานะ</th></tr></thead><tbody className="divide-y divide-slate-100">{fuels.map((fuel) => <tr key={fuel.id}><th scope="row" className="px-6 py-4">{fuel.label}</th><td className="px-6 py-4 tabular-nums text-slate-600">{formatPrice(fuel.currentPrice)} บาท/ลิตร</td><td className="px-6 py-4">{priceInput(fuel)}</td><td className="px-6 py-4">{badge(fuel)}</td></tr>)}</tbody></table></div>
            <div className="divide-y divide-slate-100 md:hidden">{fuels.map((fuel) => <article key={fuel.id} className="p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-black">{fuel.label}</h3><p className="mt-1 text-xs text-slate-500">ราคาปัจจุบัน <strong className="text-slate-700">{formatPrice(fuel.currentPrice)} บาท/ลิตร</strong></p></div>{badge(fuel)}</div><label className="mt-4 block text-xs font-bold text-slate-600">ราคาใหม่</label>{priceInput(fuel, true)}</article>)}</div>
            <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-white/95 p-4 backdrop-blur sm:p-5"><div className="mr-auto min-h-5 text-sm"><span role="status" className="font-semibold text-emerald-700">{message}</span>{error && <span role="alert" className="font-semibold text-red-600">{error}</span>}{invalid && <span role="alert" className="font-semibold text-red-600">กรุณากรอกราคา 0–999 บาท</span>}</div><button onClick={reset} disabled={!changes.length || saving} className="min-h-11 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-600 disabled:opacity-40">ยกเลิก</button><button onClick={save} disabled={!changes.length || invalid || saving} className="min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{saving ? "กำลังบันทึก…" : `บันทึกการเปลี่ยนแปลง${changes.length ? ` (${changes.length})` : ""}`}</button></div>
          </>}
        </section>
      </div>
    </main>
  </div>;
}
