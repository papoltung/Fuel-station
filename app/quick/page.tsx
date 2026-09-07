"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { browserSaleQueue, syncPendingSales, type PendingSale } from "@/lib/sale-queue";

type FuelType = { id: number; name: string; label: string; currentPrice: number };
type Summary = {
  totalRevenue: number;
  fuelRevenue: number;
  productRevenue: number;
  totalLiters: number;
  productCount: number;
  fuelByPayment: Record<string, number>;
  productByPayment: Record<string, number>;
};

const PRESETS = [50, 60, 80, 100, 150, 200, 300, 500, 1000];
const ADJUSTS = [-100, -50, -10, 10, 50, 100];
const PAYMENT_LABEL: Record<string, string> = { cash: "เงินสด", transfer: "โอน", credit: "เครดิต" };
const PAYMENT_COLOR: Record<string, string> = { cash: "bg-emerald-500", transfer: "bg-blue-500", credit: "bg-orange-400" };

function fmtInt(n: number) { return n.toLocaleString("th-TH", { maximumFractionDigits: 0 }); }
function fmtDec(n: number) { return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function localDateKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function loadSummary(date: string, setSummary: (s: Summary) => void) {
  fetch(`/api/sales/summary?date=${date}`)
    .then((r) => r.json())
    .then((s) => { if (!Array.isArray(s)) setSummary(s); })
    .catch(() => {});
}

type QueueStatus = { queued: number; needsReview: number };
type QueueSyncContext = {
  today: string;
  syncingRef: { current: boolean };
  syncAgainRef: { current: boolean };
  setSummary: (summary: Summary) => void;
  setQueueStatus: (status: QueueStatus) => void;
  setSyncing: (syncing: boolean) => void;
};

async function syncBrowserSales(context: QueueSyncContext) {
  if (context.syncingRef.current) {
    context.syncAgainRef.current = true;
    return;
  }
  context.syncingRef.current = true;
  context.setSyncing(true);
  try {
    const result = await syncPendingSales(browserSaleQueue, async (item) => {
      const response = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.payload),
      });
      const data = await response.json().catch(() => ({}));
      return { ok: response.ok, status: response.status, error: typeof data.error === "string" ? data.error : undefined };
    });
    context.setQueueStatus({ queued: result.queued, needsReview: result.needsReview });
    if (result.synced > 0) loadSummary(context.today, context.setSummary);
  } catch {
    const items = await browserSaleQueue.list().catch(() => []);
    context.setQueueStatus({
      queued: items.filter((item) => item.status !== "needs-review").length,
      needsReview: items.filter((item) => item.status === "needs-review").length,
    });
  } finally {
    context.syncingRef.current = false;
    context.setSyncing(false);
    if (context.syncAgainRef.current) {
      context.syncAgainRef.current = false;
      void syncBrowserSales(context);
    }
  }
}

