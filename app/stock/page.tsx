"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type StockItem = { id: number; fuelTypeId: number; currentLiters: number; fuelType: { name: string; label: string } };
type Purchase = { id: number; date: string; fuelTypeId: number; liters: number; costPerLiter: number; totalCost: number; invoiceNo: string | null; supplier: string | null; isPaid: boolean; paidNote: string | null; fuelType: { label: string; currentPrice: number }; audits: { actorName: string; oldCost: number; newCost: number; reason: string; createdAt: string }[] };
type StockCheck = { id: number; date: string; systemLiters: number; actualLiters: number; difference: number; fuelType: { label: string } };
type Product = { id: number; name: string; category: string; size: string; unit: string; currentPrice: number; costPrice: number; currentStock: number; minStock: number; isActive: boolean };
type DebtPayment = { id: number; amount: number; note: string | null; paidAt: string };
type SupplierDebt = { id: number; date: string; supplier: string; amount: number; note: string | null; isPaid: boolean; paidAt: string | null; paidNote: string | null; payments: DebtPayment[] };
type CompareItem = {
  fuelTypeId: number; label: string;
  lastCheckDate: string | null; lastCheckActual: number;
  totalPurchasedAfter: number;
  soldByCash: number; soldByMeter: number;
  systemStock: number; stockByCash: number; stockByMeter: number;
  diffMeterVsCash: number;
  meterDaysCount: number; estimateDaysCount: number;
};

