"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PinModal from "@/components/PinModal";

type StockItem = { fuelTypeId: number; currentLiters: number; fuelType: { name: string; label: string } };
type FuelType = { id: number; name: string; label: string; currentPrice: number };
type MeterPeriod = { id: number; meterStart: number; meterEnd: number | null; liters: number | null; fuelType: { name: string; label: string } };
type SaleOrder = { id: number; createdAt: string; fuelTypeId: number; fuelType: { name: string; label: string }; pumpNo: string; totalAmount: number; pricePerLiter: number; paymentMethod: string; sellerName: string; customerName: string | null };

type Summary = {
  date: string;
  totalRevenue: number;
  fuelRevenue: number;
  productRevenue: number;
  totalLiters: number;
  totalCost: number;
  totalProfit: number;
  byFuel: Record<string, { label: string; liters: number; revenue: number; cost: number; profit: number; avgCostPerLiter: number }>;
  byPayment: Record<string, number>;
  fuelByPayment: Record<string, number>;
  productByPayment: Record<string, number>;
  count: number;
  productCount: number;
};

type Sale = {
  id: number;
  date: string;
  sellerName: string;
  fuelType: { label: string; name: string };
  pumpNo: string;
  liters: number;
  pricePerLiter: number;
  totalAmount: number;
  paymentMethod: string;
  customerName: string | null;
};

type ProductSale = {
  id: number;
  date: string;
  sellerName: string;
  product: { name: string; unit: string };
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  paymentMethod: string;
  customerName: string | null;
};

const PAYMENT_LABEL: Record<string, string> = { cash: "เงินสด", transfer: "โอน", credit: "เครดิต" };
const PAYMENT_COLOR: Record<string, string> = { cash: "bg-emerald-500", transfer: "bg-blue-500", credit: "bg-orange-400" };
const FUEL_COLOR: Record<string, string> = { diesel: "bg-amber-400", benzin95: "bg-blue-400", benzin91: "bg-green-400", e20: "bg-purple-400" };

