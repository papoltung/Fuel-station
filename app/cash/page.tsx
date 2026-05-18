"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type CashRecord = { id: number; date: string; counts: string; total: number; note: string | null };

const DENOMS = [1000, 500, 100, 50, 20, 10, 5, 1] as const;

const DENOM_COLOR: Record<number, string> = {
  1000: "bg-amber-100 border-amber-300 text-amber-800",
  500:  "bg-purple-100 border-purple-300 text-purple-800",
  100:  "bg-red-100 border-red-300 text-red-800",
  50:   "bg-blue-100 border-blue-300 text-blue-800",
  20:   "bg-green-100 border-green-300 text-green-800",
  10:   "bg-gray-100 border-gray-300 text-gray-700",
  5:    "bg-gray-100 border-gray-300 text-gray-700",
  1:    "bg-gray-100 border-gray-300 text-gray-700",
};

function fmt(n: number) {
  return n.toLocaleString("th-TH");
}

export default function CashPage() {
  const router = useRouter();
  const [counts, setCounts] = useState<Record<number, number>>(
    Object.fromEntries(DENOMS.map((d) => [d, 0]))
  );
  const [received, setReceived] = useState("");
  const [mode, setMode] = useState<"count" | "change" | "history">("count");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [records, setRecords] = useState<CashRecord[]>([]);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => { loadHistory(); }, []);

  function loadHistory() {
    fetch("/api/cash-counts").then((r) => r.json()).then(setRecords).catch(() => {});
  }

  async function saveCount() {
    if (total === 0) return;
    setSaving(true);
    await fetch("/api/cash-counts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ counts, total, note }),
    });
    setSaving(false);
    setNote("");
    loadHistory();
    setMode("history");
  }

  async function deleteRecord(id: number) {
    setDeletingId(id);
    await fetch(`/api/cash-counts/${id}`, { method: "DELETE" });
    setDeletingId(null);
    loadHistory();
  }

  const total = DENOMS.reduce((sum, d) => sum + d * (counts[d] ?? 0), 0);

  function add(denom: number, delta: number) {
    setCounts((c) => ({ ...c, [denom]: Math.max(0, (c[denom] ?? 0) + delta) }));
  }

  function reset() {
    setCounts(Object.fromEntries(DENOMS.map((d) => [d, 0])));
    setReceived("");
  }

  // คำนวณทอน
  const charge = Number(received || 0);
  const change = charge > 0 ? charge - total : 0;

  // แนะนำแบงค์ทอน
  function calcChangeBreakdown(amount: number) {
    if (amount <= 0) return [];
    const result: { denom: number; count: number }[] = [];
    let remaining = Math.round(amount);
    for (const d of DENOMS) {
      if (remaining <= 0) break;
      const cnt = Math.floor(remaining / d);
      if (cnt > 0) { result.push({ denom: d, count: cnt }); remaining -= cnt * d; }
    }
    return result;
  }

  const changeBreakdown = calcChangeBreakdown(Math.abs(change));

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard")} className="text-gray-500 text-xl w-8">←</button>
          <h1 className="text-base font-bold text-gray-900">นับเงิน / ทอนตัง</h1>
        </div>
        <button onClick={reset} className="text-gray-400 text-xs border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">
          รีเซ็ต
        </button>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">

        {/* Mode toggle */}
        <div className="flex bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
          {(["count", "change", "history"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${mode === m ? "bg-blue-600 text-white" : "text-gray-400"}`}>
              {m === "count" ? "นับเงิน" : m === "change" ? "ทอนตัง" : "ประวัติ"}
            </button>
          ))}
        </div>

        {/* ยอดรวม */}
        <div className={`rounded-3xl p-5 text-white shadow-lg ${change > 0 ? "bg-gradient-to-br from-red-500 to-orange-500" : change < 0 ? "bg-gradient-to-br from-green-500 to-emerald-600" : "bg-gradient-to-br from-blue-600 to-blue-800"}`}>
          {mode === "count" ? (
            <>
              <p className="text-blue-200 text-sm font-medium">จบกะแล้วได้เงินกี่บาท?</p>
              <p className="text-4xl font-bold mt-1">
                {fmt(total)}
                <span className="text-xl font-normal text-blue-200 ml-1">บาท</span>
              </p>
              <p className="text-blue-200 text-xs mt-2">
                {DENOMS.filter((d) => counts[d] > 0).map((d) => `${d}×${counts[d]}`).join("  ") || "ยังไม่ได้นับ"}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium opacity-80">{change > 0 ? "ทอน" : change < 0 ? "รับเงินไม่พอ" : "รับเงินพอดี"}</p>
              <p className="text-4xl font-bold mt-1">
                {fmt(Math.abs(change))}
                <span className="text-xl font-normal opacity-70 ml-1">บาท</span>
              </p>
              <p className="text-sm opacity-70 mt-1">รับ {fmt(charge)} · ค่า {fmt(total)}</p>
            </>
          )}
        </div>

        {/* ช่องใส่เงินที่รับ (mode=change) */}
        {mode === "change" && (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">ลูกค้าจ่ายมา (บาท)</p>
            <div className="grid grid-cols-4 gap-2 mb-2">
              {[20, 50, 100, 500, 1000].map((amt) => (
                <button key={amt} type="button"
                  onClick={() => setReceived(String(amt))}
                  className={`py-2.5 rounded-xl font-bold text-sm transition-all ${received === String(amt) ? "bg-blue-600 text-white" : "bg-gray-50 text-gray-700 border border-gray-200"}`}>
                  {amt}
                </button>
              ))}
            </div>
            <input type="number" inputMode="numeric" value={received}
              onChange={(e) => setReceived(e.target.value)}
              placeholder="หรือพิมพ์จำนวน"
              className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-2xl font-bold text-center focus:outline-none focus:border-blue-500" />

            {change > 0 && changeBreakdown.length > 0 && (
              <div className="mt-3 bg-green-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-green-600 mb-2">แนะนำแบงค์ทอน</p>
                <div className="flex flex-wrap gap-2">
                  {changeBreakdown.map(({ denom, count }) => (
                    <span key={denom} className="bg-white border border-green-200 rounded-lg px-3 py-1 text-sm font-bold text-green-700">
                      {denom} × {count}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* นับแบงค์ */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            {mode === "count" ? "นับแบงค์ในมือ" : "มูลค่าสินค้า / ค่าน้ำมัน"}
          </p>
          <div className="space-y-2">
            {DENOMS.map((d) => {
              const cnt = counts[d] ?? 0;
              const subtotal = d * cnt;
              return (
                <div key={d} className="flex items-center gap-3">
                  {/* แบงค์ */}
                  <div className={`w-16 text-center py-1.5 rounded-xl border-2 font-bold text-sm ${DENOM_COLOR[d]}`}>
                    {fmt(d)}
                  </div>

                  {/* ปุ่ม − count + */}
                  <button onClick={() => add(d, -1)} disabled={cnt === 0}
                    className="w-10 h-10 rounded-xl bg-gray-100 text-gray-500 font-bold text-lg flex items-center justify-center active:bg-gray-200 disabled:opacity-30">
                    −
                  </button>

                  <button onClick={() => add(d, 1)}
                    className="w-10 h-10 rounded-xl bg-blue-600 text-white font-bold text-lg flex items-center justify-center active:bg-blue-700 shadow-sm">
                    +
                  </button>

                  {/* จำนวน */}
                  <div className="flex-1 flex items-center gap-2">
                    <input type="number" inputMode="numeric" min={0} value={cnt === 0 ? "" : cnt}
                      onChange={(e) => setCounts((c) => ({ ...c, [d]: Math.max(0, Number(e.target.value) || 0) }))}
                      placeholder="0"
                      className="w-14 text-center border border-gray-200 rounded-lg py-1.5 text-sm font-mono focus:outline-none focus:border-blue-500" />
                    <span className="text-xs text-gray-400">ใบ</span>
                  </div>

                  {/* subtotal */}
                  <div className="w-20 text-right">
                    <p className={`text-sm font-bold ${subtotal > 0 ? "text-gray-800" : "text-gray-200"}`}>
                      {subtotal > 0 ? fmt(subtotal) : "—"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* รวม */}
          <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-baseline">
            <p className="text-sm font-semibold text-gray-500">รวม</p>
            <p className="text-2xl font-bold text-gray-900">{fmt(total)} <span className="text-base font-normal text-gray-400">บาท</span></p>
          </div>

          {/* บันทึก */}
          {mode === "count" && total > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
              <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="หมายเหตุ เช่น ปิดกะ, เช้า, เย็น (ไม่บังคับ)"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
              <button onClick={saveCount} disabled={saving}
                className="w-full bg-green-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-green-700 disabled:opacity-50">
                {saving ? "..." : `บันทึก ${fmt(total)} บาท`}
              </button>
            </div>
          )}
        </div>

        {/* ประวัติ */}
        {mode === "history" && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50">
              <p className="text-sm font-bold text-gray-700">ประวัติการนับเงิน</p>
            </div>
            {records.length === 0 ? (
              <p className="text-center text-gray-300 py-8 text-sm">ยังไม่มีประวัติ</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {records.map((r) => {
                  const c: Record<string, number> = JSON.parse(r.counts);
                  const summary = Object.entries(c).filter(([, v]) => v > 0)
                    .sort((a, b) => Number(b[0]) - Number(a[0]))
                    .map(([d, v]) => `${Number(d).toLocaleString()}×${v}`).join("  ");
                  return (
                    <div key={r.id} className="px-5 py-3 flex justify-between items-start">
                      <div>
                        <p className="text-sm font-bold text-gray-800">{fmt(r.total)} บาท</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(r.date).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          {r.note ? ` · ${r.note}` : ""}
                        </p>
                        <p className="text-xs text-gray-300 mt-0.5">{summary}</p>
                      </div>
                      <button onClick={() => deleteRecord(r.id)} disabled={deletingId === r.id}
                        className="text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded-lg hover:bg-red-50 disabled:opacity-40">
                        {deletingId === r.id ? "..." : "ลบ"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
