"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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
  fuelType: { label: string; name: string };
};

type Sale = {
  fuelTypeId: number;
  totalAmount: number;
  liters: number;
  date: string;
};

function fmt(n: number) {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function fmtDec(n: number) {
  return n.toLocaleString("th-TH", {
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

const FUEL_COLOR: Record<string, string> = {
  diesel: "bg-amber-400",
  benzin95: "bg-blue-500",
  benzin91: "bg-emerald-500",
  e20: "bg-violet-500",
};

const FUEL_SOFT: Record<string, string> = {
  diesel: "bg-amber-50 text-amber-700 border-amber-100",
  benzin95: "bg-blue-50 text-blue-700 border-blue-100",
  benzin91: "bg-emerald-50 text-emerald-700 border-emerald-100",
  e20: "bg-violet-50 text-violet-700 border-violet-100",
};

export default function MeterPage() {
  const router = useRouter();
  const today = new Date().toISOString().split("T")[0];

  const [fuelTypes, setFuelTypes] = useState<FuelType[]>([]);
  const [periods, setPeriods] = useState<MeterPeriod[]>([]);
  const [allSales, setAllSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [closingId, setClosingId] = useState<number | null>(null);
  const [closeEnd, setCloseEnd] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    fuelTypeId: "",
    meterStart: "",
    meterEnd: "",
    pricePerLiter: "",
    date: today,
    note: "",
  });

  function load() {
    setLoading(true);

    Promise.all([
      fetch("/api/fuel-types")
        .then((r) => r.json())
        .catch(() => []),
      fetch("/api/meter-periods")
        .then((r) => r.json())
        .catch(() => []),
      fetch("/api/sales")
        .then((r) => r.json())
        .catch(() => []),
    ]).then(([ft, mp, sl]) => {
      const filtered = (ft as FuelType[]).filter((f: FuelType) =>
        ["diesel", "benzin95"].includes(f.name)
      );

      setFuelTypes(filtered.length > 0 ? filtered : ft);
      setPeriods(mp ?? []);
      setAllSales(sl ?? []);

      if ((ft as FuelType[]).length > 0) {
        const first = filtered.length > 0 ? filtered[0] : ft[0];

        setForm((f) => ({
          ...f,
          fuelTypeId: String(first.id),
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
        body: JSON.stringify(form),
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

    setClosingId(null);
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
      const key = `${dateStr}__${p.fuelTypeId}`;

      if (!map.has(key)) {
        const daySales = allSales.filter(
          (s) =>
            s.fuelTypeId === p.fuelTypeId &&
            new Date(s.date).toDateString() === dateStr
        );

        map.set(key, {
          key,
          dateStr,
          fuelTypeId: p.fuelTypeId,
          fuelLabel: p.fuelType.label,
          fuelName: p.fuelType.name,
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

  const openPeriods = periods.filter((p) => p.meterEnd == null).length;
  const closedToday = periods.filter(
    (p) =>
      p.meterEnd != null &&
      new Date(p.date).toDateString() === new Date().toDateString()
  ).length;

  const liters = Number(form.meterEnd || 0) - Number(form.meterStart || 0);
  const revenue =
    liters > 0 && Number(form.pricePerLiter) > 0
      ? liters * Number(form.pricePerLiter)
      : 0;

  return (
    <main className="min-h-screen bg-[#F6F8FC] text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="max-w-3xl mx-auto h-16 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/dashboard")}
              className="h-10 w-10 rounded-xl flex items-center justify-center text-xl text-slate-700 hover:bg-slate-100"
              aria-label="กลับ"
            >
              ←
            </button>

            <div>
              <h1 className="font-extrabold text-base">มิเตอร์รอบ</h1>
              <p className="text-[11px] text-slate-400">
                เปิดรอบ • ปิดรอบ • เทียบยอดขาย
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowForm((v) => !v)}
            className="h-10 px-4 rounded-xl bg-blue-600 text-white text-sm font-bold shadow-sm hover:bg-blue-700"
          >
            {showForm ? "ปิดฟอร์ม" : "+ บันทึกรอบ"}
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-5 space-y-5">
        {/* Summary */}
        <section className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-400">รอบที่เปิดอยู่</p>
            <p className="mt-1 text-2xl font-black tabular-nums">
              {openPeriods}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-400">ปิดรอบวันนี้</p>
            <p className="mt-1 text-2xl font-black tabular-nums">
              {closedToday}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-400">ชนิดน้ำมัน</p>
            <p className="mt-1 text-2xl font-black tabular-nums">
              {fuelTypes.length}
            </p>
          </div>
        </section>

        {/* Form */}
        {showForm && (
          <section className="rounded-[24px] border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-extrabold">บันทึกมิเตอร์รอบใหม่</h2>
              <p className="text-xs text-slate-400 mt-1">
                เริ่มรอบก่อน แล้วกรอกมิเตอร์สิ้นรอบภายหลังได้
              </p>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-5">
              <div>
                <p className="text-xs font-bold text-slate-500 mb-2">
                  ชนิดน้ำมัน
                </p>

                <div className="grid grid-cols-2 gap-3">
                  {fuelTypes.map((ft) => {
                    const active = form.fuelTypeId === String(ft.id);

                    return (
                      <button
                        key={ft.id}
                        type="button"
                        onClick={() => selectFuel(ft)}
                        className={`rounded-2xl border p-4 text-left transition ${
                          active
                            ? "border-blue-600 bg-blue-50 text-blue-700"
                            : "border-slate-200 bg-white text-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold">{ft.label}</span>
                          {active && (
                            <span className="h-6 w-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center">
                              ✓
                            </span>
                          )}
                        </div>

                        <p className="mt-2 text-xs opacity-70 tabular-nums">
                          {ft.currentPrice > 0
                            ? `${fmtDec(ft.currentPrice)} บาท/L`
                            : "ยังไม่ตั้งราคา"}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className="block text-xs font-bold text-slate-500 mb-2">
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
                    className="w-full h-14 rounded-2xl border border-slate-200 px-4 text-lg font-bold tabular-nums outline-none focus:border-blue-500"
                  />
                </label>

                <label>
                  <span className="block text-xs font-bold text-slate-500 mb-2">
                    มิเตอร์สิ้นรอบ
                    <span className="font-normal text-slate-300">
                      {" "}
                      (ใส่ทีหลังได้)
                    </span>
                  </span>

                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={form.meterEnd}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, meterEnd: e.target.value }))
                    }
                    placeholder="ว่างไว้ก่อน"
                    className="w-full h-14 rounded-2xl border border-slate-200 px-4 text-lg font-bold tabular-nums outline-none focus:border-blue-500"
                  />
                </label>
              </div>

              {liters > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-blue-50 p-4">
                    <p className="text-xs text-blue-400">ลิตรจากมิเตอร์</p>
                    <p className="mt-1 text-2xl font-black text-blue-700 tabular-nums">
                      {fmtDec(liters)} L
                    </p>
                  </div>

                  <div className="rounded-2xl bg-emerald-50 p-4">
                    <p className="text-xs text-emerald-500">รายได้จากมิเตอร์</p>
                    <p className="mt-1 text-2xl font-black text-emerald-700 tabular-nums">
                      {revenue > 0 ? `${fmt(revenue)} ฿` : "—"}
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className="block text-xs font-bold text-slate-500 mb-2">
                    ราคา/ลิตรในรอบนี้
                  </span>

                  <input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={form.pricePerLiter}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        pricePerLiter: e.target.value,
                      }))
                    }
                    placeholder="0.00"
                    required
                    className="w-full h-12 rounded-2xl border border-slate-200 px-4 font-bold tabular-nums outline-none focus:border-blue-500"
                  />
                </label>

                <label>
                  <span className="block text-xs font-bold text-slate-500 mb-2">
                    วันที่
                  </span>

                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, date: e.target.value }))
                    }
                    className="w-full h-12 rounded-2xl border border-slate-200 px-4 outline-none focus:border-blue-500"
                  />
                </label>
              </div>

              <input
                type="text"
                value={form.note}
                onChange={(e) =>
                  setForm((f) => ({ ...f, note: e.target.value }))
                }
                placeholder="หมายเหตุ (ไม่บังคับ)"
                className="w-full h-12 rounded-2xl border border-slate-200 px-4 text-sm outline-none focus:border-blue-500"
              />

              {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="h-12 rounded-2xl border border-slate-200 bg-white font-bold text-slate-500"
                >
                  ยกเลิก
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  className="h-12 rounded-2xl bg-blue-600 font-bold text-white disabled:opacity-50"
                >
                  {submitting ? "กำลังบันทึก..." : "บันทึกรอบ"}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* List */}
        {loading ? (
          <div className="py-20 text-center text-slate-300">กำลังโหลด...</div>
        ) : periods.length === 0 ? (
          <div className="rounded-[24px] border border-slate-200 bg-white p-10 text-center">
            <div className="text-4xl">📟</div>
            <p className="mt-3 font-bold">ยังไม่มีรอบมิเตอร์</p>
            <p className="mt-1 text-sm text-slate-400">
              กด “บันทึกรอบ” เพื่อเริ่มใช้งาน
            </p>
          </div>
        ) : (
          <section className="space-y-4">
            {dayGroups.map((g) => {
              const diffLiters = g.saleLiters - g.meterLiters;
              const diffAmount = g.saleAmount - g.meterRevenue;
              const ok = Math.abs(diffLiters) < 2;

              return (
                <article
                  key={g.key}
                  className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm"
                >
                  {/* Header */}
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
                    <div
                      className={`h-3 w-3 rounded-full ${
                        FUEL_COLOR[g.fuelName] ?? "bg-slate-400"
                      }`}
                    />

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-extrabold">{g.fuelLabel}</h3>
                        <span className="text-xs text-slate-400">
                          {shortDate(g.periods[0].date)}
                        </span>
                      </div>

                      <p className="text-xs text-slate-400 mt-0.5">
                        {g.periods.length} รอบ
                      </p>
                    </div>

                    {g.hasOpen && (
                      <span className="ml-auto rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-600">
                        มีรอบเปิดอยู่
                      </span>
                    )}
                  </div>

                  {/* Periods */}
                  <div className="divide-y divide-slate-100">
                    {g.periods.map((p) => {
                      const isOpen = p.meterEnd == null;

                      return (
                        <div key={p.id} className="p-5">
                          <div className="flex items-start gap-3">
                            <div
                              className={`mt-1 h-10 w-10 shrink-0 rounded-xl border flex items-center justify-center text-sm font-black ${
                                FUEL_SOFT[g.fuelName] ??
                                "bg-slate-50 text-slate-600 border-slate-100"
                              }`}
                            >
                              ⛽
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-xs text-slate-400">
                                    ราคา {fmtDec(p.pricePerLiter)} บาท/L
                                  </p>

                                  <p className="mt-1 text-sm font-bold tabular-nums">
                                    {fmt(p.meterStart)}
                                    <span className="mx-2 text-slate-300">→</span>
                                    {isOpen ? (
                                      <span className="text-orange-500">
                                        ยังไม่จบ
                                      </span>
                                    ) : (
                                      <>
                                        {fmt(p.meterEnd ?? 0)}
                                        <span className="ml-2 text-blue-600">
                                          ({fmtDec(p.liters ?? 0)} L)
                                        </span>
                                      </>
                                    )}
                                  </p>
                                </div>

                                <button
                                  onClick={() => deletePeriod(p.id)}
                                  disabled={deletingId === p.id}
                                  className="text-xs font-semibold text-red-400 hover:text-red-600"
                                >
                                  {deletingId === p.id ? "..." : "ลบ"}
                                </button>
                              </div>

                              {p.note && (
                                <p className="mt-2 text-xs text-slate-400">
                                  {p.note}
                                </p>
                              )}
                            </div>
                          </div>

                          {isOpen && (
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
                                  className="min-w-0 flex-1 h-12 rounded-xl border border-orange-200 bg-white px-4 font-bold tabular-nums outline-none focus:border-orange-400"
                                />

                                <button
                                  onClick={() => closePeriod(p.id)}
                                  disabled={!closeEnd[p.id] || closingId === p.id}
                                  className="h-12 px-5 rounded-xl bg-orange-500 text-white text-sm font-bold disabled:opacity-40"
                                >
                                  {closingId === p.id ? "..." : "ปิดรอบ"}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Summary */}
                  {!g.hasOpen && (
                    <div className="border-t border-slate-100 p-5">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                          เทียบรวมทั้งวัน
                        </p>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            ok
                              ? "bg-emerald-50 text-emerald-600"
                              : "bg-red-50 text-red-600"
                          }`}
                        >
                          {ok ? "ยอดตรงกัน" : "มียอดต่าง"}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-2xl bg-blue-50 p-3 text-center">
                          <p className="text-[11px] text-blue-400">
                            มิเตอร์รวม
                          </p>
                          <p className="mt-1 text-lg font-black text-blue-700 tabular-nums">
                            {fmtDec(g.meterLiters)} L
                          </p>
                          <p className="text-xs font-semibold text-blue-500">
                            {fmt(g.meterRevenue)} ฿
                          </p>
                        </div>

                        <div className="rounded-2xl bg-slate-50 p-3 text-center">
                          <p className="text-[11px] text-slate-400">
                            บันทึกขาย
                          </p>
                          <p className="mt-1 text-lg font-black text-slate-700 tabular-nums">
                            {fmtDec(g.saleLiters)} L
                          </p>
                          <p className="text-xs font-semibold text-slate-500">
                            {fmt(g.saleAmount)} ฿
                          </p>
                        </div>

                        <div
                          className={`rounded-2xl p-3 text-center ${
                            ok ? "bg-emerald-50" : "bg-red-50"
                          }`}
                        >
                          <p
                            className={`text-[11px] ${
                              ok ? "text-emerald-500" : "text-red-500"
                            }`}
                          >
                            ส่วนต่าง
                          </p>

                          <p
                            className={`mt-1 text-lg font-black tabular-nums ${
                              ok ? "text-emerald-700" : "text-red-700"
                            }`}
                          >
                            {diffLiters >= 0 ? "+" : ""}
                            {fmtDec(diffLiters)} L
                          </p>

                          <p
                            className={`text-xs font-semibold ${
                              ok ? "text-emerald-600" : "text-red-600"
                            }`}
                          >
                            {diffAmount >= 0 ? "+" : ""}
                            {fmt(diffAmount)} ฿
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
