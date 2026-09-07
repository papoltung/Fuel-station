"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type StockItem = { id: number; fuelTypeId: number; currentLiters: number; fuelType: { name: string; label: string } };
type Purchase = { id: number; date: string; fuelTypeId: number; liters: number; costPerLiter: number; totalCost: number; invoiceNo: string | null; supplier: string | null; isPaid: boolean; paidNote: string | null; fuelType: { label: string; currentPrice: number } };
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

  const totalLiters = stocks.reduce((a, s) => a + s.currentLiters, 0);
  const unpaidPurchases = purchases.filter((p) => !p.isPaid);
  const totalUnpaidPurchases = unpaidPurchases.reduce((a, p) => a + p.totalCost, 0);
  const unpaidDebts = debts.filter((d) => !d.isPaid);
  const totalUnpaidDebts = unpaidDebts.reduce((a, d) => a + d.amount, 0);
  const totalUnpaid = totalUnpaidPurchases + totalUnpaidDebts;
  const lowAlerts = stocks.filter((s) => s.currentLiters < LOW_THRESHOLD && s.currentLiters >= 0);
  const lowProductAlerts = products.filter((p) => p.isActive && p.currentStock <= p.minStock);

  return (
    <>
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard")} className="text-gray-500 text-xl w-8">←</button>
          <h1 className="text-base font-bold text-gray-900">สต๊อกน้ำมัน</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.push("/stock/check")}
            className="border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50"
          >
            วัดถัง
          </button>
          <button
            onClick={() => router.push("/purchases/new")}
            className="bg-amber-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-amber-600"
          >
            + รับน้ำมันเข้า
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {loading ? (
          <div className="text-center py-20 text-gray-300 text-4xl animate-pulse">...</div>
        ) : (
          <>
            {/* Alerts */}
            {(lowAlerts.length > 0 || lowProductAlerts.length > 0) && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-1">
                {lowAlerts.map((s) => (
                  <p key={s.id} className="text-red-700 text-sm font-semibold">
                    ⚠ {s.fuelType.label} เหลือน้อย — {fmt(s.currentLiters)} ลิตร
                  </p>
                ))}
                {lowProductAlerts.map((p) => (
                  <p key={p.id} className="text-red-700 text-sm font-semibold">
                    ⚠ {p.name} เหลือน้อย — {p.currentStock} {p.unit}
                  </p>
                ))}
              </div>
            )}

            {/* Hero */}
            <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-3xl p-6 text-white shadow-lg">
              <p className="text-amber-100 text-sm font-medium">น้ำมันคงเหลือรวม</p>
              <p className="text-4xl font-bold mt-1">
                {fmt(totalLiters)}
                <span className="text-xl font-normal text-amber-200 ml-1">ลิตร</span>
              </p>
              <div className="flex gap-4 mt-4 pt-4 border-t border-amber-400/50 flex-wrap">
                {stocks.map((s) => (
                  <div key={s.id}>
                    <p className="text-amber-200 text-xs">{s.fuelType.label}</p>
                    <p className="font-bold">{fmt(s.currentLiters)} L</p>
                  </div>
                ))}
                {stocks.length === 0 && (
                  <p className="text-amber-200 text-sm">ยังไม่มีข้อมูลสต๊อก — รับน้ำมันเข้าก่อน</p>
                )}
              </div>
            </div>

            {/* ค้างจ่าย */}
            <div className="bg-red-50 border border-red-200 rounded-2xl overflow-hidden">
              <div className="p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-xs font-bold text-red-600 uppercase tracking-wide">ค้างจ่ายทั้งหมด</p>
                    <p className="text-2xl font-bold text-red-700 mt-0.5">
                      {fmt(totalUnpaid)}<span className="text-sm font-normal text-red-400 ml-1">บาท</span>
                    </p>
                  </div>
                  <button onClick={() => setShowDebtForm((v) => !v)}
                    className="bg-red-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-red-700">
                    + บันทึกค้างจ่าย
                  </button>
                </div>

                {/* form เพิ่มค้างจ่าย */}
                {showDebtForm && (
                  <form onSubmit={saveDebt} className="mt-3 bg-white rounded-xl p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-xs text-gray-400 mb-1">ผู้ส่ง</p>
                        <input type="text" value={debtForm.supplier} required
                          onChange={(e) => setDebtForm((f) => ({ ...f, supplier: e.target.value }))}
                          placeholder="บริษัทน้ำมัน"
                          className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-1">ยอดรวม (บาท)</p>
                        <input type="number" inputMode="decimal" step="0.01" value={debtForm.amount} required
                          onChange={(e) => setDebtForm((f) => ({ ...f, amount: e.target.value }))}
                          placeholder="0.00"
                          className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-red-400" />
                      </div>
                    </div>
                    <input type="text" value={debtForm.note}
                      onChange={(e) => setDebtForm((f) => ({ ...f, note: e.target.value }))}
                      placeholder="หมายเหตุ เช่น ดีเซล 3000L + เบนซิน 2000L"
                      className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                    <div className="grid grid-cols-2 gap-2">
                      <input type="date" value={debtForm.date}
                        onChange={(e) => setDebtForm((f) => ({ ...f, date: e.target.value }))}
                        className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setShowDebtForm(false)}
                          className="flex-1 border-2 border-gray-200 text-gray-500 rounded-xl text-sm font-semibold">
                          ยกเลิก
                        </button>
                        <button type="submit" disabled={savingDebt}
                          className="flex-1 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 disabled:opacity-50">
                          {savingDebt ? "..." : "บันทึก"}
                        </button>
                      </div>
                    </div>
                  </form>
                )}
              </div>

              {/* รายการค้าง: SupplierDebt */}
              {unpaidDebts.length > 0 && (
                <div className="border-t border-red-100 divide-y divide-red-50">
                  {unpaidDebts.map((d) => (
                    <div key={d.id} className="bg-white">
                      <div className="px-4 py-3 flex justify-between items-center">
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{d.supplier}</p>
                          <p className="text-xs text-gray-400">
                            {shortDate(d.date)}{d.note ? ` · ${d.note}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-red-600">{fmt(d.amount)} ฿</p>
                          <button
                            onClick={() => { setPartialId(partialId === d.id ? null : d.id); setPartialAmount(""); }}
                            className="text-xs bg-orange-100 text-orange-600 px-2.5 py-1 rounded-lg hover:bg-orange-200">
                            บางส่วน
                          </button>
                          <button onClick={() => markDebtPaid(d.id)} disabled={markingDebtId === d.id}
                            className="text-xs bg-green-500 text-white px-2.5 py-1 rounded-lg hover:bg-green-600 disabled:opacity-40">
                            {markingDebtId === d.id ? "..." : "เต็ม"}
                          </button>
                          <button onClick={() => deleteDebt(d.id)} disabled={deletingDebtId === d.id}
                            className="text-xs text-red-400 hover:text-red-600 px-1.5 py-1 rounded-lg hover:bg-red-50 disabled:opacity-40">
                            {deletingDebtId === d.id ? "..." : "ลบ"}
                          </button>
                        </div>
                      </div>
                      {/* ประวัติการจ่าย */}
                      {d.payments.length > 0 && (
                        <div className="px-4 pb-2 space-y-1">
                          {d.payments.map((pay) => (
                            <div key={pay.id} className="flex justify-between items-center text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-1.5">
                              <span>{shortDate(pay.paidAt)}{pay.note ? ` · ${pay.note}` : ""}</span>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-green-600">−{fmt(pay.amount)} ฿</span>
                                <button
                                  onClick={() => deletePayment(d.id, pay.id)}
                                  disabled={deletingPaymentId === pay.id}
                                  className="text-red-300 hover:text-red-500 disabled:opacity-40 px-1"
                                >
                                  {deletingPaymentId === pay.id ? "..." : "✕"}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {partialId === d.id && (
                        <div className="px-4 pb-3 flex gap-2 items-center">
                          <input type="number" inputMode="decimal" value={partialAmount}
                            onChange={(e) => setPartialAmount(e.target.value)}
                            placeholder={`จ่ายเท่าไหร่? (ค้าง ${fmt(d.amount)} ฿)`}
                            className="flex-1 border-2 border-orange-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-orange-400" />
                          <button onClick={() => payPartial(d.id)} disabled={!partialAmount || markingDebtId === d.id}
                            className="bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-orange-600 disabled:opacity-40">
                            {markingDebtId === d.id ? "..." : "หัก"}
                          </button>
                          <button onClick={() => { setPartialId(null); setPartialAmount(""); }}
                            className="text-gray-400 text-sm px-2">ยกเลิก</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* รายการค้าง: FuelPurchase isPaid=false */}
              {unpaidPurchases.length > 0 && (
                <div className="border-t border-red-100 divide-y divide-red-50">
                  {unpaidPurchases.map((p) => (
                    <div key={p.id} className="px-4 py-3 flex justify-between items-center bg-white">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{p.fuelType.label}{p.supplier ? ` · ${p.supplier}` : ""}</p>
                        <p className="text-xs text-gray-400">
                          {shortDate(p.date)}{p.paidNote ? ` · ${p.paidNote}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-red-600">{fmt(p.totalCost)} ฿</p>
                        <button onClick={() => markPaid(p.id)} disabled={markingPaidId === p.id}
                          className="text-xs bg-green-500 text-white px-2.5 py-1 rounded-lg hover:bg-green-600 disabled:opacity-40">
                          {markingPaidId === p.id ? "..." : "จ่ายแล้ว"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {totalUnpaid === 0 && (
                <p className="text-center text-red-300 text-xs py-3">ไม่มียอดค้างจ่าย</p>
              )}
            </div>

            {/* Stock per fuel */}
            <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
              <p className="text-sm font-bold text-gray-700">คงเหลือแยกชนิด</p>
              {stocks.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">ยังไม่มีข้อมูล</p>
              ) : (
                stocks.map((s) => {
                  const cmp = compares.find((c) => c.fuelTypeId === s.fuelTypeId);
                  const meterL = cmp ? Math.max(0, cmp.stockByMeter) : null;
                  const maxL = Math.max(...stocks.map((x) => x.currentLiters), meterL ?? 0, 1);
                  const pctSystem = Math.max(0, (s.currentLiters / maxL) * 100);
                  const pctMeter = meterL !== null ? Math.max(0, (meterL / maxL) * 100) : null;
                  const isLow = s.currentLiters < LOW_THRESHOLD;
                  return (
                    <div key={s.id}>
                      <div className="flex justify-between items-baseline mb-1">
                        <span className="text-sm font-semibold text-gray-700">{s.fuelType.label}</span>
                        <div className="flex items-baseline gap-3">
                          <span className="text-xs text-gray-400">
                            ระบบ <span className={`font-bold ${isLow ? "text-red-600" : "text-gray-700"}`}>{fmt(s.currentLiters)}</span> L {isLow && "⚠"}
                          </span>
                          {meterL !== null && (
                            <span className="text-xs text-purple-400">
                              มิเตอร์ <span className="font-bold text-purple-600">{fmt(meterL)}</span> L
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden">
                        {pctMeter !== null && (
                          <div
                            className={`absolute h-full rounded-full transition-all duration-500 ${FUEL_COLOR[s.fuelType.name] ?? "bg-gray-400"}`}
                            style={{ width: `${Math.max(pctSystem, pctMeter)}%` }}
                          />
                        )}
                        <div
                          className={`absolute h-full rounded-full transition-all duration-500 ${isLow ? "bg-red-300" : (FUEL_COLOR_LIGHT[s.fuelType.name] ?? "bg-gray-200")}`}
                          style={{ width: `${pctSystem}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* ทุนเฉลี่ยในถัง FIFO */}
            {compares.length > 0 && purchases.length > 0 && (() => {
              const rows = compares.map((c) => {
                const remaining = Math.max(0, c.stockByMeter);
                const fuelPurchases = purchases
                  .filter((p) => p.fuelTypeId === c.fuelTypeId)
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                const sellPrice = fuelPurchases[0]?.fuelType.currentPrice ?? 0;
                let need = remaining;
                let totalCost = 0;
                for (const p of fuelPurchases) {
                  if (need <= 0) break;
                  const take = Math.min(need, p.liters);
                  totalCost += take * p.costPerLiter;
                  need -= take;
                }
                const avgCost = remaining > 0 ? totalCost / remaining : 0;
                const profitPerLiter = sellPrice > 0 ? sellPrice - avgCost : null;
                return { label: c.label, remaining, avgCost, sellPrice, profitPerLiter, stockValue: avgCost * remaining };
              }).filter((r) => r.remaining > 0);
              if (!rows.length) return null;
              return (
                <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-50">
                    <p className="text-sm font-bold text-gray-700">ทุนเฉลี่ยในถัง</p>
                    <p className="text-xs text-gray-400 mt-0.5">FIFO · คงเหลือตามมิเตอร์</p>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {rows.map((r) => (
                      <div key={r.label} className="px-5 py-4">
                        <div className="flex justify-between items-baseline mb-3">
                          <p className="text-sm font-bold text-gray-800">{r.label}</p>
                          <p className="text-xs text-gray-400">{fmtDec(r.remaining)} L คงเหลือ</p>
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-center text-xs">
                          <div className="bg-gray-50 rounded-xl py-2.5">
                            <p className="text-gray-400 mb-1">ทุนเฉลี่ย</p>
                            <p className="font-bold text-gray-800">{fmtDec(r.avgCost)} ฿</p>
                          </div>
                          <div className="bg-gray-50 rounded-xl py-2.5">
                            <p className="text-gray-400 mb-1">ขาย/ลิตร</p>
                            <p className="font-bold text-gray-800">{r.sellPrice > 0 ? `${fmtDec(r.sellPrice)} ฿` : "—"}</p>
                          </div>
                          <div className="bg-gray-50 rounded-xl py-2.5">
                            <p className="text-gray-400 mb-1">กำไร/ลิตร</p>
                            <p className={`font-bold ${r.profitPerLiter === null ? "text-gray-300" : r.profitPerLiter >= 0 ? "text-green-600" : "text-red-500"}`}>
                              {r.profitPerLiter !== null ? `${r.profitPerLiter >= 0 ? "+" : ""}${fmtDec(r.profitPerLiter)} ฿` : "—"}
                            </p>
                          </div>
                          <div className="bg-gray-50 rounded-xl py-2.5">
                            <p className="text-gray-400 mb-1">มูลค่าสต็อก</p>
                            <p className="font-bold text-gray-800">{fmt(r.stockValue)} ฿</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* เทียบสต๊อก: ตำเงิน vs มิเตอร์ */}
            {compares.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-50">
                  <p className="text-sm font-bold text-gray-700">เทียบสต๊อก</p>
                  <p className="text-xs text-gray-400 mt-0.5">คำนวณจากวัดถังล่าสุด + ซื้อ − ขาย</p>
                </div>
                {compares.map((c) => {
                  const diff = c.diffMeterVsCash;
                  const bigDiff = Math.abs(diff) > 5;
                  return (
                    <div key={c.fuelTypeId} className="px-5 py-4 border-b border-gray-50 last:border-0">
                      <div className="flex justify-between items-baseline mb-2">
                        <p className="text-sm font-bold text-gray-800">{c.label}</p>
                        {c.lastCheckDate && (
                          <p className="text-xs text-gray-400">วัดถังล่าสุด {shortDate(c.lastCheckDate)} · {fmt(c.lastCheckActual)} L</p>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-blue-50 rounded-xl p-3 text-center">
                          <p className="text-xs text-blue-500 font-semibold">ขายตามเงิน</p>
                          <p className="text-xl font-bold text-blue-700 mt-0.5">{fmtDec(c.soldByCash)}</p>
                          <p className="text-xs text-blue-400">ลิตร</p>
                        </div>
                        <div className="bg-purple-50 rounded-xl p-3 text-center">
                          <p className="text-xs text-purple-500 font-semibold">ขายตามมิเตอร์</p>
                          <p className="text-xl font-bold text-purple-700 mt-0.5">{fmtDec(c.soldByMeter)}</p>
                          {c.estimateDaysCount > 0 && (
                            <p className="text-xs text-purple-300">{c.estimateDaysCount} วัน estimate</p>
                          )}
                        </div>
                      </div>

                      <div className={`mt-2 rounded-xl px-3 py-2.5 flex justify-between items-center ${bigDiff ? "bg-red-50" : "bg-green-50"}`}>
                        <p className={`text-xs font-bold ${bigDiff ? "text-red-600" : "text-green-600"}`}>
                          {bigDiff ? "⚠ ต่างกัน" : "✓ ต่างกัน"}
                          {c.meterDaysCount > 0 && (
                            <span className="font-normal ml-1 opacity-60">({c.meterDaysCount} วันมิเตอร์จริง)</span>
                          )}
                        </p>
                        <p className={`text-sm font-bold ${bigDiff ? "text-red-600" : "text-green-600"}`}>
                          {diff > 0 ? "+" : ""}{fmtDec(diff)} ลิตร
                        </p>
                      </div>

                      <div className="mt-2 bg-gray-50 rounded-xl px-3 py-2 flex justify-between items-center">
                        <p className="text-xs text-gray-500">คงเหลือจากระบบ</p>
                        <p className="text-sm font-bold text-gray-700">{fmt(c.systemStock)} L</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Product stock card */}
            {products.filter((p) => p.isActive).length > 0 && (() => {
              const active = products.filter((p) => p.isActive);
              const byCategory: Record<string, typeof active> = {};
              for (const p of active) {
                const cat = p.category || "อื่นๆ";
                if (!byCategory[cat]) byCategory[cat] = [];
                byCategory[cat].push(p);
              }
              return (
                <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  <div className="flex justify-between items-center px-5 py-4 border-b border-gray-50">
                    <p className="text-sm font-bold text-gray-700">สินค้าในร้าน ({active.length})</p>
                    <button onClick={() => router.push("/settings/products")} className="text-xs text-purple-600 font-medium">จัดการ →</button>
                  </div>
                  {Object.entries(byCategory).map(([cat, items]) => (
                    <div key={cat}>
                      <p className="px-5 pt-3 pb-1 text-xs font-bold text-gray-400 uppercase tracking-wide">{cat}</p>
                      <div className="divide-y divide-gray-50">
                        {items.map((p) => {
                          const isLow = p.currentStock <= p.minStock;
                          const profit = p.currentPrice > 0 && p.costPrice > 0 ? p.currentPrice - p.costPrice : null;
                          return (
                            <div key={p.id} className="px-5 py-2.5 flex items-center gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-800">
                                  {p.name}
                                  {p.size && <span className="text-xs text-gray-400 font-normal ml-1">{p.size}</span>}
                                </p>
                                <div className="flex gap-3 text-xs text-gray-400 mt-0.5">
                                  {p.currentPrice > 0 && <span>ขาย {p.currentPrice} ฿</span>}
                                  {p.costPrice > 0 && <span>ทุน {p.costPrice} ฿</span>}
                                  {profit !== null && (
                                    <span className={`font-semibold ${profit >= 0 ? "text-green-600" : "text-red-500"}`}>
                                      กำไร {profit >= 0 ? "+" : ""}{profit} ฿/ชิ้น
                                    </span>
                                  )}
                                </div>
                              </div>
                              <span className={`text-sm font-bold px-3 py-1 rounded-full flex-shrink-0 ${isLow ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-700"}`}>
                                {p.currentStock} {p.unit} {isLow ? "⚠" : ""}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Tabs: ประวัติ */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="flex border-b border-gray-100">
                {(["purchases", "checks"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                      tab === t ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-400"
                    }`}
                  >
                    {t === "purchases" ? "ประวัติรับน้ำมัน" : "ประวัติวัดถัง"}
                  </button>
                ))}
              </div>

              {tab === "purchases" && (() => {
                // FIFO backward: ทุนเฉลี่ยเฉพาะน้ำมันที่เหลือในถัง (stockByMeter)
                const fifoByFuel: Record<string, { label: string; sellPrice: number; remainingLiters: number; avgCost: number }> = {};
                for (const c of compares) {
                  const remaining = Math.max(0, c.stockByMeter);
                  const fuelPurchases = purchases
                    .filter((p) => p.fuelTypeId === c.fuelTypeId)
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                  const sellPrice = fuelPurchases[0]?.fuelType.currentPrice ?? 0;
                  let need = remaining;
                  let totalCost = 0;
                  for (const p of fuelPurchases) {
                    if (need <= 0) break;
                    const take = Math.min(need, p.liters);
                    totalCost += take * p.costPerLiter;
                    need -= take;
                  }
                  const avgCost = remaining > 0 ? totalCost / remaining : 0;
                  fifoByFuel[c.label] = { label: c.label, sellPrice, remainingLiters: remaining, avgCost };
                }
                return (
                  <div>
                    {Object.values(fifoByFuel).length > 0 && (
                      <div className="bg-blue-50 border-b border-blue-100 px-5 py-4 space-y-3">
                        <p className="text-xs font-bold text-blue-700 uppercase tracking-wide">ทุนเฉลี่ยในถัง (FIFO · ตามมิเตอร์)</p>
                        {Object.values(fifoByFuel).map((f) => {
                          const profitPerLiter = f.sellPrice > 0 ? f.sellPrice - f.avgCost : null;
                          const totalStockValue = f.avgCost * f.remainingLiters;
                          return (
                            <div key={f.label} className="bg-white rounded-xl px-4 py-3">
                              <div className="flex justify-between items-baseline mb-2">
                                <p className="text-sm font-semibold text-gray-800">{f.label}</p>
                                <p className="text-xs text-gray-400">{fmtDec(f.remainingLiters)} L คงเหลือ</p>
                              </div>
                              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                                <div>
                                  <p className="text-gray-400">ทุนเฉลี่ย</p>
                                  <p className="font-bold text-gray-700">{fmtDec(f.avgCost)} ฿</p>
                                </div>
                                <div>
                                  <p className="text-gray-400">ขาย/ลิตร</p>
                                  <p className="font-bold text-gray-700">{f.sellPrice > 0 ? `${fmtDec(f.sellPrice)} ฿` : "—"}</p>
                                </div>
                                <div>
                                  <p className="text-gray-400">กำไร/ลิตร</p>
                                  <p className={`font-bold ${profitPerLiter === null ? "text-gray-300" : profitPerLiter >= 0 ? "text-green-600" : "text-red-500"}`}>
                                    {profitPerLiter !== null ? `${profitPerLiter >= 0 ? "+" : ""}${fmtDec(profitPerLiter)} ฿` : "—"}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-gray-400">มูลค่าสต็อก</p>
                                  <p className="font-bold text-gray-700">{fmt(totalStockValue)} ฿</p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="divide-y divide-gray-50">
                  {purchases.length === 0 ? (
                    <p className="text-center text-gray-300 py-8 text-sm">ยังไม่มีรายการ</p>
                  ) : (
                    purchases.map((p) => {
                      const sellPrice = p.fuelType.currentPrice;
                      const profitPerLiter = sellPrice > 0 ? sellPrice - p.costPerLiter : null;
                      const totalProfit = profitPerLiter !== null ? profitPerLiter * p.liters : null;
                      return (
                        <div key={p.id} className="px-5 py-4">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <p className="text-sm font-semibold text-gray-800">{p.fuelType.label}</p>
                              <p className="text-xs text-gray-400">
                                {shortDate(p.date)}{p.supplier ? ` · ${p.supplier}` : ""}{p.invoiceNo ? ` · ${p.invoiceNo}` : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {!p.isPaid && (
                                <button onClick={() => markPaid(p.id)} disabled={markingPaidId === p.id}
                                  className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-lg hover:bg-green-500 hover:text-white disabled:opacity-40 transition-colors">
                                  {markingPaidId === p.id ? "..." : "ค้างจ่าย"}
                                </button>
                              )}
                              <p className="text-sm font-bold text-amber-600">+{fmt(p.liters)} L</p>
                              <button
                                onClick={() => deletePurchase(p.id, p.liters, p.fuelType.label)}
                                disabled={deletingId === p.id}
                                className="text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded-lg hover:bg-red-50 disabled:opacity-40"
                              >
                                {deletingId === p.id ? "..." : "ลบ"}
                              </button>
                            </div>
                          </div>
                          <div className="bg-gray-50 rounded-xl px-3 py-2 grid grid-cols-3 gap-2 text-center text-xs">
                            <div>
                              <p className="text-gray-400">ทุน/ลิตร</p>
                              <p className="font-bold text-gray-700">{fmtDec(p.costPerLiter)} ฿</p>
                            </div>
                            <div>
                              <p className="text-gray-400">ขาย/ลิตร</p>
                              <p className="font-bold text-gray-700">
                                {sellPrice > 0 ? `${fmtDec(sellPrice)} ฿` : <span className="text-gray-300">—</span>}
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-400">กำไร/ลิตร</p>
                              <p className={`font-bold ${profitPerLiter === null ? "text-gray-300" : profitPerLiter >= 0 ? "text-green-600" : "text-red-500"}`}>
                                {profitPerLiter !== null ? `${profitPerLiter >= 0 ? "+" : ""}${fmtDec(profitPerLiter)} ฿` : "—"}
                              </p>
                            </div>
                          </div>
                          <div className="flex justify-between mt-2 text-xs text-gray-500">
                            <span>ต้นทุนรวม {fmtDec(p.totalCost)} ฿</span>
                            {totalProfit !== null && (
                              <span className={`font-semibold ${totalProfit >= 0 ? "text-green-600" : "text-red-500"}`}>
                                กำไรรวม {totalProfit >= 0 ? "+" : ""}{fmt(totalProfit)} ฿
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                  </div>
                );
              })()}

              {tab === "checks" && (
                <div className="divide-y divide-gray-50">
                  {checks.length === 0 ? (
                    <p className="text-center text-gray-300 py-8 text-sm">ยังไม่มีรายการ</p>
                  ) : (
                    checks.map((c) => {
                      const isShort = c.difference < -20;
                      return (
                        <div key={c.id} className="px-5 py-3 flex justify-between items-center">
                          <div>
                            <p className="text-sm font-semibold text-gray-800">{c.fuelType.label}</p>
                            <p className="text-xs text-gray-400">
                              {shortDate(c.date)} · ระบบ {fmt(c.systemLiters)} L · จริง {fmt(c.actualLiters)} L
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-right">
                              <p className={`text-sm font-bold ${isShort ? "text-red-600" : c.difference > 0 ? "text-yellow-600" : "text-green-600"}`}>
                                {c.difference > 0 ? "+" : ""}{fmtDec(c.difference)} L
                              </p>
                              {isShort && <p className="text-xs text-red-500">ขาด</p>}
                            </div>
                            <button
                              onClick={() => deleteCheck(c.id, c.fuelType.label)}
                              disabled={deletingCheckId === c.id}
                              className="text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded-lg hover:bg-red-50 disabled:opacity-40"
                            >
                              {deletingCheckId === c.id ? "..." : "ลบ"}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
    </>
  );
}
