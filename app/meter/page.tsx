"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { openMeterPeriods, visibleMeterHistory } from "@/lib/meter-history";

type FuelType = {
  id: number;
  name: string;
  label: string;
  currentPrice: number;
};

type MeterPeriod = {
  id: number;
  date: string;
  fuelTypeId: number;
  meterStart: number;
  meterEnd: number | null;
  liters: number | null;
  pricePerLiter: number;
  totalRevenue: number | null;
  note: string | null;
  pumpId: number | null;
  shiftId: number | null;
  fuelType: { label: string; name: string };
  pump: { id: number; number: string; label: string } | null;
  shift: { id: number; status: string; openedById: number; openedByName: string; closedAt: string | null } | null;
  openedByName: string | null;
  closedByName: string | null;
};

type Sale = {
  pumpId: number | null;
  shiftId: number | null;
  fuelTypeId: number;
  totalAmount: number;
  liters: number;
  date: string;
};

type Pump = { id: number; number: string; label: string; isActive: boolean };
function fmt(n: number) {
  return Number(n || 0).toLocaleString("th-TH", {
    maximumFractionDigits: 0,
  });
}

function fmtDec(n: number) {
  return Number(n || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function shortDate(s: string) {
  return new Date(s).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

function displayDate() {
  return new Date().toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const FUEL_COLOR: Record<string, string> = {
  diesel: "bg-amber-400",
  benzin95: "bg-blue-500",
  benzin91: "bg-emerald-500",
  e20: "bg-violet-500",
};

const FUEL_ICON_BG: Record<string, string> = {
  diesel: "bg-amber-50 text-amber-600",
  benzin95: "bg-blue-50 text-blue-600",
  benzin91: "bg-emerald-50 text-emerald-600",
  e20: "bg-violet-50 text-violet-600",
};

export default function MeterPage() {
  const router = useRouter();
  const pathname = usePathname();
  const today = new Date().toISOString().split("T")[0];

  const [fuelTypes, setFuelTypes] = useState<FuelType[]>([]);
  const [pumps, setPumps] = useState<Pump[]>([]);
  const [periods, setPeriods] = useState<MeterPeriod[]>([]);
  const [allSales, setAllSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [closingId, setClosingId] = useState<number | null>(null);
  const [closeEnd, setCloseEnd] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  const [form, setForm] = useState({
    fuelTypeId: "",
    pumpId: "",
    meterStart: "",
    meterEnd: "",
    pricePerLiter: "",
    date: today,
    note: "",
  });

  function load() {
    setLoading(true);

    Promise.all([
      fetch("/api/fuel-types").then((r) => r.json()).catch(() => []),
      fetch("/api/pumps").then((r) => r.json()).catch(() => []),
      fetch("/api/meter-periods").then((r) => r.json()).catch(() => []),
      fetch("/api/sales").then((r) => r.json()).catch(() => []),
    ]).then(([ft, pumpRows, mp, sl]) => {
      const allFuel = (ft as FuelType[]) ?? [];
      const filtered = allFuel.filter((f) =>
        ["diesel", "benzin95"].includes(f.name)
      );

      const useFuel = filtered.length > 0 ? filtered : allFuel;

      setFuelTypes(useFuel);
      const allPumps = Array.isArray(pumpRows) ? pumpRows as Pump[] : [];
      setPumps(allPumps);
      setPeriods(mp ?? []);
      setAllSales(sl ?? []);

      if (useFuel.length > 0) {
        const first = useFuel[0];
        setForm((f) => ({
          ...f,
          fuelTypeId: String(first.id),
          pumpId: f.pumpId || (allPumps[0] ? String(allPumps[0].id) : ""),
          pricePerLiter:
            first.currentPrice > 0 ? String(first.currentPrice) : "",
        }));
      }

      setLoading(false);
    });
  }

  useEffect(() => {
    queueMicrotask(load);
  }, []);

  function selectFuel(ft: FuelType) {
    setForm((f) => ({
      ...f,
      fuelTypeId: String(ft.id),
      pricePerLiter: ft.currentPrice > 0 ? String(ft.currentPrice) : "",
    }));
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/meter-periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, pumpId: Number(form.pumpId) }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "บันทึกไม่สำเร็จ");
        return;
      }

      setShowForm(false);
      setForm((f) => ({
        ...f,
        meterStart: "",
        meterEnd: "",
        note: "",
      }));

      load();
    } catch {
      setError("เกิดข้อผิดพลาด");
    } finally {
      setSubmitting(false);
    }
  }

  async function closePeriod(id: number) {
    const end = closeEnd[id];
    if (!end) return;

    setClosingId(id);

    try {
      const res = await fetch(`/api/meter-periods/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meterEnd: end }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error ?? "บันทึกไม่สำเร็จ");
      } else {
        setCloseEnd((c) => {
          const n = { ...c };
          delete n[id];
          return n;
        });
        load();
      }
    } finally {
      setClosingId(null);
    }
  }

  async function deletePeriod(id: number) {
    if (!confirm("ลบรอบมิเตอร์นี้?")) return;

    setDeletingId(id);
    await fetch(`/api/meter-periods/${id}`, { method: "DELETE" });
    setDeletingId(null);
    load();
  }

  type DayGroup = {
    key: string;
    dateStr: string;
    fuelTypeId: number;
    fuelLabel: string;
    fuelName: string;
    pumpId: number | null;
    pumpLabel: string;
    shiftId: number | null;
    shiftName: string;
    periods: MeterPeriod[];
    meterLiters: number;
    meterRevenue: number;
    saleAmount: number;
    saleLiters: number;
    hasOpen: boolean;
  };

  const dayGroups: DayGroup[] = useMemo(() => {
    const map = new Map<string, DayGroup>();

    for (const p of periods) {
      const dateStr = new Date(p.date).toDateString();
      const key = `${dateStr}__${p.fuelTypeId}__${p.pumpId ?? "legacy"}__${p.shiftId ?? "legacy"}`;

      if (!map.has(key)) {
        const daySales = allSales.filter(
          (s) =>
            s.fuelTypeId === p.fuelTypeId &&
            s.pumpId === p.pumpId &&
            s.shiftId === p.shiftId &&
            new Date(s.date).toDateString() === dateStr
        );

        map.set(key, {
          key,
          dateStr,
          fuelTypeId: p.fuelTypeId,
          fuelLabel: p.fuelType.label,
          fuelName: p.fuelType.name,
          pumpId: p.pumpId,
          pumpLabel: p.pump?.label ?? "หัวจ่ายเดิม",
          shiftId: p.shiftId,
          shiftName: p.shift ? `ข้อมูลเดิม #${p.shift.id} · ${p.shift.openedByName}` : "รอบปัจจุบัน",
          periods: [],
          meterLiters: 0,
          meterRevenue: 0,
          saleAmount: daySales.reduce((a, s) => a + s.totalAmount, 0),
          saleLiters: daySales.reduce((a, s) => a + s.liters, 0),
          hasOpen: false,
        });
      }

      const g = map.get(key)!;
      g.periods.push(p);

      if (p.liters != null && p.totalRevenue != null) {
        g.meterLiters += p.liters;
        g.meterRevenue += p.totalRevenue;
      } else {
        g.hasOpen = true;
      }
    }

    return Array.from(map.values()).sort(
      (a, b) =>
        new Date(b.periods[0].date).getTime() -
        new Date(a.periods[0].date).getTime()
    );
  }, [periods, allSales]);

  const openGroups = dayGroups.filter((g) => g.hasOpen);
  const historyGroups = dayGroups.filter((g) => !g.hasOpen);

  const openPeriods = periods.filter((p) => p.meterEnd == null).length;
  const closedToday = periods.filter(
    (p) =>
      p.meterEnd != null &&
      new Date(p.date).toDateString() === new Date().toDateString()
  ).length;

  return (
    <main className="min-h-screen bg-[#eef4fb] text-slate-900">
      <div className="mx-auto min-h-screen w-full max-w-[480px] bg-[#f8fbff] shadow-[0_0_45px_rgba(15,23,42,0.08)] md:my-5 md:min-h-[calc(100vh-40px)] md:rounded-[34px] md:overflow-hidden">
        {/* APP HEADER */}
        <header className="bg-white px-5 pt-5 pb-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.push("/dashboard")}
              className="flex items-center gap-2"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-xl text-white shadow-lg shadow-blue-600/20">
                💧
              </div>

              <div className="text-left">
                <div className="text-[20px] font-black leading-none">
                  Fuel<span className="text-blue-600">POS</span>
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  ระบบจัดการสถานีน้ำมัน
                </div>
              </div>
            </button>

            <div className="flex items-center gap-2">
              <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 text-lg">
                🔔
                <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold">
                📅 {displayDate()}
              </div>
            </div>
          </div>
        </header>

        {/* PAGE TITLE */}
        <section className="px-5 pt-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">จัดการรอบการขาย</p>
              <h1 className="mt-1 text-[32px] font-black tracking-tight">
                มิเตอร์
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                เปิดรอบ ปิดรอบ และตรวจสอบยอดขาย
              </p>
            </div>

            <button
              onClick={() => setShowForm(true)}
              title="เปิดรอบมิเตอร์"
              className="mb-1 h-11 rounded-2xl bg-blue-600 px-4 text-sm font-bold text-white shadow-lg shadow-blue-600/20"
            >
              + เปิดรอบ
            </button>
          </div>
        </section>

        {/* SUMMARY */}
        <section className="grid grid-cols-2 gap-3 px-5 pt-5">
          <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-400">รอบที่เปิดอยู่</p>
            <div className="mt-1 flex items-end justify-between">
              <p className="text-[28px] font-black tabular-nums">{openPeriods}</p>
              <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-bold text-orange-600">
                กำลังใช้งาน
              </span>
            </div>
          </div>

          <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-400">ปิดรอบวันนี้</p>
            <div className="mt-1 flex items-end justify-between">
              <p className="text-[28px] font-black tabular-nums">{closedToday}</p>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-600">
                วันนี้
              </span>
            </div>
          </div>
        </section>

        {/* OPEN PERIODS */}
        <section className="px-5 pt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-black">รอบที่กำลังใช้งาน</h2>
            <span className="text-xs text-slate-400">
              {openGroups.length} รายการ
            </span>
          </div>

          {loading ? (
            <div className="rounded-[24px] bg-white p-8 text-center text-sm text-slate-400">
              กำลังโหลด...
            </div>
          ) : openGroups.length === 0 ? (
            <div className="rounded-[24px] border border-slate-200 bg-white p-7 text-center shadow-sm">
              <div className="text-3xl">📟</div>
              <p className="mt-2 font-bold">ยังไม่มีรอบเปิดอยู่</p>
              <p className="mt-1 text-xs text-slate-400">
                กด “+ เปิดรอบ” เพื่อเริ่มรอบใหม่
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {openGroups.map((g) => (
                <div
                  key={g.key}
                  className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm"
                >
                  <div className="flex items-center gap-3 px-5 pt-5">
                    <div
                      className={`h-12 w-12 rounded-2xl flex items-center justify-center text-xl ${
                        FUEL_ICON_BG[g.fuelName] ?? "bg-slate-50 text-slate-600"
                      }`}
                    >
                      ⛽
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            FUEL_COLOR[g.fuelName] ?? "bg-slate-400"
                          }`}
                        />
                        <h3 className="font-black">{g.fuelLabel}</h3>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        {shortDate(g.periods[0].date)}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-blue-600">
                        {g.pumpLabel} · {g.shiftName}
                      </p>
                    </div>

                    <span className="rounded-full bg-orange-50 px-3 py-1 text-[11px] font-bold text-orange-600">
                      ● กำลังใช้งาน
                    </span>
                  </div>

                  <div className="px-5 pb-5 pt-4">
                    {openMeterPeriods(g.periods).map((p) => (
                      <div key={p.id}>
                        <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4">
                          <div>
                            <p className="text-[11px] text-slate-400">
                              มิเตอร์เริ่ม
                            </p>
                            <p className="mt-1 text-xl font-black tabular-nums">
                              {fmt(p.meterStart)}
                            </p>
                          </div>

                          <div className="text-right">
                            <p className="text-[11px] text-slate-400">
                              ราคาในรอบ
                            </p>
                            <p className="mt-1 text-base font-bold tabular-nums">
                              {fmtDec(p.pricePerLiter)} ฿/L
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 rounded-2xl bg-orange-50 p-3">
                          <p className="mb-2 text-xs font-bold text-orange-700">
                            ปิดรอบนี้
                          </p>

                          <div className="flex gap-2">
                            <input
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              value={closeEnd[p.id] ?? ""}
                              onChange={(e) =>
                                setCloseEnd((c) => ({
                                  ...c,
                                  [p.id]: e.target.value,
                                }))
                              }
                              placeholder="ใส่มิเตอร์สิ้นรอบ"
                              className="min-w-0 flex-1 rounded-xl border border-orange-200 bg-white px-4 py-3 text-base font-bold tabular-nums outline-none focus:border-orange-400"
                            />

                            <button
                              onClick={() => closePeriod(p.id)}
                              disabled={!closeEnd[p.id] || closingId === p.id}
                              className="rounded-xl bg-orange-500 px-4 font-bold text-white disabled:opacity-40"
                            >
                              {closingId === p.id ? "..." : "ปิดรอบ"}
                            </button>
                          </div>
                        </div>

                        <div className="mt-3 text-right">
                          <button
                            onClick={() => deletePeriod(p.id)}
                            disabled={deletingId === p.id}
                            className="text-xs font-semibold text-red-400"
                          >
                            {deletingId === p.id ? "กำลังลบ..." : "ลบรอบ"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* HISTORY */}
        <section className="px-5 pt-7 pb-28">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-black">ประวัติล่าสุด</h2>
            {historyGroups.length > 5 && (
              <button
                type="button"
                aria-expanded={showAllHistory}
                onClick={() => setShowAllHistory((value) => !value)}
                className="min-h-10 rounded-xl px-2 text-xs font-bold text-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                {showAllHistory ? "ย่อรายการ ↑" : "ดูทั้งหมด →"}
              </button>
            )}
          </div>

          <div className="space-y-4">
            {visibleMeterHistory(historyGroups, showAllHistory).map((g) => {
              const diffLiters = g.saleLiters - g.meterLiters;
              const diffAmount = g.saleAmount - g.meterRevenue;
              const ok = Math.abs(diffLiters) < 2;

              return (
                <div
                  key={g.key}
                  className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-11 w-11 rounded-2xl flex items-center justify-center ${
                        FUEL_ICON_BG[g.fuelName] ?? "bg-slate-50 text-slate-600"
                      }`}
                    >
                      ⛽
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3 className="font-black">{g.fuelLabel}</h3>
                      <p className="text-xs text-slate-400">
                        {shortDate(g.periods[0].date)}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-blue-600">
                        {g.pumpLabel} · {g.shiftName}
                      </p>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                        ok
                          ? "bg-emerald-50 text-emerald-600"
                          : "bg-red-50 text-red-600"
                      }`}
                    >
                      {ok ? "ยอดตรงกัน" : "มียอดต่าง"}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <div className="rounded-2xl bg-blue-50 p-3 text-center">
                      <p className="text-[10px] text-blue-400">มิเตอร์</p>
                      <p className="mt-1 text-base font-black text-blue-700 tabular-nums">
                        {fmtDec(g.meterLiters)} L
                      </p>
                    </div>

                    <div className="rounded-2xl bg-slate-50 p-3 text-center">
                      <p className="text-[10px] text-slate-400">บันทึกขาย</p>
                      <p className="mt-1 text-base font-black text-slate-700 tabular-nums">
                        {fmtDec(g.saleLiters)} L
                      </p>
                    </div>

                    <div
                      className={`rounded-2xl p-3 text-center ${
                        ok ? "bg-emerald-50" : "bg-red-50"
                      }`}
                    >
                      <p
                        className={`text-[10px] ${
                          ok ? "text-emerald-500" : "text-red-500"
                        }`}
                      >
                        ส่วนต่าง
                      </p>
                      <p
                        className={`mt-1 text-base font-black tabular-nums ${
                          ok ? "text-emerald-700" : "text-red-700"
                        }`}
                      >
                        {diffLiters >= 0 ? "+" : ""}
                        {fmtDec(diffLiters)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex justify-between text-xs text-slate-400">
                    <span>มิเตอร์ {fmt(g.meterRevenue)} ฿</span>
                    <span>ขาย {fmt(g.saleAmount)} ฿</span>
                    <span>
                      ต่าง {diffAmount >= 0 ? "+" : ""}
                      {fmt(diffAmount)} ฿
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* BOTTOM NAV */}
        <nav className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[480px] border-t border-slate-200 bg-white/95 px-3 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2 backdrop-blur md:bottom-5 md:rounded-b-[34px]">
          <div className="grid grid-cols-5">
            <NavButton
              label="หน้าหลัก"
              icon="⌂"
              active={pathname === "/dashboard"}
              onClick={() => router.push("/dashboard")}
            />
            <NavButton
              label="ขาย"
              icon="⛽"
              active={pathname.startsWith("/sales") || pathname === "/quick"}
              onClick={() => router.push("/quick")}
            />
            <NavButton
              label="สต็อก"
              icon="◇"
              active={pathname.startsWith("/stock")}
              onClick={() => router.push("/stock")}
            />
            <NavButton
              label="มิเตอร์"
              icon="▥"
              active={pathname.startsWith("/meter")}
              onClick={() => router.push("/meter")}
            />
            <NavButton
              label="รายงาน"
              icon="▮"
              active={pathname.startsWith("/report")}
              onClick={() => router.push("/dashboard")}
            />
          </div>
        </nav>

        {/* OPEN ROUND BOTTOM SHEET */}
        {showForm && (
          <div className="fixed inset-0 z-[70] bg-slate-950/35 px-3 flex items-end justify-center">
            <div className="w-full max-w-[480px] rounded-t-[30px] bg-white p-5 shadow-2xl">
              <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200" />

              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-black">เปิดรอบมิเตอร์</h2>
                  <p className="mt-1 text-xs text-slate-400">
                    เลือกน้ำมันและใส่มิเตอร์เริ่มรอบ
                  </p>
                </div>

                <button
                  onClick={() => setShowForm(false)}
                  className="h-9 w-9 rounded-full bg-slate-100 text-slate-500"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                <label className="block">
                  <span className="mb-2 block text-xs font-bold text-slate-500">หัวจ่าย</span>
                  <select
                    value={form.pumpId}
                    onChange={(e) => setForm((f) => ({ ...f, pumpId: e.target.value }))}
                    required
                    className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base font-bold outline-none focus:border-blue-500"
                  >
                    <option value="">เลือกหัวจ่าย</option>
                    {pumps.map((pump) => <option key={pump.id} value={pump.id}>{pump.label}</option>)}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {fuelTypes.map((ft) => {
                    const active = form.fuelTypeId === String(ft.id);

                    return (
                      <button
                        key={ft.id}
                        type="button"
                        onClick={() => selectFuel(ft)}
                        className={`rounded-2xl border p-4 text-left ${
                          active
                            ? "border-blue-600 bg-blue-50 text-blue-700"
                            : "border-slate-200 bg-white text-slate-700"
                        }`}
                      >
                        <div className="font-black">{ft.label}</div>
                        <div className="mt-1 text-xs opacity-70">
                          {fmtDec(ft.currentPrice)} บาท/L
                        </div>
                      </button>
                    );
                  })}
                </div>

                <label className="block">
                  <span className="mb-2 block text-xs font-bold text-slate-500">
                    มิเตอร์เริ่มรอบ
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={form.meterStart}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, meterStart: e.target.value }))
                    }
                    placeholder="0.00"
                    required
                    className="h-14 w-full rounded-2xl border border-slate-200 px-4 text-xl font-black tabular-nums outline-none focus:border-blue-500"
                  />
                </label>

                <details>
                  <summary className="cursor-pointer text-sm font-semibold text-slate-500">
                    ตัวเลือกเพิ่มเติม
                  </summary>

                  <div className="mt-3 space-y-3">
                    <input
                      type="date"
                      value={form.date}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, date: e.target.value }))
                      }
                      className="h-12 w-full rounded-2xl border border-slate-200 px-4"
                    />

                    <input
                      type="text"
                      value={form.note}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, note: e.target.value }))
                      }
                      placeholder="หมายเหตุ (ไม่บังคับ)"
                      className="h-12 w-full rounded-2xl border border-slate-200 px-4"
                    />
                  </div>
                </details>

                {error && (
                  <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || !form.meterStart}
                  className="h-14 w-full rounded-2xl bg-blue-600 text-base font-black text-white shadow-lg shadow-blue-600/20 disabled:bg-slate-200 disabled:text-slate-400"
                >
                  {submitting ? "กำลังบันทึก..." : "เปิดรอบมิเตอร์"}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function NavButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex min-h-[58px] flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-bold ${
        active ? "text-blue-600" : "text-slate-400"
      }`}
    >
      <span className={`text-[22px] leading-none ${active ? "scale-110" : ""}`}>
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}
