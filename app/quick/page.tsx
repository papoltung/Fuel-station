"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

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

function loadSummary(date: string, setSummary: (s: Summary) => void) {
  fetch(`/api/sales/summary?date=${date}`)
    .then((r) => r.json())
    .then((s) => { if (!Array.isArray(s)) setSummary(s); })
    .catch(() => {});
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
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    const savedPayment = localStorage.getItem("quick_payment") as "cash" | "transfer" | null;
    if (savedPayment) setPayment(savedPayment);
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
  }, []);

  const ft = fuelTypes.find((f) => String(f.id) === fuelId);
  const liters = ft && ft.currentPrice > 0 && amount > 0 ? amount / ft.currentPrice : 0;

  async function save() {
    if (amount <= 0 || !ft || ft.currentPrice <= 0) return;
    setSaving(true);
    const seller = localStorage.getItem("fuel_last_seller") ?? "N";
    const d = new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: dateStr,
          sellerName: seller,
          fuelTypeId: fuelId,
          pumpNo: "หัวจ่าย 1",
          totalAmount: String(amount),
          pricePerLiter: String(ft.currentPrice),
          paymentMethod: payment,
          customerName: "",
        }),
      });
      if (res.ok) {
        const savedL = liters;
        setAmount(0);
        if (flashTimer.current) clearTimeout(flashTimer.current);
        setFlash({ liters: savedL, total: amount });
        flashTimer.current = setTimeout(() => setFlash(null), 1800);
        loadSummary(today, setSummary);
      }
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
          {saving ? "..." : amount > 0 ? `บันทึก ${fmtInt(amount)} บาท` : "เลือกยอดเงิน"}
        </button>

        {/* Flash feedback */}
        {flash && (
          <div className="bg-green-500 text-white rounded-2xl px-4 py-3 text-center animate-pulse">
            <p className="font-bold text-lg">✓ บันทึกแล้ว {fmtInt(flash.total)} บาท</p>
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
