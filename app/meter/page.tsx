"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type FuelType = { id: number; name: string; label: string; currentPrice: number };
type MeterPeriod = {
  id: number;
  date: string;
  fuelTypeId: number;
  meterStart: number;
  meterEnd: number;
  liters: number;
  pricePerLiter: number;
  totalRevenue: number;
  note: string | null;
  fuelType: { label: string; name: string };
};
type Sale = { fuelTypeId: number; totalAmount: number; liters: number; date: string };

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtDec(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function shortDate(s: string) {
  return new Date(s).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
}

const FUEL_COLOR: Record<string, string> = {
  diesel: "bg-amber-400",
  benzin95: "bg-blue-400",
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
      fetch("/api/fuel-types").then((r) => r.json()).catch(() => []),
      fetch("/api/meter-periods").then((r) => r.json()).catch(() => []),
      fetch("/api/sales").then((r) => r.json()).catch(() => []),
    ]).then(([ft, mp, sl]) => {
      const filtered = (ft as FuelType[]).filter((f: FuelType) => ["diesel", "benzin95"].includes(f.name));
      setFuelTypes(filtered.length > 0 ? filtered : ft);
      setPeriods(mp ?? []);
      setAllSales(sl ?? []);
      if ((ft as FuelType[]).length > 0) {
        const first = filtered.length > 0 ? filtered[0] : ft[0];
        setForm((f) => ({
          ...f,
          fuelTypeId: String(first.id),
          pricePerLiter: first.currentPrice > 0 ? String(first.currentPrice) : "",
        }));
      }
      setLoading(false);
    });
  }

  useEffect(() => { load(); }, []);

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
      if (!res.ok) { setError(data.error ?? "บันทึกไม่สำเร็จ"); return; }
      setShowForm(false);
      setForm((f) => ({ ...f, meterStart: "", meterEnd: "", note: "" }));
      load();
    } catch { setError("เกิดข้อผิดพลาด"); }
    finally { setSubmitting(false); }
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
    if (!res.ok) alert(data.error ?? "บันทึกไม่สำเร็จ");
    else { setCloseEnd((c) => { const n = { ...c }; delete n[id]; return n; }); load(); }
    setClosingId(null);
  }

  async function deletePeriod(id: number) {
    if (!confirm("ลบรอบมิเตอร์นี้?")) return;
    setDeletingId(id);
    await fetch(`/api/meter-periods/${id}`, { method: "DELETE" });
    setDeletingId(null);
    load();
  }

  // จัดกลุ่ม periods ตามวัน+ชนิด
  type DayGroup = {
    key: string;
    dateStr: string;
    fuelTypeId: number;
    fuelLabel: string;
    fuelName: string;
    periods: MeterPeriod[];
    meterLiters: number;      // รวมเฉพาะรอบที่จบแล้ว
    meterRevenue: number;
    saleAmount: number;
    saleLiters: number;
    hasOpen: boolean;
  };

  const dayGroups: DayGroup[] = (() => {
    const map = new Map<string, DayGroup>();
    for (const p of periods) {
      const dateStr = new Date(p.date).toDateString();
      const key = `${dateStr}__${p.fuelTypeId}`;
      if (!map.has(key)) {
        const daySales = allSales.filter(
          (s) => s.fuelTypeId === p.fuelTypeId && new Date(s.date).toDateString() === dateStr
        );
        map.set(key, {
          key, dateStr, fuelTypeId: p.fuelTypeId,
          fuelLabel: p.fuelType.label, fuelName: p.fuelType.name,
          periods: [],
          meterLiters: 0, meterRevenue: 0,
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
    return Array.from(map.values()).sort((a, b) =>
      new Date(b.periods[0].date).getTime() - new Date(a.periods[0].date).getTime()
    );
  })();

  const liters = Number(form.meterEnd || 0) - Number(form.meterStart || 0);
  const revenue = liters > 0 && Number(form.pricePerLiter) > 0 ? liters * Number(form.pricePerLiter) : 0;

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard")} className="text-gray-500 text-xl w-8">←</button>
          <h1 className="text-base font-bold text-gray-900">มิเตอร์รอบ</h1>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700"
        >
          + บันทึกรอบ
        </button>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">

        {/* Form */}
        {showForm && (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <p className="text-sm font-bold text-gray-700 mb-4">บันทึกมิเตอร์รอบใหม่</p>
            <form onSubmit={handleSubmit} className="space-y-4">

              {/* ชนิดน้ำมัน */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">ชนิดน้ำมัน</p>
                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(fuelTypes.length, 4)}, 1fr)` }}>
                  {fuelTypes.map((ft) => (
                    <button key={ft.id} type="button" onClick={() => selectFuel(ft)}
                      className={`py-3 rounded-xl font-bold text-sm transition-all ${form.fuelTypeId === String(ft.id) ? "bg-blue-600 text-white" : "bg-gray-50 text-gray-700 border-2 border-gray-200"}`}>
                      {ft.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* มิเตอร์ */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">มิเตอร์เริ่มรอบ</p>
                  <input type="number" inputMode="decimal" step="0.01" value={form.meterStart}
                    onChange={(e) => setForm((f) => ({ ...f, meterStart: e.target.value }))}
                    placeholder="0.00" required
                    className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 text-base font-mono focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">มิเตอร์สิ้นรอบ <span className="text-gray-300">(ใส่ทีหลังได้)</span></p>
                  <input type="number" inputMode="decimal" step="0.01" value={form.meterEnd}
                    onChange={(e) => setForm((f) => ({ ...f, meterEnd: e.target.value }))}
                    placeholder="ว่างไว้ก่อน"
                    className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 text-base font-mono focus:outline-none focus:border-blue-500" />
                </div>
              </div>

              {/* Preview */}
              {liters > 0 && (
                <div className="bg-blue-50 rounded-xl px-4 py-3 grid grid-cols-2 gap-3 text-center">
                  <div>
                    <p className="text-xs text-blue-400">ลิตรจากมิเตอร์</p>
                    <p className="text-xl font-bold text-blue-700">{fmtDec(liters)} L</p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-400">รายได้จากมิเตอร์</p>
                    <p className="text-xl font-bold text-blue-700">{revenue > 0 ? fmt(revenue) : "—"} ฿</p>
                  </div>
                </div>
              )}

              {/* ราคา/ลิตร */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">ราคา/ลิตรในรอบนี้</p>
                <input type="number" step="0.01" inputMode="decimal" value={form.pricePerLiter}
                  onChange={(e) => setForm((f) => ({ ...f, pricePerLiter: e.target.value }))}
                  placeholder="0.00" required
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-base font-mono focus:outline-none focus:border-blue-500" />
              </div>

              {/* วันที่ */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">วันที่</p>
                <input type="date" value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-500" />
              </div>

              {/* หมายเหตุ */}
              <input type="text" value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="หมายเหตุ (ไม่บังคับ)"
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500" />

              {error && <p className="text-red-600 text-sm bg-red-50 rounded-xl px-3 py-2">{error}</p>}

              <div className="flex gap-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 border-2 border-gray-200 text-gray-500 py-3 rounded-xl font-semibold text-sm">
                  ยกเลิก
                </button>
                <button type="submit" disabled={submitting}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-50">
                  {submitting ? "..." : "บันทึก"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* รายการ */}
        {loading ? (
          <div className="text-center py-20 text-gray-300 text-4xl animate-pulse">...</div>
        ) : periods.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center text-gray-300">
            <p className="text-4xl mb-2">📟</p>
            <p className="text-sm">ยังไม่มีรอบมิเตอร์</p>
          </div>
        ) : (
          <div className="space-y-4">
            {dayGroups.map((g) => {
              const diffLiters = g.saleLiters - g.meterLiters;
              const diffAmount = g.saleAmount - g.meterRevenue;
              const ok = Math.abs(diffLiters) < 2;
              return (
                <div key={g.key} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  {/* Day header */}
                  <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${FUEL_COLOR[g.fuelName] ?? "bg-gray-400"}`} />
                    <p className="text-sm font-bold text-gray-800">{g.fuelLabel}</p>
                    <p className="text-xs text-gray-400">{shortDate(g.periods[0].date)}</p>
                    {g.hasOpen && <span className="ml-auto text-xs text-orange-500 font-semibold">มีรอบเปิดอยู่</span>}
                  </div>

                  {/* รอบย่อย */}
                  <div className="divide-y divide-gray-50">
                    {g.periods.map((p) => (
                      <div key={p.id} className="px-5 py-3">
                        <div className="flex justify-between items-center mb-1">
                          <p className="text-xs text-gray-500">
                            {fmtDec(p.pricePerLiter)} ฿/ล · มิเตอร์ {fmt(p.meterStart)} →{" "}
                            {p.meterEnd != null
                              ? <>{fmt(p.meterEnd)} <span className="text-blue-600 font-semibold">({fmtDec(p.liters ?? 0)} L)</span></>
                              : <span className="text-orange-400 font-semibold">ยังไม่จบ</span>}
                          </p>
                          <button onClick={() => deletePeriod(p.id)} disabled={deletingId === p.id}
                            className="text-red-400 hover:text-red-600 text-xs px-2 py-0.5 rounded hover:bg-red-50 disabled:opacity-40">
                            {deletingId === p.id ? "..." : "ลบ"}
                          </button>
                        </div>
                        {p.meterEnd == null && (
                          <div className="flex gap-2 mt-2">
                            <input type="number" inputMode="decimal" step="0.01"
                              value={closeEnd[p.id] ?? ""}
                              onChange={(e) => setCloseEnd((c) => ({ ...c, [p.id]: e.target.value }))}
                              placeholder="ใส่มิเตอร์สิ้นรอบ"
                              className="flex-1 border-2 border-orange-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-orange-400" />
                            <button onClick={() => closePeriod(p.id)}
                              disabled={!closeEnd[p.id] || closingId === p.id}
                              className="bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-orange-600 disabled:opacity-40">
                              {closingId === p.id ? "..." : "ปิดรอบ"}
                            </button>
                          </div>
                        )}
                        {p.note && <p className="text-xs text-gray-400 mt-1">{p.note}</p>}
                      </div>
                    ))}
                  </div>

                  {/* สรุปเทียบรวมทั้งวัน — แสดงเฉพาะถ้าจบทุกรอบแล้ว */}
                  {!g.hasOpen && (
                    <div className="px-5 py-3 border-t border-gray-100">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">เทียบรวมทั้งวัน</p>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="bg-blue-50 rounded-xl px-2 py-2">
                          <p className="text-blue-400">มิเตอร์รวม</p>
                          <p className="font-bold text-blue-700 text-base">{fmtDec(g.meterLiters)} L</p>
                          <p className="text-blue-500 font-semibold">{fmt(g.meterRevenue)} ฿</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl px-2 py-2">
                          <p className="text-gray-400">บันทึกขาย</p>
                          <p className="font-bold text-gray-700 text-base">{fmtDec(g.saleLiters)} L</p>
                          <p className="text-gray-600 font-semibold">{fmt(g.saleAmount)} ฿</p>
                        </div>
                        <div className={`rounded-xl px-2 py-2 ${ok ? "bg-green-50" : "bg-red-50"}`}>
                          <p className={ok ? "text-green-400" : "text-red-400"}>ส่วนต่าง</p>
                          <p className={`font-bold text-base ${ok ? "text-green-700" : "text-red-600"}`}>
                            {diffLiters >= 0 ? "+" : ""}{fmtDec(diffLiters)} L
                          </p>
                          <p className={`font-semibold ${ok ? "text-green-600" : "text-red-600"}`}>
                            {diffAmount >= 0 ? "+" : ""}{fmt(diffAmount)} ฿
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
