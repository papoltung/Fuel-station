"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type FuelType = { id: number; name: string; label: string };
type StockItem = { fuelTypeId: number; currentLiters: number; fuelType: FuelType };

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function StockCheckPage() {
  const router = useRouter();
  const [fuelTypes, setFuelTypes] = useState<FuelType[]>([]);
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<{ label: string; system: number; actual: number; diff: number }[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);
  const [actuals, setActuals] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});

  useEffect(() => {
    Promise.all([
      fetch("/api/fuel-types").then((r) => r.json()),
      fetch("/api/fuel-stock").then((r) => r.json()),
    ]).then(([fts, stks]: [FuelType[], StockItem[]]) => {
      setFuelTypes(fts);
      setStocks(stks);
    });
  }, []);

  function getSystemLiters(fuelTypeId: number) {
    return stocks.find((s) => s.fuelTypeId === fuelTypeId)?.currentLiters ?? 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const entries = fuelTypes.filter((ft) => actuals[ft.id] !== undefined && actuals[ft.id] !== "");
    if (entries.length === 0) return setError("กรอกค่าวัดถังจริงอย่างน้อย 1 ชนิด");

    setLoading(true);
    try {
      const res = await Promise.all(
        entries.map((ft) =>
          fetch("/api/stock-checks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fuelTypeId: ft.id,
              actualLiters: Number(actuals[ft.id]),
              note: notes[ft.id] || null,
              date,
            }),
          }).then((r) => r.json())
        )
      );
      setResults(
        res.map((r) => ({
          label: r.fuelType.label,
          system: r.systemLiters,
          actual: r.actualLiters,
          diff: r.difference,
        }))
      );
      setSubmitted(true);
    } catch {
      setError("เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.push("/stock")} className="text-gray-500 text-xl w-8">←</button>
          <h1 className="text-base font-bold text-gray-800">ผลวัดถัง</h1>
        </div>
        <div className="max-w-lg mx-auto p-4 space-y-3">
          {results.map((r, i) => {
            const isShort = r.diff < -20;
            const isOver = r.diff > 20;
            return (
              <div key={i} className={`rounded-2xl p-5 ${isShort ? "bg-red-50 border border-red-200" : isOver ? "bg-yellow-50 border border-yellow-200" : "bg-white shadow-sm"}`}>
                <p className="font-bold text-gray-800 mb-3">{r.label}</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>คงเหลือตามระบบ</span>
                    <span className="font-mono">{fmt(r.system)} L</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>วัดถังจริง</span>
                    <span className="font-mono">{fmt(r.actual)} L</span>
                  </div>
                  <div className={`flex justify-between font-bold text-base pt-1 border-t ${isShort ? "text-red-600 border-red-200" : isOver ? "text-yellow-700 border-yellow-200" : "text-green-700 border-gray-100"}`}>
                    <span>ส่วนต่าง</span>
                    <span className="font-mono">{r.diff > 0 ? "+" : ""}{fmt(r.diff)} L</span>
                  </div>
                </div>
                {isShort && (
                  <p className="mt-2 text-red-600 text-xs font-semibold">⚠ น้ำมันขาด {fmt(Math.abs(r.diff))} ลิตร กรุณาตรวจสอบ</p>
                )}
                {isOver && (
                  <p className="mt-2 text-yellow-700 text-xs font-semibold">⚠ น้ำมันเกิน {fmt(r.diff)} ลิตร</p>
                )}
              </div>
            );
          })}
          <button
            onClick={() => router.push("/stock")}
            className="w-full bg-gray-800 text-white font-bold py-4 rounded-2xl text-base"
          >
            กลับหน้าสต๊อก
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.push("/stock")} className="text-gray-500 text-xl w-8">←</button>
        <h1 className="text-base font-bold text-gray-800">วัดถังจริง</h1>
      </div>

      <form onSubmit={handleSubmit} className="max-w-lg mx-auto p-4 space-y-4">
        <details className="text-sm">
          <summary className="text-gray-400 cursor-pointer select-none">วันที่: {date}</summary>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-2 w-full border-2 border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500"
          />
        </details>

        {fuelTypes.map((ft) => {
          const system = getSystemLiters(ft.id);
          return (
            <div key={ft.id} className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
              <div className="flex justify-between items-baseline">
                <p className="font-bold text-gray-800">{ft.label}</p>
                <p className="text-sm text-gray-400">ระบบ: {fmt(system)} L</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">วัดถังจริง (ลิตร)</p>
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={actuals[ft.id] ?? ""}
                  onChange={(e) => setActuals((a) => ({ ...a, [ft.id]: e.target.value }))}
                  placeholder={fmt(system)}
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 text-xl font-mono text-center focus:outline-none focus:border-blue-500"
                />
              </div>
              {actuals[ft.id] !== undefined && actuals[ft.id] !== "" && (
                <div className={`text-sm font-bold text-center ${Number(actuals[ft.id]) - system < -20 ? "text-red-600" : Number(actuals[ft.id]) - system > 20 ? "text-yellow-600" : "text-green-600"}`}>
                  ส่วนต่าง: {(Number(actuals[ft.id]) - system) > 0 ? "+" : ""}{fmt(Number(actuals[ft.id]) - system)} L
                </div>
              )}
              <input
                type="text"
                value={notes[ft.id] ?? ""}
                onChange={(e) => setNotes((n) => ({ ...n, [ft.id]: e.target.value }))}
                placeholder="หมายเหตุ..."
                className="w-full border border-gray-100 rounded-lg px-3 py-2 text-sm text-gray-500 focus:outline-none focus:border-gray-300"
              />
            </div>
          );
        })}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{error}</div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gray-800 hover:bg-gray-900 disabled:opacity-50 text-white font-bold py-4 rounded-2xl text-xl transition-colors"
        >
          {loading ? "..." : "บันทึกวัดถัง"}
        </button>
      </form>
    </div>
  );
}