const LOW_THRESHOLD = 1000;
const FUEL_COLOR: Record<string, string> = {
  diesel: "bg-amber-400",
  benzin95: "bg-blue-400",
  benzin91: "bg-green-400",
  e20: "bg-purple-400",
};
const FUEL_COLOR_LIGHT: Record<string, string> = {
  diesel: "bg-amber-200",
  benzin95: "bg-blue-200",
  benzin91: "bg-green-200",
  e20: "bg-purple-200",
};

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtDec(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function shortDate(s: string) {
  return new Date(s).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

export default function StockPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [checks, setChecks] = useState<StockCheck[]>([]);
  const [tab, setTab] = useState<"stock" | "purchases" | "checks">("stock");
  const [loading, setLoading] = useState(true);
  const [compares, setCompares] = useState<CompareItem[]>([]);
  const [debts, setDebts] = useState<SupplierDebt[]>([]);
  const [showDebtForm, setShowDebtForm] = useState(false);
  const [debtForm, setDebtForm] = useState({ supplier: "", amount: "", note: "", date: new Date().toISOString().split("T")[0] });
  const [savingDebt, setSavingDebt] = useState(false);
  const [markingDebtId, setMarkingDebtId] = useState<number | null>(null);
  const [partialId, setPartialId] = useState<number | null>(null);
  const [partialAmount, setPartialAmount] = useState("");
  const [deletingPaymentId, setDeletingPaymentId] = useState<number | null>(null);
  const [deletingDebtId, setDeletingDebtId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletingCheckId, setDeletingCheckId] = useState<number | null>(null);
  const [markingPaidId, setMarkingPaidId] = useState<number | null>(null);
  const [editingPurchaseId, setEditingPurchaseId] = useState<number | null>(null);
  const [editCost, setEditCost] = useState("");
  const [editReason, setEditReason] = useState("");

  function reload() {
    setLoading(true);
    Promise.all([
      fetch("/api/fuel-stock").then((r) => r.json()).catch(() => []),
      fetch("/api/purchases").then((r) => r.json()).catch(() => []),
      fetch("/api/stock-checks").then((r) => r.json()).catch(() => []),
      fetch("/api/products?all=1").then((r) => r.json()).catch(() => []),
      fetch("/api/fuel-stock/compare").then((r) => r.json()).catch(() => []),
      fetch("/api/supplier-debts").then((r) => r.json()).catch(() => []),
    ]).then(([s, p, c, pr, cmp, db]) => {
      setStocks(s ?? []);
      setPurchases(p ?? []);
      setChecks(c ?? []);
      setProducts(pr ?? []);
      setCompares(cmp ?? []);
      setDebts(db ?? []);
      setLoading(false);
    });
  }

  useEffect(() => { queueMicrotask(reload); }, []);

  async function deleteCheck(id: number, label: string) {
    if (!confirm(`ลบประวัติวัดถัง ${label}?\n(สต๊อกจะไม่เปลี่ยน)`)) return;
    setDeletingCheckId(id);
    try {
      const res = await fetch(`/api/stock-checks/${id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); alert(d.error ?? "ลบไม่สำเร็จ"); }
      else reload();
    } catch { alert("เกิดข้อผิดพลาด"); }
    finally { setDeletingCheckId(null); }
  }

  async function saveDebt(e: React.FormEvent) {
    e.preventDefault();
    setSavingDebt(true);
    try {
      const res = await fetch("/api/supplier-debts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(debtForm),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error ?? "บันทึกไม่สำเร็จ"); return; }
      setShowDebtForm(false);
      setDebtForm({ supplier: "", amount: "", note: "", date: new Date().toISOString().split("T")[0] });
      reload();
    } catch { alert("เกิดข้อผิดพลาด"); }
    finally { setSavingDebt(false); }
  }

  async function deletePayment(debtId: number, paymentId: number) {
    setDeletingPaymentId(paymentId);
    try {
      const res = await fetch(`/api/supplier-debts/${debtId}/payments/${paymentId}`, { method: "DELETE" });
      if (!res.ok) alert("ลบไม่สำเร็จ");
      else reload();
    } catch { alert("เกิดข้อผิดพลาด"); }
    finally { setDeletingPaymentId(null); }
  }

  async function payPartial(id: number) {
    const amt = Number(partialAmount);
    if (!amt || amt <= 0) return;
    setMarkingDebtId(id);
    try {
      const res = await fetch(`/api/supplier-debts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partialAmount: amt }),
      });
      if (!res.ok) alert("บันทึกไม่สำเร็จ");
      else { setPartialId(null); setPartialAmount(""); reload(); }
    } catch { alert("เกิดข้อผิดพลาด"); }
    finally { setMarkingDebtId(null); }
  }

  async function markDebtPaid(id: number) {
    setMarkingDebtId(id);
    try {
      const res = await fetch(`/api/supplier-debts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPaid: true }),
      });
      if (!res.ok) alert("บันทึกไม่สำเร็จ");
      else reload();
    } catch { alert("เกิดข้อผิดพลาด"); }
    finally { setMarkingDebtId(null); }
  }

  async function deleteDebt(id: number) {
    if (!confirm("ลบรายการค้างจ่ายนี้?")) return;
    setDeletingDebtId(id);
    try {
      await fetch(`/api/supplier-debts/${id}`, { method: "DELETE" });
      reload();
    } finally { setDeletingDebtId(null); }
  }

  async function markPaid(id: number) {
    setMarkingPaidId(id);
    try {
      const res = await fetch(`/api/purchases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPaid: true }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error ?? "บันทึกไม่สำเร็จ"); }
      else reload();
    } catch { alert("เกิดข้อผิดพลาด"); }
    finally { setMarkingPaidId(null); }
  }

  async function deletePurchase(id: number, liters: number, label: string) {
    if (!confirm(`ลบรายการ ${label} +${liters.toLocaleString()} L?\n(สต๊อกจะถูกหักออก)`)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/purchases/${id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); alert(d.error ?? "ลบไม่สำเร็จ"); }
      else reload();
    } catch { alert("เกิดข้อผิดพลาด"); }
    finally { setDeletingId(null); }
  }

  async function savePurchaseCost(id: number) {
    const cost = Number(editCost);
    if (!Number.isFinite(cost) || cost <= 0 || !editReason.trim()) return alert("กรอกราคาทุนและเหตุผล");
    const res = await fetch(`/api/purchases/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ costPerLiter: cost, reason: editReason }) });
    if (!res.ok) return alert((await res.json()).error ?? "แก้ไขไม่สำเร็จ");
    setEditingPurchaseId(null); setEditCost(""); setEditReason(""); reload();
  }

  const totalLiters = stocks.reduce((a, s) => a + s.currentLiters, 0);
  const unpaidPurchases = purchases.filter((p) => !p.isPaid);
  const totalUnpaidPurchases = unpaidPurchases.reduce((a, p) => a + p.totalCost, 0);
  const unpaidDebts = debts.filter((d) => !d.isPaid);
  const totalUnpaidDebts = unpaidDebts.reduce((a, d) => a + d.amount, 0);
  const totalUnpaid = totalUnpaidPurchases + totalUnpaidDebts;
  const lowAlerts = stocks.filter((s) => s.currentLiters < LOW_THRESHOLD && s.currentLiters >= 0);
  const lowProductAlerts = products.filter((p) => p.isActive && p.currentStock <= p.minStock);

  return (
    <main className="min-h-screen bg-[#eef4fb] text-slate-900">
      <div className="mx-auto min-h-screen w-full max-w-[480px] bg-[#f8fbff] shadow-[0_0_45px_rgba(15,23,42,0.08)] md:my-5 md:min-h-[calc(100vh-40px)] md:rounded-[34px] md:overflow-hidden">
        {/* APP HEADER */}
        <header className="bg-white px-5 pt-5 pb-4">
          <div className="flex items-center justify-between">
            <button onClick={() => router.push("/dashboard")} className="flex items-center gap-2">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-xl text-white shadow-lg shadow-blue-600/20">
                💧
              </div>
              <div className="text-left">
                <div className="text-[20px] font-black leading-none">
                  Fuel<span className="text-blue-600">POS</span>
                </div>
                <div className="mt-1 text-[11px] text-slate-400">ระบบจัดการสถานีน้ำมัน</div>
              </div>
            </button>

            <div className="flex items-center gap-2">
              <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 text-lg">
                🔔
                {(lowAlerts.length > 0 || lowProductAlerts.length > 0) && (
                  <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
                )}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold">
                📅 {new Date().toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
              </div>
            </div>
          </div>
        </header>

        {/* TITLE */}
        <section className="px-5 pt-4">
          <p className="text-sm text-slate-500">จัดการคลังสินค้า</p>
          <h1 className="mt-1 text-[32px] font-black tracking-tight">สต็อก</h1>
          <p className="mt-1 text-sm text-slate-400">น้ำมัน สินค้า รับเข้า วัดถัง และยอดค้างจ่าย</p>
        </section>

        {/* HERO */}
        <section className="px-5 pt-5">
          <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-blue-600 to-blue-700 p-5 text-white shadow-xl shadow-blue-600/20">
            <div className="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/10" />
            <div className="absolute -bottom-12 right-8 h-40 w-40 rounded-full bg-white/5" />

            <div className="relative">
              <p className="text-sm font-medium text-blue-100">น้ำมันคงเหลือรวม</p>
              <p className="mt-1 text-[38px] font-black tabular-nums">
                {fmt(totalLiters)}
                <span className="ml-2 text-lg font-semibold text-blue-100">L</span>
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2">
                {stocks.slice(0, 4).map((s) => (
                  <div key={s.id} className="rounded-2xl bg-white/10 px-3 py-2 backdrop-blur">
                    <p className="text-[11px] text-blue-100">{s.fuelType.label}</p>
                    <p className="mt-0.5 font-black tabular-nums">{fmt(s.currentLiters)} L</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* QUICK ACTIONS */}
        <section className="grid grid-cols-3 gap-3 px-5 pt-4">
          <button
            onClick={() => router.push("/purchases/new")}
            className="rounded-[22px] bg-blue-600 px-3 py-4 text-white shadow-lg shadow-blue-600/15"
          >
            <div className="text-2xl">＋</div>
            <div className="mt-1 text-sm font-bold">รับน้ำมัน</div>
          </button>

          <button
            onClick={() => router.push("/stock/check")}
            className="rounded-[22px] border border-slate-200 bg-white px-3 py-4 text-slate-700 shadow-sm"
          >
            <div className="text-2xl">◫</div>
            <div className="mt-1 text-sm font-bold">วัดถัง</div>
          </button>

          <button
            onClick={() => router.push("/settings/products")}
            className="rounded-[22px] border border-slate-200 bg-white px-3 py-4 text-slate-700 shadow-sm"
          >
            <div className="text-2xl">◇</div>
            <div className="mt-1 text-sm font-bold">สินค้า</div>
          </button>
        </section>

        {loading ? (
          <div className="px-5 py-16 text-center text-slate-400">กำลังโหลด...</div>
        ) : (
          <>
            {/* ALERTS */}
            {(lowAlerts.length > 0 || lowProductAlerts.length > 0) && (
              <section className="px-5 pt-5">
                <div className="rounded-[22px] border border-red-100 bg-red-50 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span>⚠️</span>
                    <h2 className="text-sm font-black text-red-700">แจ้งเตือนสต็อกต่ำ</h2>
                  </div>
                  <div className="space-y-1">
                    {lowAlerts.map((s) => (
                      <p key={s.id} className="text-xs font-semibold text-red-600">
                        {s.fuelType.label} เหลือ {fmt(s.currentLiters)} L
                      </p>
                    ))}
                    {lowProductAlerts.slice(0, 4).map((p) => (
                      <p key={p.id} className="text-xs font-semibold text-red-600">
                        {p.name} เหลือ {p.currentStock} {p.unit}
                      </p>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* FUEL STOCK CARDS */}
            <section className="px-5 pt-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-black">น้ำมันคงเหลือ</h2>
                <span className="text-xs text-slate-400">{stocks.length} ชนิด</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {stocks.map((s) => {
                  const cmp = compares.find((c) => c.fuelTypeId === s.fuelTypeId);
                  const meterL = cmp ? Math.max(0, cmp.stockByMeter) : null;
                  const capacity = Math.max(s.currentLiters, meterL ?? 0, 3000);
                  const pct = Math.max(0, Math.min(100, (s.currentLiters / capacity) * 100));
                  const isLow = s.currentLiters < LOW_THRESHOLD;

                  return (
                    <div key={s.id} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-2xl ${FUEL_COLOR_LIGHT[s.fuelType.name] ?? "bg-slate-100"}`}>
                            ⛽
                          </div>
                          <p className="text-sm font-black">{s.fuelType.label}</p>
                        </div>
                        {isLow && (
                          <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-bold text-red-600">ต่ำ</span>
                        )}
                      </div>

                      <p className="mt-2 text-2xl font-black tabular-nums">
                        {fmt(s.currentLiters)} <span className="text-sm font-semibold text-slate-400">L</span>
                      </p>

                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${isLow ? "bg-red-400" : (FUEL_COLOR[s.fuelType.name] ?? "bg-blue-500")}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      {meterL !== null && (
                        <p className="mt-2 text-[10px] text-slate-400">
                          มิเตอร์ประมาณ {fmt(meterL)} L
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* DEBT */}
            <section className="px-5 pt-6">
              <div className="rounded-[26px] border border-red-100 bg-white shadow-sm overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-red-500">ค้างจ่ายทั้งหมด</p>
                      <p className="mt-1 text-3xl font-black text-slate-900 tabular-nums">
                        ฿{fmt(totalUnpaid)}
                      </p>
                    </div>
                    <button
                      onClick={() => setShowDebtForm((v) => !v)}
                      className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600"
                    >
                      + บันทึก
                    </button>
                  </div>

                  {showDebtForm && (
                    <form onSubmit={saveDebt} className="mt-4 space-y-3 rounded-2xl bg-slate-50 p-3">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={debtForm.supplier}
                          required
                          onChange={(e) => setDebtForm((f) => ({ ...f, supplier: e.target.value }))}
                          placeholder="ผู้ส่ง / บริษัท"
                          className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-400"
                        />
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          value={debtForm.amount}
                          required
                          onChange={(e) => setDebtForm((f) => ({ ...f, amount: e.target.value }))}
                          placeholder="ยอดเงิน"
                          className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-400"
                        />
                      </div>
                      <input
                        type="text"
                        value={debtForm.note}
                        onChange={(e) => setDebtForm((f) => ({ ...f, note: e.target.value }))}
                        placeholder="หมายเหตุ"
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-400"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="date"
                          value={debtForm.date}
                          onChange={(e) => setDebtForm((f) => ({ ...f, date: e.target.value }))}
                          className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                        />
                        <button
                          type="submit"
                          disabled={savingDebt}
                          className="h-11 rounded-xl bg-red-600 text-sm font-bold text-white disabled:opacity-50"
                        >
                          {savingDebt ? "..." : "บันทึกค้างจ่าย"}
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                {(unpaidDebts.length > 0 || unpaidPurchases.length > 0) && (
                  <div className="border-t border-slate-100 divide-y divide-slate-100">
                    {unpaidDebts.slice(0, 4).map((d) => (
                      <div key={d.id} className="p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold">{d.supplier}</p>
                            <p className="mt-0.5 text-xs text-slate-400">{shortDate(d.date)}{d.note ? ` · ${d.note}` : ""}</p>
                          </div>
                          <p className="shrink-0 font-black text-red-600">฿{fmt(d.amount)}</p>
                        </div>
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={() => { setPartialId(partialId === d.id ? null : d.id); setPartialAmount(""); }}
                            className="rounded-xl bg-orange-50 px-3 py-2 text-xs font-bold text-orange-600"
                          >
                            จ่ายบางส่วน
                          </button>
                          <button
                            onClick={() => markDebtPaid(d.id)}
                            disabled={markingDebtId === d.id}
                            className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-600"
                          >
                            จ่ายครบ
                          </button>
                          <button
                            onClick={() => deleteDebt(d.id)}
                            disabled={deletingDebtId === d.id}
                            className="ml-auto px-2 text-xs font-semibold text-red-300"
                          >
                            ลบ
                          </button>
                        </div>
                        {partialId === d.id && (
                          <div className="mt-3 flex gap-2">
                            <input
                              type="number"
                              inputMode="decimal"
                              value={partialAmount}
                              onChange={(e) => setPartialAmount(e.target.value)}
                              placeholder="จำนวนที่จ่าย"
                              className="min-w-0 flex-1 rounded-xl border border-orange-200 px-3 py-2 text-sm outline-none"
                            />
                            <button
                              onClick={() => payPartial(d.id)}
                              disabled={!partialAmount || markingDebtId === d.id}
                              className="rounded-xl bg-orange-500 px-4 text-sm font-bold text-white disabled:opacity-40"
                            >
                              หัก
                            </button>
                          </div>
                        )}
                      </div>
                    ))}

                    {unpaidPurchases.slice(0, 4).map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-3 p-4">
                        <div>
                          <p className="text-sm font-bold">{p.fuelType.label}</p>
                          <p className="text-xs text-slate-400">{shortDate(p.date)}{p.supplier ? ` · ${p.supplier}` : ""}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="font-black text-red-600">฿{fmt(p.totalCost)}</p>
                          <button
                            onClick={() => markPaid(p.id)}
                            disabled={markingPaidId === p.id}
                            className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-600"
                          >
                            จ่ายแล้ว
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* COMPARE */}
            {compares.length > 0 && (
              <section className="px-5 pt-6">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-black">เทียบสต็อก</h2>
                  <span className="text-xs text-slate-400">ระบบ vs มิเตอร์</span>
                </div>

                <div className="space-y-3">
                  {compares.map((c) => {
                    const diff = c.diffMeterVsCash;
                    const bigDiff = Math.abs(diff) > 5;

                    return (
                      <div key={c.fuelTypeId} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-black">{c.label}</p>
                            {c.lastCheckDate && (
                              <p className="mt-1 text-[11px] text-slate-400">
                                วัดถังล่าสุด {shortDate(c.lastCheckDate)}
                              </p>
                            )}
                          </div>
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${bigDiff ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}`}>
                            {bigDiff ? "มียอดต่าง" : "ปกติ"}
                          </span>
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-2">
                          <div className="rounded-2xl bg-blue-50 p-3 text-center">
                            <p className="text-[10px] text-blue-400">ขายตามเงิน</p>
                            <p className="mt-1 text-base font-black text-blue-700">{fmtDec(c.soldByCash)}</p>
                          </div>
                          <div className="rounded-2xl bg-violet-50 p-3 text-center">
                            <p className="text-[10px] text-violet-400">ตามมิเตอร์</p>
                            <p className="mt-1 text-base font-black text-violet-700">{fmtDec(c.soldByMeter)}</p>
                          </div>
                          <div className={`rounded-2xl p-3 text-center ${bigDiff ? "bg-red-50" : "bg-emerald-50"}`}>
                            <p className={`text-[10px] ${bigDiff ? "text-red-400" : "text-emerald-400"}`}>ต่าง</p>
                            <p className={`mt-1 text-base font-black ${bigDiff ? "text-red-700" : "text-emerald-700"}`}>
                              {diff > 0 ? "+" : ""}{fmtDec(diff)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* PRODUCTS */}
            {products.filter((p) => p.isActive).length > 0 && (
              <section className="px-5 pt-6">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-black">สินค้าในร้าน</h2>
                  <button onClick={() => router.push("/settings/products")} className="text-xs font-semibold text-blue-600">
                    จัดการ →
                  </button>
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-white shadow-sm divide-y divide-slate-100">
                  {products.filter((p) => p.isActive).slice(0, 8).map((p) => {
                    const isLow = p.currentStock <= p.minStock;
                    return (
                      <div key={p.id} className="flex items-center gap-3 p-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100">▣</div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold">{p.name}</p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {p.currentPrice > 0 ? `ขาย ฿${fmt(p.currentPrice)}` : "ยังไม่ตั้งราคา"}
                          </p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-bold ${isLow ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-600"}`}>
                          {p.currentStock} {p.unit}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* HISTORY */}
            <section className="px-5 pt-6 pb-28">
              <div className="rounded-[24px] border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="grid grid-cols-2 border-b border-slate-100">
                  <button
                    onClick={() => setTab("purchases")}
                    className={`py-3 text-sm font-bold ${tab === "purchases" ? "text-blue-600 border-b-2 border-blue-600" : "text-slate-400"}`}
                  >
                    ประวัติรับน้ำมัน
                  </button>
                  <button
                    onClick={() => setTab("checks")}
                    className={`py-3 text-sm font-bold ${tab === "checks" ? "text-blue-600 border-b-2 border-blue-600" : "text-slate-400"}`}
                  >
                    ประวัติวัดถัง
                  </button>
                </div>

                {tab === "purchases" ? (
                  <div className="divide-y divide-slate-100">
                    {purchases.length === 0 ? (
                      <p className="py-8 text-center text-sm text-slate-300">ยังไม่มีรายการ</p>
                    ) : (
                      purchases.slice(0, 8).map((p) => (
                        <div key={p.id} className="p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold">{p.fuelType.label}</p>
                              <p className="text-xs text-slate-400">{shortDate(p.date)}{p.supplier ? ` · ${p.supplier}` : ""}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-black text-blue-600">+{fmt(p.liters)} L</p>
                              <p className="text-xs text-slate-400">ทุน {fmtDec(p.costPerLiter)} ฿/L</p>
                            </div>
                          </div>
                          {editingPurchaseId === p.id ? <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3"><label className="block text-xs font-bold" htmlFor={`cost-${p.id}`}>ราคาทุนใหม่ (บาท/ลิตร)</label><input id={`cost-${p.id}`} type="number" min="0.01" step="0.01" value={editCost} onChange={e => setEditCost(e.target.value)} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3" /><label className="block text-xs font-bold" htmlFor={`reason-${p.id}`}>เหตุผลที่แก้</label><input id={`reason-${p.id}`} value={editReason} onChange={e => setEditReason(e.target.value)} maxLength={300} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3" /><div className="flex gap-2"><button onClick={() => savePurchaseCost(p.id)} className="min-h-11 flex-1 rounded-xl bg-blue-600 font-bold text-white">บันทึกต้นทุน</button><button onClick={() => setEditingPurchaseId(null)} className="min-h-11 rounded-xl border px-4">ยกเลิก</button></div></div> : <button onClick={() => { setEditingPurchaseId(p.id); setEditCost(String(p.costPerLiter)); setEditReason(""); }} className="mt-2 min-h-10 rounded-lg bg-slate-100 px-3 text-xs font-bold text-slate-700">แก้ราคาทุน</button>}
                          {p.audits?.[0] && <p className="mt-2 text-xs text-slate-500">แก้ล่าสุด {fmtDec(p.audits[0].oldCost)} → {fmtDec(p.audits[0].newCost)} โดย {p.audits[0].actorName} · {p.audits[0].reason}</p>}
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {checks.length === 0 ? (
                      <p className="py-8 text-center text-sm text-slate-300">ยังไม่มีรายการ</p>
                    ) : (
                      checks.slice(0, 8).map((c) => {
                        const isShort = c.difference < -20;
                        return (
                          <div key={c.id} className="flex items-center justify-between gap-3 p-4">
                            <div>
                              <p className="text-sm font-bold">{c.fuelType.label}</p>
                              <p className="text-xs text-slate-400">
                                {shortDate(c.date)} · ระบบ {fmt(c.systemLiters)} L · จริง {fmt(c.actualLiters)} L
                              </p>
                            </div>
                            <p className={`font-black ${isShort ? "text-red-600" : c.difference > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                              {c.difference > 0 ? "+" : ""}{fmtDec(c.difference)} L
                            </p>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {/* BOTTOM NAV */}
        <nav className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[480px] border-t border-slate-200 bg-white/95 px-3 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2 backdrop-blur md:bottom-5 md:rounded-b-[34px]">
          <div className="grid grid-cols-5">
            <BottomNav label="หน้าหลัก" icon="⌂" active={pathname === "/dashboard"} onClick={() => router.push("/dashboard")} />
            <BottomNav label="ขาย" icon="⛽" active={pathname.startsWith("/sales") || pathname === "/quick"} onClick={() => router.push("/quick")} />
            <BottomNav label="สต็อก" icon="◇" active={pathname.startsWith("/stock")} onClick={() => router.push("/stock")} />
            <BottomNav label="มิเตอร์" icon="▥" active={pathname.startsWith("/meter")} onClick={() => router.push("/meter")} />
            <BottomNav label="รายงาน" icon="▮" active={pathname === "/dashboard"} onClick={() => router.push("/dashboard")} />
          </div>
        </nav>
      </div>
    </main>
  );
}

function BottomNav({
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
      <span className={`text-[22px] leading-none ${active ? "scale-110" : ""}`}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
