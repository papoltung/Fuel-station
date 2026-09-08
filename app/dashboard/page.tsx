"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Summary = {
  totalRevenue: number;
  previousRevenue: number;
  totalLiters: number;
  previousLiters: number;
  previousCount: number;
  count: number;
  productCount: number;
  byPayment: Record<string, number>;
};
type Stock = { fuelTypeId: number; currentLiters: number; fuelType: { name: string; label: string } };
type Sale = { id: number; date: string; sellerName: string; totalAmount: number; paymentMethod: string; pumpNo: string; fuelType: { name: string; label: string } };
type Meter = { id: number; meterEnd: number | null; fuelType: { name: string; label: string } };
type Account = { name: string; email: string; avatarUrl: string; role: string };

const NAV = [
  { href: "/dashboard", icon: "⌂", label: "ภาพรวม" },
  { href: "/quick", icon: "⛽", label: "บันทึกขาย" },
  { href: "/stock", icon: "◇", label: "สต็อก" },
  { href: "/meter", icon: "◴", label: "มิเตอร์" },
  { href: "/cash", icon: "▣", label: "นับเงิน" },
  { href: "/settings/products", icon: "□", label: "สินค้า" },
  { href: "/reports", icon: "▥", label: "รายงาน" },
];
const FUEL_STYLE: Record<string, { dot: string; bar: string; soft: string }> = {
  benzin91: { dot: "bg-emerald-500", bar: "bg-emerald-500", soft: "bg-emerald-50 text-emerald-700" },
  benzin95: { dot: "bg-blue-500", bar: "bg-blue-500", soft: "bg-blue-50 text-blue-700" },
  e20: { dot: "bg-orange-500", bar: "bg-orange-500", soft: "bg-orange-50 text-orange-700" },
  diesel: { dot: "bg-slate-600", bar: "bg-slate-600", soft: "bg-slate-100 text-slate-700" },
};
const PAYMENT_LABEL: Record<string, string> = { cash: "เงินสด", qr: "QR", transfer: "โอน", credit: "เครดิต" };

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function money(value: number) { return value.toLocaleString("th-TH", { maximumFractionDigits: 0 }); }
function number(value: number) { return value.toLocaleString("th-TH", { maximumFractionDigits: 1 }); }
function time(value: string) { return new Date(value).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }); }
function trend(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? "มีรายการใหม่วันนี้" : "ยังไม่มีข้อมูลเทียบเมื่อวาน";
  const percent = (current - previous) / previous * 100;
  return `${percent >= 0 ? "↑" : "↓"} ${Math.abs(percent).toLocaleString("th-TH", { maximumFractionDigits: 1 })}% จากเมื่อวาน`;
}