function fmt(n: number) { return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtInt(n: number) { return n.toLocaleString("th-TH", { maximumFractionDigits: 0 }); }
function fmtTime(dateStr: string) {
  const d = new Date(dateStr);
  if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) return null;
  return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

export default function DashboardPage() {
  const router = useRouter();
  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; })();
  const [date, setDate] = useState(today);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [productSales, setProductSales] = useState<ProductSale[]>([]);
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [meters, setMeters] = useState<MeterPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingSaleId, setDeletingSaleId] = useState<number | null>(null);
  const [deletingProductSaleId, setDeletingProductSaleId] = useState<number | null>(null);
  const [fuelTypes, setFuelTypes] = useState<FuelType[]>([]);
  const [quickFuelId, setQuickFuelId] = useState<string>("");
  const [quickPayment, setQuickPayment] = useState<"cash" | "transfer">("cash");
  const [quickAmount, setQuickAmount] = useState<number>(0);
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickDone, setQuickDone] = useState(false);
  const [orders, setOrders] = useState<SaleOrder[]>([]);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [profitUnlocked, setProfitUnlocked] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);

  const LOW_THRESHOLD = 1000;

  function loadOrders() {
    fetch("/api/sale-orders").then((r) => r.json()).then(setOrders).catch(() => {});
  }

  useEffect(() => {
    fetch("/api/fuel-types").then((r) => r.json()).then((data: FuelType[]) => {
      setFuelTypes(data);
      if (data.length > 0) setQuickFuelId(String(data[0].id));
    }).catch(() => {});
    loadOrders();
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/sales/summary?date=${date}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/sales?date=${date}`).then((r) => r.json()).catch(() => []),
      fetch(`/api/product-sales?date=${date}`).then((r) => r.json()).catch(() => []),
      fetch("/api/fuel-stock").then((r) => r.json()).catch(() => []),
      fetch(`/api/meter-periods?date=${date}`).then((r) => r.json()).catch(() => []),
    ]).then(([s, sl, psl, stk, mp]) => {
      setSummary(Array.isArray(s) ? null : s);
      setSales(Array.isArray(sl) ? sl : []);
      setProductSales(Array.isArray(psl) ? psl : []);
      setStocks(Array.isArray(stk) ? stk : []);
      setMeters(Array.isArray(mp) ? mp : []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [date]);

  async function deleteSale(id: number, amount: number) {
    if (!confirm(`ลบรายการ ${amount.toLocaleString("th-TH")} บาท?`)) return;
    setDeletingSaleId(id);
    const res = await fetch(`/api/sales/${id}`, { method: "DELETE" });
    if (!res.ok) { const d = await res.json(); alert(d.error ?? "ลบไม่สำเร็จ"); }
    else {
      setSales((s) => s.filter((x) => x.id !== id));
      fetch(`/api/sales/summary?date=${date}`).then((r) => r.json()).then((s) => setSummary(Array.isArray(s) ? null : s)).catch(() => {});
    }
    setDeletingSaleId(null);
  }

  async function deleteProductSale(id: number, amount: number) {
    if (!confirm(`ลบรายการ ${amount.toLocaleString("th-TH")} บาท?`)) return;
    setDeletingProductSaleId(id);
    const res = await fetch(`/api/product-sales/${id}`, { method: "DELETE" });
    if (!res.ok) { const d = await res.json(); alert(d.error ?? "ลบไม่สำเร็จ"); }
    else {
      setProductSales((s) => s.filter((x) => x.id !== id));
      fetch(`/api/sales/summary?date=${date}`).then((r) => r.json()).then((s) => setSummary(Array.isArray(s) ? null : s)).catch(() => {});
    }
    setDeletingProductSaleId(null);
  }

  function refreshDay() {
    Promise.all([
      fetch(`/api/sales/summary?date=${date}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/sales?date=${date}`).then((r) => r.json()).catch(() => []),
    ]).then(([s, sl]) => {
      setSummary(Array.isArray(s) ? null : s);
      setSales(Array.isArray(sl) ? sl : []);
    }).catch(() => {});
  }

  async function quickSave() {
    if (quickAmount <= 0) return;
    const ft = fuelTypes.find((f) => String(f.id) === quickFuelId);
    if (!ft || ft.currentPrice <= 0) return;
    const seller = localStorage.getItem("fuel_last_seller") ?? "N";
    const d = new Date();
    const off = -d.getTimezoneOffset();
    const tz = `${off >= 0 ? "+" : "-"}${String(Math.floor(Math.abs(off) / 60)).padStart(2, "0")}:${String(Math.abs(off) % 60).padStart(2, "0")}`;
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}T${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}${tz}`;
    const amount = quickAmount;
    const payment = quickPayment;

    // optimistic: add to list immediately
    const tempId = -Date.now();
    const liters = amount / ft.currentPrice;
    setSales((prev) => [{
      id: tempId, date: dateStr, sellerName: seller,
      fuelType: { label: ft.label, name: ft.name },
      pumpNo: "หัวจ่าย 1", liters, pricePerLiter: ft.currentPrice,
      totalAmount: amount, paymentMethod: payment, customerName: null,
    }, ...prev]);
    setSummary((prev) => {
      if (!prev) return prev;
      const byFuel = { ...prev.byFuel };
      byFuel[ft.name] = byFuel[ft.name]
        ? { ...byFuel[ft.name], liters: byFuel[ft.name].liters + liters, revenue: byFuel[ft.name].revenue + amount }
        : { label: ft.label, liters, revenue: amount, cost: 0, profit: amount, avgCostPerLiter: 0 };
      return {
        ...prev,
        totalRevenue: prev.totalRevenue + amount,
        fuelRevenue: prev.fuelRevenue + amount,
        totalLiters: prev.totalLiters + liters,
        byFuel,
        byPayment: { ...prev.byPayment, [payment]: (prev.byPayment[payment] ?? 0) + amount },
        fuelByPayment: { ...prev.fuelByPayment, [payment]: (prev.fuelByPayment[payment] ?? 0) + amount },
        count: prev.count + 1,
      };
    });
    setQuickDone(true);
    setQuickAmount(0);
    setTimeout(() => setQuickDone(false), 1200);

    setQuickSaving(true);
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: dateStr, sellerName: seller, fuelTypeId: quickFuelId,
          pumpNo: "หัวจ่าย 1", totalAmount: String(amount),
          pricePerLiter: String(ft.currentPrice), paymentMethod: payment, customerName: "",
        }),
      });
      if (!res.ok) {
        // rollback on failure
        setSales((prev) => prev.filter((s) => s.id !== tempId));
      }
      refreshDay(); // reconcile with server
    } catch {
      setSales((prev) => prev.filter((s) => s.id !== tempId));
      refreshDay();
    } finally {
      setQuickSaving(false);
    }
  }

  const paymentTotal = summary ? Object.values(summary.byPayment).reduce((a, b) => a + b, 0) : 0;
  const fuelEntries = summary ? Object.entries(summary.byFuel) : [];
  const maxFuelRevenue = fuelEntries.length > 0 ? Math.max(...fuelEntries.map(([, v]) => v.revenue)) : 1;

  return (
    <>
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-gray-900">ปั๊มน้ำมัน</h1>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="text-xs text-gray-400 bg-transparent focus:outline-none cursor-pointer" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => router.push("/quick")} className="bg-green-500 text-white px-3 py-2 rounded-xl text-sm font-bold hover:bg-green-600">⚡ ด่วน</button>
            <button onClick={() => router.push("/sales/new")} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-blue-700">+ บันทึกขาย</button>
          </div>
        </div>
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-none">
          <button onClick={() => router.push("/settings")} className="flex-shrink-0 text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg text-xs font-medium">ตั้งราคา</button>
          <button onClick={() => router.push("/stock")} className="flex-shrink-0 text-amber-600 border border-amber-200 px-3 py-1.5 rounded-lg text-xs font-medium">สต๊อก</button>
          <button onClick={() => router.push("/meter")} className="flex-shrink-0 text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg text-xs font-medium">มิเตอร์</button>
          <button onClick={() => router.push("/cash")} className="flex-shrink-0 text-emerald-600 border border-emerald-200 px-3 py-1.5 rounded-lg text-xs font-medium">นับเงิน</button>
          <button onClick={() => router.push("/settings/products")} className="flex-shrink-0 text-purple-600 border border-purple-200 px-3 py-1.5 rounded-lg text-xs font-medium">สินค้า</button>
          <a href="/api/export/sales" download className="flex-shrink-0 text-green-700 border border-green-200 px-3 py-1.5 rounded-lg text-xs font-medium">↓ CSV</a>
        </div>
      </div>

      {/* Quick sale */}
      {fuelTypes.length > 0 && (
        <div className="bg-white border-b border-gray-100 px-4 py-4">
          <div className="max-w-2xl mx-auto space-y-3">

            {/* Fuel type + payment */}
            <div className="flex gap-2 items-center">
              <div className="flex gap-1.5 flex-1 flex-wrap">
                {fuelTypes.map((ft) => (
                  <button key={ft.id} type="button" onClick={() => setQuickFuelId(String(ft.id))}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${quickFuelId === String(ft.id) ? "bg-blue-600 text-white shadow-sm" : "bg-gray-100 text-gray-500"}`}>
                    {ft.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-1 flex-shrink-0">
                {(["cash", "transfer"] as const).map((p) => (
                  <button key={p} type="button" onClick={() => setQuickPayment(p)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${quickPayment === p ? (p === "cash" ? "bg-emerald-500 text-white" : "bg-blue-500 text-white") : "bg-gray-100 text-gray-500"}`}>
                    {p === "cash" ? "💵 สด" : "📲 โอน"}
                  </button>
                ))}
              </div>
            </div>

            {/* Amount grid */}
            <div className="grid grid-cols-3 gap-2">
              {[50, 60, 80, 100, 150, 200, 300, 500, 1000].map((amt) => (
                <button key={amt} type="button"
                  onClick={() => setQuickAmount(amt)}
                  className={`py-3 rounded-2xl font-bold text-lg transition-all active:scale-95
                    ${quickAmount === amt ? "bg-blue-600 text-white shadow-md ring-2 ring-blue-300" : "bg-gray-50 text-gray-700 border-2 border-gray-200 hover:border-blue-300"}`}>
                  {amt}
                </button>
              ))}
            </div>

            {/* Amount adjuster */}
            <div className="text-center py-1">
              <p className={`text-3xl font-bold transition-all ${quickAmount > 0 ? "text-gray-900" : "text-gray-300"}`}>
                {quickAmount > 0 ? quickAmount.toLocaleString("th-TH") : "0"}
                <span className="text-base font-normal text-gray-400 ml-1">บาท</span>
              </p>
              {(() => { const ft = fuelTypes.find((f) => String(f.id) === quickFuelId); return ft?.currentPrice && quickAmount > 0 ? <p className="text-xs text-gray-400 mt-0.5">{(quickAmount / ft.currentPrice).toFixed(2)} ล · {ft.currentPrice} บ/ล</p> : null; })()}
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {[100, 50, 10].map((step) => (
                <button key={`-${step}`} type="button" onClick={() => setQuickAmount((a) => Math.max(0, a - step))}
                  className="h-10 rounded-xl bg-red-50 text-red-600 font-bold text-sm border border-red-100 active:bg-red-100">
                  -{step}
                </button>
              ))}
              {[10, 50, 100].map((step) => (
                <button key={`+${step}`} type="button" onClick={() => setQuickAmount((a) => a + step)}
                  className="h-10 rounded-xl bg-green-50 text-green-700 font-bold text-sm border border-green-100 active:bg-green-100">
                  +{step}
                </button>
              ))}
            </div>

            {/* Save button */}
            <button type="button" onClick={quickSave} disabled={quickSaving || quickAmount <= 0}
              className={`w-full py-4 rounded-2xl font-bold text-lg transition-all active:scale-95
                ${quickDone ? "bg-green-500 text-white" : quickAmount > 0 ? "bg-green-600 text-white hover:bg-green-700 shadow-sm" : "bg-gray-100 text-gray-400"}`}>
              {quickDone ? "✓ บันทึกแล้ว" : quickSaving ? "..." : quickAmount > 0 ? `บันทึก ${quickAmount.toLocaleString("th-TH")} บาท` : "เลือกยอดเงิน"}
            </button>

          </div>
        </div>
      )}


      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {loading ? (
          <div className="text-center py-20 text-gray-300 text-4xl animate-pulse">...</div>
        ) : (
          <>
            {/* Hero card */}
            <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-3xl p-6 text-white shadow-lg">
              <p className="text-blue-200 text-sm font-medium">ยอดขายรวมวันนี้</p>
              <p className="text-4xl font-bold mt-1">
                {fmtInt(summary?.totalRevenue ?? 0)}
                <span className="text-xl font-normal text-blue-200 ml-1">บาท</span>
              </p>
              <div className="flex gap-4 mt-4 pt-4 border-t border-blue-500/50 flex-wrap">
                <div>
                  <p className="text-blue-200 text-xs">น้ำมัน</p>
                  <p className="text-base font-bold">{fmtInt(summary?.fuelRevenue ?? 0)} ฿</p>
                </div>
                {(summary?.productRevenue ?? 0) > 0 && (
                  <div>
                    <p className="text-blue-200 text-xs">สินค้า</p>
                    <p className="text-base font-bold">{fmtInt(summary?.productRevenue ?? 0)} ฿</p>
                  </div>
                )}
                <div>
                  <p className="text-blue-200 text-xs">ลิตรรวม</p>
                  <p className="text-base font-bold">{fmt(summary?.totalLiters ?? 0)} L</p>
                </div>
                {(summary?.productCount ?? 0) > 0 && (
                  <div>
                    <p className="text-blue-200 text-xs">สินค้าเสริม</p>
                    <p className="text-base font-bold">{fmtInt(summary?.productCount ?? 0)} ชิ้น</p>
                  </div>
                )}
                {date !== today && (
                  <button onClick={() => setDate(today)} className="ml-auto self-end text-blue-200 text-xs underline">วันนี้</button>
                )}
              </div>
            </div>

            {/* Profit card — fuel only */}
            {summary && (summary.totalCost > 0 || summary.fuelRevenue > 0) && (() => {
              const fuelProfit = summary.fuelRevenue - summary.totalCost;
              return (
                <div className="bg-white rounded-2xl shadow-sm p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">กำไรน้ำมันขั้นต้นวันนี้</p>
                    <button onClick={() => profitUnlocked ? setProfitUnlocked(false) : setShowPinModal(true)}
                      className="text-gray-400 hover:text-gray-600 text-base">
                      {profitUnlocked ? "🔓" : "🔒"}
                    </button>
                  </div>
                  <div className={`transition-all duration-300 ${profitUnlocked ? "" : "blur-md select-none pointer-events-none"}`}>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-xs text-gray-400 mb-1">ขายน้ำมัน</p>
                        <p className="text-base font-bold text-gray-800">{fmtInt(summary.fuelRevenue)}</p>
                        <p className="text-xs text-gray-400">บาท</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-1">ต้นทุนน้ำมัน</p>
                        <p className="text-base font-bold text-gray-600">{fmtInt(summary.totalCost)}</p>
                        <p className="text-xs text-gray-400">บาท</p>
                      </div>
                      <div className={`rounded-xl py-1 ${fuelProfit >= 0 ? "bg-green-50" : "bg-red-50"}`}>
                        <p className="text-xs text-gray-400 mb-1">กำไรขั้นต้น</p>
                        <p className={`text-base font-bold ${fuelProfit >= 0 ? "text-green-700" : "text-red-600"}`}>
                          {fuelProfit >= 0 ? "+" : ""}{fmtInt(fuelProfit)}
                        </p>
                        <p className="text-xs text-gray-400">บาท</p>
                      </div>
                    </div>
                    {summary.totalLiters > 0 && summary.totalCost > 0 && (
                      <p className="text-center text-xs text-gray-400 mt-3">
                        กำไรน้ำมัน/ลิตรเฉลี่ย{" "}
                        <span className={`font-semibold ${fuelProfit >= 0 ? "text-green-600" : "text-red-500"}`}>
                          {fmt(fuelProfit / summary.totalLiters)} ฿/L
                        </span>
                      </p>
                    )}
                  </div>
                  {!profitUnlocked && (
                    <button onClick={() => setShowPinModal(true)} className="w-full mt-3 text-xs text-blue-500 font-medium">
                      แตะเพื่อดู
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Revenue breakdown (fuel vs product) */}
            {summary && summary.productRevenue > 0 && (
              <div className="bg-white rounded-2xl shadow-sm p-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">แยกตามประเภท</p>
                <div className="space-y-2">
                  {[
                    { label: "ยอดขายน้ำมัน", val: summary.fuelRevenue, color: "bg-blue-500" },
                    { label: "ยอดขายสินค้าเสริม", val: summary.productRevenue, color: "bg-purple-500" },
                  ].map((row) => (
                    <div key={row.label}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">{row.label}</span>
                        <span className="font-bold text-gray-800">{fmtInt(row.val)} บาท</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${row.color}`}
                          style={{ width: `${summary.totalRevenue > 0 ? (row.val / summary.totalRevenue) * 100 : 0}%` }} />
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm pt-2 border-t border-gray-100">
                    <span className="font-bold text-gray-700">รวมทั้งหมด</span>
                    <span className="font-bold text-gray-900">{fmtInt(summary.totalRevenue)} บาท</span>
                  </div>
                </div>
              </div>
            )}

            {/* Stock alerts */}
            {stocks.filter((s) => s.currentLiters < LOW_THRESHOLD && s.currentLiters >= 0).map((s) => (
              <div key={s.fuelTypeId} className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
                <p className="text-red-700 text-sm font-semibold">⚠ {s.fuelType.label} เหลือน้อย — {s.currentLiters.toLocaleString("th-TH", { maximumFractionDigits: 0 })} ลิตร</p>
              </div>
            ))}

            {/* Stock card */}
            {stocks.length > 0 && (
              <button onClick={() => router.push("/stock")} className="w-full text-left bg-white rounded-2xl shadow-sm p-5 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-center mb-3">
                  <p className="text-sm font-bold text-gray-700">น้ำมันคงเหลือ</p>
                  <span className="text-xs text-amber-600 font-medium">ดูสต๊อก →</span>
                </div>
                <div className="space-y-2">
                  {stocks.map((s) => {
                    const maxL = Math.max(...stocks.map((x) => x.currentLiters), 1);
                    const pct = Math.max(0, (s.currentLiters / maxL) * 100);
                    const isLow = s.currentLiters < LOW_THRESHOLD;
                    return (
                      <div key={s.fuelTypeId}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-600">{s.fuelType.label}</span>
                          <span className={`font-bold ${isLow ? "text-red-600" : "text-gray-800"}`}>
                            {s.currentLiters.toLocaleString("th-TH", { maximumFractionDigits: 0 })} L {isLow ? "⚠" : ""}
                          </span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${isLow ? "bg-red-400" : (FUEL_COLOR[s.fuelType.name] ?? "bg-gray-400")}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </button>
            )}

            {/* Payment breakdown */}
            <div className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
              {[
                { title: "⛽ น้ำมัน", data: summary?.fuelByPayment, total: summary?.fuelRevenue ?? 0 },
                ...(( summary?.productRevenue ?? 0) > 0 ? [{ title: "🛒 สินค้า", data: summary?.productByPayment, total: summary?.productRevenue ?? 0 }] : []),
              ].map(({ title, data, total }) => (
                <div key={title}>
                  <div className="flex justify-between items-baseline mb-3">
                    <p className="text-sm font-bold text-gray-700">{title}</p>
                    <p className="text-xs text-gray-400">{fmtInt(total)} บาท</p>
                  </div>
                  <div className="space-y-2">
                    {(["cash", "transfer", "credit"] as const).map((k) => {
                      const val = data?.[k] ?? 0;
                      const pct = total > 0 ? (val / total) * 100 : 0;
                      return (
                        <div key={k}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-500 text-xs">{PAYMENT_LABEL[k]}</span>
                            <span className="font-bold text-gray-800 text-xs">{fmtInt(val)} ฿</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-500 ${PAYMENT_COLOR[k]}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Fuel breakdown */}
            {fuelEntries.length > 0 && (
              <div className="bg-white rounded-2xl p-5 shadow-sm">
                <p className="text-sm font-bold text-gray-700 mb-4">ยอดขายตามชนิดน้ำมัน</p>
                <div className="space-y-4">
                  {fuelEntries.map(([key, v]) => {
                    const openMeter = meters.find((m) => m.fuelType.name === key && m.meterEnd === null);
                    const expectedMeter = openMeter ? openMeter.meterStart + v.liters : null;
                    return (
                      <div key={key}>
                        <div className="flex justify-between items-baseline mb-1">
                          <span className="text-sm font-semibold text-gray-700">{v.label}</span>
                          <div className="text-right">
                            <span className="text-sm font-bold text-gray-800">{fmtInt(v.revenue)} บาท</span>
                            <span className="text-xs text-gray-400 ml-2">{fmt(v.liters)} L</span>
                          </div>
                        </div>
                        <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-2">
                          <div className={`h-full rounded-full transition-all duration-500 ${FUEL_COLOR[key] ?? "bg-gray-400"}`}
                            style={{ width: `${maxFuelRevenue > 0 ? (v.revenue / maxFuelRevenue) * 100 : 0}%` }} />
                        </div>
                        {v.cost > 0 && profitUnlocked && (
                          <div className="grid grid-cols-3 gap-2 text-center text-xs mb-2">
                            <div><p className="text-gray-400">ต้นทุน/ล</p><p className="font-semibold text-gray-600">{fmt(v.avgCostPerLiter)} ฿</p></div>
                            <div><p className="text-gray-400">ต้นทุนรวม</p><p className="font-semibold text-gray-600">{fmtInt(v.cost)} ฿</p></div>
                            <div>
                              <p className="text-gray-400">กำไร</p>
                              <p className={`font-bold ${v.profit >= 0 ? "text-green-600" : "text-red-500"}`}>{v.profit >= 0 ? "+" : ""}{fmtInt(v.profit)} ฿</p>
                            </div>
                          </div>
                        )}
                        {/* Meter comparison */}
                        {openMeter && expectedMeter !== null && (
                          <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
                            <p className="text-xs text-blue-400 mb-1">เทียบมิเตอร์หน้าตู้</p>
                            <div className="flex items-center gap-1.5 text-sm font-mono">
                              <span className="text-gray-500">{openMeter.meterStart.toLocaleString("th-TH")}</span>
                              <span className="text-gray-400 text-xs">+ {fmt(v.liters)} L</span>
                              <span className="text-gray-400">=</span>
                              <span className="text-blue-700 font-bold text-base">{expectedMeter.toLocaleString("th-TH", { maximumFractionDigits: 2 })}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Fuel sale list */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50">
                <p className="text-sm font-bold text-gray-700">รายการขายน้ำมัน</p>
              </div>
              {sales.length === 0 ? (
                <div className="text-center py-8 text-gray-300">
                  <p className="text-3xl mb-1">⛽</p>
                  <p className="text-sm">ยังไม่มีรายการ</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {sales.map((s) => (
                    <div key={s.id} className="px-4 py-3 flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${FUEL_COLOR[s.fuelType.name] ?? "bg-gray-300"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800">
                          {s.fuelType.label}
                          <span className="text-gray-400 font-normal ml-1 text-xs">· {s.pumpNo}</span>
                        </p>
                        <p className="text-xs text-gray-400">
                          {fmtTime(s.date) ? `${fmtTime(s.date)} · ` : ""}{s.sellerName} · {fmt(s.liters)} L
                          {s.customerName && <span className="text-orange-500"> · {s.customerName}</span>}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-gray-800">{fmtInt(s.totalAmount)} บ</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.paymentMethod === "cash" ? "bg-emerald-50 text-emerald-700" : s.paymentMethod === "transfer" ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-700"}`}>
                          {PAYMENT_LABEL[s.paymentMethod]}
                        </span>
                      </div>
                      <button onClick={() => deleteSale(s.id, s.totalAmount)} disabled={deletingSaleId === s.id}
                        className="flex-shrink-0 text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded-lg hover:bg-red-50 disabled:opacity-40">
                        {deletingSaleId === s.id ? "..." : "ลบ"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Product sale list */}
            {productSales.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-50">
                  <p className="text-sm font-bold text-gray-700">รายการขายสินค้า</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {productSales.map((s) => (
                    <div key={s.id} className="px-4 py-3 flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-purple-400" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800">{s.product.name}</p>
                        <p className="text-xs text-gray-400">
                          {fmtTime(s.date) ? `${fmtTime(s.date)} · ` : ""}{s.sellerName} · {s.quantity} {s.product.unit}
                          {s.customerName && <span className="text-orange-500"> · {s.customerName}</span>}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-gray-800">{fmtInt(s.totalAmount)} บ</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.paymentMethod === "cash" ? "bg-emerald-50 text-emerald-700" : s.paymentMethod === "transfer" ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-700"}`}>
                          {PAYMENT_LABEL[s.paymentMethod]}
                        </span>
                      </div>
                      <button onClick={() => deleteProductSale(s.id, s.totalAmount)} disabled={deletingProductSaleId === s.id}
                        className="flex-shrink-0 text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded-lg hover:bg-red-50 disabled:opacity-40">
                        {deletingProductSaleId === s.id ? "..." : "ลบ"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
    {showPinModal && (
      <PinModal
        title="ใส่รหัสดูกำไร"
        onSuccess={() => { setProfitUnlocked(true); setShowPinModal(false); }}
        onCancel={() => setShowPinModal(false)}
      />
    )}
    </>
  );
}