export default function QuickPage() {
  const router = useRouter();
  const [fuelTypes, setFuelTypes] = useState<FuelType[]>([]);
  const [fuelId, setFuelId] = useState("");
  const [payment, setPayment] = useState<"cash" | "transfer">("cash");
  const [amount, setAmount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<{ liters: number; total: number } | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [queueStatus, setQueueStatus] = useState({ queued: 0, needsReview: 0 });
  const [syncing, setSyncing] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncingRef = useRef(false);
  const syncAgainRef = useRef(false);
  const [today] = useState(localDateKey);

  useEffect(() => {
    const savedPayment = localStorage.getItem("quick_payment") as "cash" | "transfer" | null;
    if (savedPayment) queueMicrotask(() => setPayment(savedPayment));
    fetch("/api/fuel-types")
      .then((r) => r.json())
      .then((data: FuelType[]) => {
        setFuelTypes(data);
        const savedFuelId = localStorage.getItem("quick_fuelId");
        const match = savedFuelId && data.find((f) => String(f.id) === savedFuelId);
        setFuelId(match ? savedFuelId! : data.length > 0 ? String(data[0].id) : "");
      })
      .catch(() => {});
    loadSummary(today, setSummary);
    const context = { today, syncingRef, syncAgainRef, setSummary, setQueueStatus, setSyncing };
    void syncBrowserSales(context);
    const handleOnline = () => void syncBrowserSales(context);
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [today]);

  const ft = fuelTypes.find((f) => String(f.id) === fuelId);
  const liters = ft && ft.currentPrice > 0 && amount > 0 ? amount / ft.currentPrice : 0;

  async function save() {
    if (amount <= 0 || !ft || ft.currentPrice <= 0) return;
    const seller = localStorage.getItem("fuel_last_seller") ?? "N";
    const d = new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const clientRequestId = crypto.randomUUID();
    const item: PendingSale = {
      id: clientRequestId,
      createdAt: new Date().toISOString(),
      status: "queued",
      attempts: 0,
      payload: {
        clientRequestId,
        date: dateStr,
        sellerName: seller,
        fuelTypeId: fuelId,
        pumpNo: "หัวจ่าย 1",
        totalAmount: String(amount),
        pricePerLiter: String(ft.currentPrice),
        paymentMethod: payment,
        customerName: "",
      },
    };
    setSaving(true);
    try {
      await browserSaleQueue.put(item);
      const savedL = liters;
      setAmount(0);
      setQueueStatus((current) => ({ ...current, queued: current.queued + 1 }));
      if (flashTimer.current) clearTimeout(flashTimer.current);
      setFlash({ liters: savedL, total: amount });
      flashTimer.current = setTimeout(() => setFlash(null), 1800);
      void syncBrowserSales({ today, syncingRef, syncAgainRef, setSummary, setQueueStatus, setSyncing });
    } catch {
      alert("เก็บรายการลงเครื่องไม่ได้ ยอดเงินยังอยู่ กรุณาลองอีกครั้ง");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <button onClick={() => router.push("/dashboard")} className="text-gray-500 text-xl w-8">←</button>
        <h1 className="text-base font-bold text-gray-900">บันทึกขายด่วน</h1>
        {summary !== null && (
          <p className="text-sm font-bold text-blue-600">{fmtInt(summary.totalRevenue)} ฿</p>
        )}
      </div>

      <div className="flex-1 max-w-lg mx-auto w-full p-4 space-y-3">

        {(queueStatus.queued > 0 || queueStatus.needsReview > 0 || syncing) && (
          <div role="status" className={`rounded-xl border px-4 py-3 text-sm ${queueStatus.needsReview > 0 ? "border-orange-200 bg-orange-50 text-orange-800" : "border-blue-200 bg-blue-50 text-blue-800"}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-bold">{syncing ? "กำลังส่งข้อมูล…" : queueStatus.queued > 0 ? `รอส่ง ${queueStatus.queued} รายการ` : `ต้องตรวจ ${queueStatus.needsReview} รายการ`}</p>
                {queueStatus.needsReview > 0 && <p className="text-xs mt-0.5">ข้อมูลบางรายการไม่ผ่าน กรุณาให้เจ้าของตรวจ</p>}
              </div>
              {queueStatus.queued > 0 && !syncing && <button type="button" onClick={() => void syncBrowserSales({ today, syncingRef, syncAgainRef, setSummary, setQueueStatus, setSyncing })} className="min-h-11 rounded-lg bg-blue-600 px-3 font-bold text-white">ส่งอีกครั้ง</button>}
            </div>
          </div>
        )}

        {/* Fuel tabs */}
        <div className="flex gap-2">
          {fuelTypes.map((f) => (
            <button key={f.id} onClick={() => { const id = String(f.id); setFuelId(id); localStorage.setItem("quick_fuelId", id); setAmount(0); }}
              className={`flex-1 py-3 rounded-2xl font-bold text-sm transition-all ${fuelId === String(f.id) ? "bg-blue-600 text-white shadow-md" : "bg-white text-gray-600 border-2 border-gray-200"}`}>
              {f.label}
              {f.currentPrice > 0 && <span className={`block text-xs font-normal mt-0.5 ${fuelId === String(f.id) ? "text-blue-200" : "text-gray-400"}`}>{fmtDec(f.currentPrice)} ฿/L</span>}
            </button>
          ))}
          {/* Payment toggle */}
          <div className="flex flex-col gap-1">
            <button onClick={() => { setPayment("cash"); localStorage.setItem("quick_payment", "cash"); }}
              className={`px-4 py-1.5 rounded-xl font-bold text-xs transition-all ${payment === "cash" ? "bg-green-500 text-white" : "bg-white text-gray-500 border-2 border-gray-200"}`}>
              สด
            </button>
            <button onClick={() => { setPayment("transfer"); localStorage.setItem("quick_payment", "transfer"); }}
              className={`px-4 py-1.5 rounded-xl font-bold text-xs transition-all ${payment === "transfer" ? "bg-blue-500 text-white" : "bg-white text-gray-500 border-2 border-gray-200"}`}>
              โอน
            </button>
          </div>
        </div>

        {/* Preset amounts */}
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((amt) => (
            <button key={amt} onClick={() => setAmount(amt)}
              className={`py-4 rounded-2xl font-bold text-lg transition-all active:scale-95 ${amount === amt ? "bg-blue-600 text-white shadow-md ring-2 ring-blue-300" : "bg-white text-gray-700 border-2 border-gray-200"}`}>
              {amt}
            </button>
          ))}
        </div>

        {/* Current amount display */}
        <div className="bg-white rounded-2xl px-4 py-3 text-center">
          <p className="text-4xl font-bold text-gray-800">{amount > 0 ? fmtInt(amount) : <span className="text-gray-300">0</span>}
            <span className="text-lg font-normal text-gray-400 ml-1">บาท</span>
          </p>
          {liters > 0 && <p className="text-sm text-gray-400 mt-0.5">= {fmtDec(liters)} ลิตร</p>}
        </div>

        {/* Adjust buttons */}
        <div className="grid grid-cols-6 gap-1.5">
          {ADJUSTS.map((adj) => (
            <button key={adj} onClick={() => setAmount((a) => Math.max(0, a + adj))}
              className={`py-2.5 rounded-xl font-bold text-xs transition-all active:scale-95 ${adj < 0 ? "bg-red-50 text-red-500 hover:bg-red-100" : "bg-green-50 text-green-600 hover:bg-green-100"}`}>
              {adj > 0 ? `+${adj}` : adj}
            </button>
          ))}
        </div>

        {/* Submit */}
        <button onClick={save} disabled={saving || amount <= 0}
          className={`w-full py-5 rounded-2xl font-bold text-xl transition-all active:scale-95 ${amount > 0 ? "bg-blue-600 text-white hover:bg-blue-700 shadow-lg" : "bg-gray-100 text-gray-300"} disabled:opacity-60`}>
          {saving ? "กำลังเก็บลงเครื่อง…" : amount > 0 ? `บันทึก ${fmtInt(amount)} บาท` : "เลือกยอดเงิน"}
        </button>

        {/* Flash feedback */}
        {flash && (
          <div className="bg-green-500 text-white rounded-2xl px-4 py-3 text-center animate-pulse">
            <p className="font-bold text-lg">✓ เก็บในเครื่องแล้ว {fmtInt(flash.total)} บาท</p>
            <p className="text-sm text-green-100">{fmtDec(flash.liters)} ลิตร · {payment === "cash" ? "เงินสด" : "โอน"}</p>
          </div>
        )}

        {/* Summary hero card */}
        {summary && (
          <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-3xl p-5 text-white shadow-lg">
            <p className="text-blue-200 text-xs font-medium">ยอดขายรวมวันนี้</p>
            <p className="text-3xl font-bold mt-0.5">
              {fmtInt(summary.totalRevenue)}
              <span className="text-lg font-normal text-blue-200 ml-1">บาท</span>
            </p>
            <div className="flex gap-4 mt-3 pt-3 border-t border-blue-500/50 flex-wrap">
              <div>
                <p className="text-blue-200 text-xs">น้ำมัน</p>
                <p className="text-sm font-bold">{fmtInt(summary.fuelRevenue)} ฿</p>
              </div>
              {summary.productRevenue > 0 && (
                <div>
                  <p className="text-blue-200 text-xs">สินค้า</p>
                  <p className="text-sm font-bold">{fmtInt(summary.productRevenue)} ฿</p>
                </div>
              )}
              <div>
                <p className="text-blue-200 text-xs">ลิตรรวม</p>
                <p className="text-sm font-bold">{fmtDec(summary.totalLiters)} L</p>
              </div>
              {summary.productCount > 0 && (
                <div>
                  <p className="text-blue-200 text-xs">สินค้าเสริม</p>
                  <p className="text-sm font-bold">{fmtInt(summary.productCount)} ชิ้น</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Payment breakdown */}
        {summary && (
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-4">
            {[
              { title: "⛽ น้ำมัน", data: summary.fuelByPayment, total: summary.fuelRevenue },
              ...(summary.productRevenue > 0 ? [{ title: "🛒 สินค้า", data: summary.productByPayment, total: summary.productRevenue }] : []),
            ].map(({ title, data, total }) => (
              <div key={title}>
                <div className="flex justify-between items-baseline mb-2">
                  <p className="text-sm font-bold text-gray-700">{title}</p>
                  <p className="text-xs text-gray-400">{fmtInt(total)} บาท</p>
                </div>
                <div className="space-y-1.5">
                  {(["cash", "transfer", "credit"] as const).map((k) => {
                    const val = data?.[k] ?? 0;
                    const pct = total > 0 ? (val / total) * 100 : 0;
                    return (
                      <div key={k}>
                        <div className="flex justify-between mb-0.5">
                          <span className="text-gray-500 text-xs">{PAYMENT_LABEL[k]}</span>
                          <span className="font-bold text-gray-800 text-xs">{fmtInt(val)} ฿</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${PAYMENT_COLOR[k]}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