export default function DashboardPage() {
  const [date, setDate] = useState(todayKey);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [meters, setMeters] = useState<Meter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [account, setAccount] = useState<Account>({ name: "บัญชีผู้ใช้", email: "", avatarUrl: "", role: "ผู้ใช้งาน" });
  const [roleCode, setRoleCode] = useState("");

  useEffect(() => {
    fetch("/api/me").then((response) => response.ok ? response.json() : null).then((user) => {
      if (!user) return;
      setRoleCode(user.role ?? "");
      const role = user.role === "owner" ? "เจ้าของ" : user.role === "manager" ? "ผู้จัดการ" : "พนักงาน";
      setAccount({
        name: user.name || user.email?.split("@")[0] || "บัญชีผู้ใช้",
        email: user.email ?? "",
        avatarUrl: user.avatarUrl || "",
        role,
      });
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const read = async (url: string) => {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error("โหลดข้อมูลไม่สำเร็จ");
      return response.json();
    };
    Promise.all([
      read(`/api/sales/summary?date=${date}`),
      roleCode === "owner" ? read("/api/fuel-stock") : Promise.resolve([]),
      read(`/api/sales?date=${date}`),
      read(`/api/meter-periods?date=${date}`),
    ]).then(([summaryData, stockData, saleData, meterData]) => {
      setSummary(summaryData);
      setStocks(Array.isArray(stockData) ? stockData : []);
      setSales(Array.isArray(saleData) ? saleData : []);
      setMeters(Array.isArray(meterData) ? meterData : []);
      setError("");
    }).catch(() => { if (!controller.signal.aborted) setError("โหลดข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [date, retry, roleCode]);

  const totalStock = stocks.reduce((sum, item) => sum + Math.max(0, item.currentLiters), 0);

  return (
    <div className="min-h-dvh bg-[#f4f7fb] text-slate-950 lg:pl-60">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-slate-200 bg-white lg:flex lg:flex-col">
        <div className="flex h-20 items-center gap-3 px-7">
          <span className="grid size-11 place-items-center rounded-xl bg-blue-600 text-2xl" aria-hidden="true">💧</span>
          <div><p className="text-xl font-black">Fuel<span className="text-blue-600">POS</span></p><p className="text-[11px] text-slate-400">ระบบจัดการสถานีน้ำมัน</p></div>
        </div>
        <nav aria-label="เมนูระบบ" className="flex-1 space-y-1 px-3 py-4">
          <p className="px-4 pb-2 text-[10px] font-black uppercase tracking-[.16em] text-slate-400">Main</p>
          {NAV.filter(item => !["/reports", "/stock"].includes(item.href) || roleCode === "owner").map((item, index) => <Link key={`${item.href}-${item.label}`} href={item.href} aria-current={index === 0 ? "page" : undefined} className={`flex min-h-12 items-center gap-4 rounded-xl px-4 text-sm font-bold ${index === 0 ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}><span className="w-5 text-center text-xl" aria-hidden="true">{item.icon}</span>{item.label}</Link>)}
        </nav>
        <div className="border-t border-slate-200 p-4">
          <p className="px-3 pb-1 text-[10px] font-black uppercase tracking-[.16em] text-slate-400">System</p>
          <Link href="/settings" className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-bold text-slate-600"><span aria-hidden="true">⚙</span> ตั้งค่า</Link>
          {(roleCode === "owner" || roleCode === "manager") && <Link href="/settings/audit-log" className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-bold text-slate-600 hover:bg-slate-50"><span aria-hidden="true">◷</span> ประวัติการทำรายการ</Link>}
          <Link href="/help" className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-bold text-slate-600 hover:bg-slate-50"><span aria-hidden="true">?</span> ช่วยเหลือ</Link>
          <div className="my-3 border-t border-slate-200" />
          <div className="flex items-center gap-3 px-3 py-2">
            {account.avatarUrl ? <img src={account.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-10 rounded-full object-cover" /> : <span className="grid size-10 shrink-0 place-items-center rounded-full bg-blue-100 font-black text-blue-700" aria-hidden="true">{account.name.slice(0, 1).toUpperCase()}</span>}
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-800">{account.name}</p>
              <p className="truncate text-xs text-slate-500" title={account.email}>{account.role}</p>
            </div>
          </div>
          <form action="/auth/signout" method="post"><button className="min-h-12 w-full rounded-xl px-3 text-left text-sm font-bold text-red-600 hover:bg-red-50" type="submit">↪ ออกจากระบบ</button></form>
        </div>
      </aside>

      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-3 px-4 lg:px-7">
          <div className="lg:hidden"><p className="font-black">Fuel<span className="text-blue-600">POS</span></p></div>
          <div className="hidden min-h-11 w-full max-w-md items-center rounded-xl bg-slate-100 px-4 text-sm text-slate-400 lg:flex">⌕ &nbsp; ค้นหารายการ สินค้า เลขที่บิล…</div>
          <div className="ml-auto flex items-center gap-2">
            <label className="sr-only" htmlFor="dashboard-date">วันที่รายงาน</label>
            <input id="dashboard-date" type="date" value={date} onChange={(event) => { setLoading(true); setDate(event.target.value); }} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold" />
            <button type="button" className="relative grid size-11 place-items-center rounded-xl bg-slate-100 text-lg" aria-label="การแจ้งเตือน">♧<span className="absolute right-2 top-2 size-2 rounded-full bg-red-500" /></button>
            <span className="hidden size-10 place-items-center rounded-full bg-blue-100 font-black text-blue-700 sm:grid" aria-label="บัญชีผู้ใช้">A</span>
            <Link href="/quick" className="grid min-h-11 place-items-center rounded-xl bg-blue-600 px-4 text-sm font-bold text-white shadow-sm">＋ บันทึกการขาย</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 pb-28 pt-6 lg:px-7 lg:pb-10">
        <div className="mb-6">
          <p className="text-sm text-slate-500">สวัสดี 👋</p>
          <h1 className="text-2xl font-black tracking-tight lg:text-3xl">ภาพรวมสถานี</h1>
          <p className="mt-1 text-sm text-slate-500">สรุปข้อมูลการขาย สต็อก และการดำเนินงานของสถานี</p>
        </div>

        {loading ? <div aria-label="กำลังโหลดข้อมูล" role="status" className="grid gap-4 motion-safe:animate-pulse sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-32 rounded-2xl bg-slate-200" />)}</div> : error ? (
          <div role="alert" className="rounded-2xl border border-red-200 bg-white p-6 text-red-700"><p>{error}</p><button className="mt-4 min-h-12 rounded-xl bg-blue-600 px-5 font-bold text-white" onClick={() => { setLoading(true); setRetry((value) => value + 1); }}>ลองอีกครั้ง</button></div>
        ) : <>
          <section aria-label="ตัวเลขสำคัญ" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { icon: "▥", label: "ยอดขายวันนี้", value: `฿ ${money(summary?.totalRevenue ?? 0)}`, detail: trend(summary?.totalRevenue ?? 0, summary?.previousRevenue ?? 0), accent: "bg-blue-50 text-blue-600" },
              { icon: "💧", label: "ปริมาณขาย", value: `${number(summary?.totalLiters ?? 0)} L`, detail: trend(summary?.totalLiters ?? 0, summary?.previousLiters ?? 0), accent: "bg-blue-50 text-blue-600" },
              { icon: "▤", label: "จำนวนรายการ", value: money((summary?.count ?? 0) + (summary?.productCount ?? 0)), detail: trend((summary?.count ?? 0) + (summary?.productCount ?? 0), summary?.previousCount ?? 0), accent: "bg-indigo-50 text-indigo-600" },
              { icon: "฿", label: "เงินสดในกะ", value: `฿ ${money(summary?.byPayment?.cash ?? 0)}`, detail: "เฉพาะรายการชำระเงินสด", accent: "bg-emerald-50 text-emerald-600" },
            ].map((stat) => <article key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start gap-4"><span className={`grid size-12 shrink-0 place-items-center rounded-xl text-xl font-black ${stat.accent}`} aria-hidden="true">{stat.icon}</span><div className="min-w-0"><p className="text-sm font-semibold text-slate-500">{stat.label}</p><p className="mt-1 text-2xl font-black tabular-nums">{stat.value}</p><p className={`mt-2 text-xs font-semibold ${stat.detail.startsWith("↑") ? "text-emerald-600" : stat.detail.startsWith("↓") ? "text-red-500" : "text-slate-400"}`}>{stat.detail}</p></div></div></article>)}
          </section>

          {roleCode === "owner" && <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_.8fr]">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-black">น้ำมันคงเหลือ</h2><p className="text-sm text-slate-500">รวม {number(totalStock)} ลิตร</p></div><Link href="/stock" className="text-sm font-bold text-blue-600">ดูทั้งหมด →</Link></div>
              {stocks.length === 0 ? <div className="py-8 text-center"><p className="text-sm text-slate-400">ยังไม่มีข้อมูลสต็อก</p><Link href="/stock" className="mt-3 inline-grid min-h-11 place-items-center rounded-xl bg-blue-50 px-4 text-sm font-bold text-blue-700">เพิ่มข้อมูลสต็อก</Link></div> : <div className="space-y-5">{stocks.map((item) => { const style = FUEL_STYLE[item.fuelType.name] ?? FUEL_STYLE.diesel; const capacity = 3000; const percent = Math.max(0, Math.min(100, item.currentLiters / capacity * 100)); const low = percent < 25; return <div key={item.fuelTypeId}><div className="mb-2 flex items-end justify-between"><div className="flex items-center gap-2"><span className={`size-3 rounded-full ${style.dot}`} /><span className="font-bold">{item.fuelType.label}</span>{low && <span className="rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-600">ใกล้หมด</span>}</div><p className="text-xl font-black tabular-nums">{number(item.currentLiters)} L</p></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${low ? "bg-red-500" : style.bar}`} style={{ width: `${percent}%` }} /></div><div className="mt-1 flex justify-between text-xs text-slate-400"><span>จากความจุอ้างอิง {money(capacity)} L</span><span className="font-bold text-slate-600">{Math.round(percent)}%</span></div></div>; })}</div>}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-black">สถานะหัวจ่าย</h2><Link href="/meter" className="text-sm font-bold text-blue-600">ดูทั้งหมด →</Link></div>
              <div className="divide-y divide-slate-100">{stocks.map((stock, index) => { const open = meters.some((meter) => meter.fuelType.name === stock.fuelType.name && meter.meterEnd === null); return <div key={stock.fuelTypeId} className="flex min-h-14 items-center gap-3"><span className={`size-2.5 rounded-full ${open ? "bg-emerald-500" : "bg-slate-300"}`} /><span className="font-bold">หัวจ่าย {index + 1}</span><span className="ml-auto text-sm text-slate-500">{stock.fuelType.label}</span><span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${open ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{open ? "ใช้งาน" : "ว่าง"}</span></div>; })}</div>
            </section>
          </div>}

          <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-black">การขายล่าสุด</h2><span className="text-sm text-slate-400">{sales.length} รายการ</span></div>
            {sales.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">ยังไม่มีรายการขายในวันนี้</p> : <div className="divide-y divide-slate-100">{sales.slice(0, 6).map((sale) => { const style = FUEL_STYLE[sale.fuelType.name] ?? FUEL_STYLE.diesel; return <div key={sale.id} className="grid min-h-16 grid-cols-[3rem_1fr_auto] items-center gap-3"><time className="text-sm tabular-nums text-slate-500">{time(sale.date)}</time><div className="flex min-w-0 items-center gap-3"><span className={`size-3 shrink-0 rounded-full ${style.dot}`} /><div className="min-w-0"><p className="truncate font-bold">{sale.fuelType.label}</p><p className="text-xs text-slate-400">{sale.pumpNo} · ขายโดย {sale.sellerName}</p></div></div><div className="text-right"><p className="font-black tabular-nums">฿ {money(sale.totalAmount)}</p><span className={`inline-block rounded-lg px-2 py-0.5 text-xs font-bold ${style.soft}`}>{PAYMENT_LABEL[sale.paymentMethod] ?? sale.paymentMethod}</span>{(roleCode === "owner" || roleCode === "manager") && <Link href={`/sales/${sale.id}/edit`} className="ml-2 inline-block rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">แก้ไข</Link>}</div></div>; })}</div>}
          </section>
        </>}
      </main>

      <nav aria-label="เมนูหลัก" className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">{[
          { href: "/dashboard", icon: "⌂", label: "หน้าหลัก" }, { href: "/quick", icon: "⛽", label: "ขาย" }, { href: "/stock", icon: "◇", label: "สต็อก" }, { href: "/reports", icon: "▥", label: "รายงาน" }, { href: "/settings", icon: "♙", label: "บัญชี" },
        ].filter(item => !["/reports", "/stock"].includes(item.href) || roleCode === "owner").map((item, index) => <Link key={`${item.href}-${item.label}`} href={item.href} aria-current={index === 0 ? "page" : undefined} className={`grid min-h-16 place-items-center content-center gap-0.5 text-xs font-bold ${index === 0 ? "text-blue-600" : "text-slate-500"}`}><span className="text-xl" aria-hidden="true">{item.icon}</span>{item.label}</Link>)}</div>
      </nav>
    </div>
  );
}
