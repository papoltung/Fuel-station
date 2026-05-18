"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type StockItem = { id: number; fuelTypeId: number; currentLiters: number; fuelType: { name: string; label: string } };
type Purchase = { id: number; date: string; liters: number; costPerLiter: number; totalCost: number; invoiceNo: string | null; supplier: string | null; fuelType: { label: string; currentPrice: number } };
type StockCheck = { id: number; date: string; systemLiters: number; actualLiters: number; difference: number; fuelType: { label: string } };
type Product = { id: number; name: string; category: string; size: string; unit: string; currentPrice: number; costPrice: number; currentStock: number; minStock: number; isActive: boolean };

const LOW_THRESHOLD = 1000;
const FUEL_COLOR: Record<string, string> = {
  diesel: "bg-amber-400",
  benzin95: "bg-blue-400",
  benzin91: "bg-green-400",
  e20: "bg-purple-400",
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
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletingCheckId, setDeletingCheckId] = useState<number | null>(null);

  function reload() {
    setLoading(true);
    Promise.all([
      fetch("/api/fuel-stock").then((r) => r.json()).catch(() => []),
      fetch("/api/purchases").then((r) => r.json()).catch(() => []),
      fetch("/api/stock-checks").then((r) => r.json()).catch(() => []),
      fetch("/api/products?all=1").then((r) => r.json()).catch(() => []),
    ]).then(([s, p, c, pr]) => {
      setStocks(s ?? []);
      setPurchases(p ?? []);
      setChecks(c ?? []);
      setProducts(pr ?? []);
      setLoading(false);
    });
  }

  useEffect(() => { reload(); }, []);

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
  const lowAlerts = stocks.filter((s) => s.currentLiters < LOW_THRESHOLD && s.currentLiters >= 0);
  const lowProductAlerts = products.filter((p) => p.isActive && p.currentStock <= p.minStock);

  return (
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

            {/* Stock per fuel */}
            <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
              <p className="text-sm font-bold text-gray-700">คงเหลือแยกชนิด</p>
              {stocks.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">ยังไม่มีข้อมูล</p>
              ) : (
                stocks.map((s) => {
                  const maxL = Math.max(...stocks.map((x) => x.currentLiters), 1);
                  const pct = Math.max(0, (s.currentLiters / maxL) * 100);
                  const isLow = s.currentLiters < LOW_THRESHOLD;
                  return (
                    <div key={s.id}>
                      <div className="flex justify-between items-baseline mb-1">
                        <span className="text-sm font-semibold text-gray-700">{s.fuelType.label}</span>
                        <span className={`text-sm font-bold ${isLow ? "text-red-600" : "text-gray-800"}`}>
                          {fmt(s.currentLiters)} L {isLow && "⚠"}
                        </span>
                      </div>
                      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${isLow ? "bg-red-400" : (FUEL_COLOR[s.fuelType.name] ?? "bg-gray-400")}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

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
                // สรุปเฉลี่ยทุก lot แยกตามชนิด
                const byFuel: Record<string, { label: string; sellPrice: number; totalLiters: number; totalCost: number }> = {};
                for (const p of purchases) {
                  const k = p.fuelType.label;
                  if (!byFuel[k]) byFuel[k] = { label: k, sellPrice: p.fuelType.currentPrice, totalLiters: 0, totalCost: 0 };
                  byFuel[k].totalLiters += p.liters;
                  byFuel[k].totalCost += p.totalCost;
                }
                return (
                  <div>
                    {Object.values(byFuel).length > 0 && (
                      <div className="bg-blue-50 border-b border-blue-100 px-5 py-4 space-y-3">
                        <p className="text-xs font-bold text-blue-700 uppercase tracking-wide">ทุนเฉลี่ยรวมทุก Lot</p>
                        {Object.values(byFuel).map((f) => {
                          const avgCost = f.totalLiters > 0 ? f.totalCost / f.totalLiters : 0;
                          const profitPerLiter = f.sellPrice > 0 ? f.sellPrice - avgCost : null;
                          const totalProfit = profitPerLiter !== null ? profitPerLiter * f.totalLiters : null;
                          return (
                            <div key={f.label} className="bg-white rounded-xl px-4 py-3">
                              <p className="text-sm font-semibold text-gray-800 mb-2">{f.label}</p>
                              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                                <div>
                                  <p className="text-gray-400">ทุนเฉลี่ย</p>
                                  <p className="font-bold text-gray-700">{fmtDec(avgCost)} ฿</p>
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
                                  <p className="text-gray-400">กำไรรวม</p>
                                  <p className={`font-bold ${totalProfit === null ? "text-gray-300" : totalProfit >= 0 ? "text-green-600" : "text-red-500"}`}>
                                    {totalProfit !== null ? `${totalProfit >= 0 ? "+" : ""}${fmt(totalProfit)} ฿` : "—"}
                                  </p>
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
  );
}
