"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type FuelType = { id: number; name: string; label: string; currentPrice: number };

export default function SettingsPage() {
  const router = useRouter();
  const [fuelTypes, setFuelTypes] = useState<FuelType[]>([]);
  const [prices, setPrices] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [saved, setSaved] = useState<Record<number, boolean>>({});
  const [deleting, setDeleting] = useState<Record<number, boolean>>({});

  function loadFuelTypes() {
    fetch("/api/fuel-types")
      .then((r) => r.json())
      .then((data: FuelType[]) => {
        setFuelTypes(data);
        const p: Record<number, string> = {};
        data.forEach((ft) => { p[ft.id] = ft.currentPrice > 0 ? String(ft.currentPrice) : ""; });
        setPrices(p);
      });
  }

  useEffect(() => { loadFuelTypes(); }, []);

  async function deleteFuelType(ft: FuelType) {
    if (!confirm(`ลบ "${ft.label}" ออกจากระบบ?\nทำได้เฉพาะถ้าไม่มียอดขาย/รับน้ำมัน`)) return;
    setDeleting((d) => ({ ...d, [ft.id]: true }));
    const res = await fetch(`/api/fuel-types/${ft.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) alert(data.error ?? "ลบไม่สำเร็จ");
    else loadFuelTypes();
    setDeleting((d) => ({ ...d, [ft.id]: false }));
  }

  async function savePrice(id: number) {
    setSaving((s) => ({ ...s, [id]: true }));
    await fetch(`/api/fuel-types/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPrice: Number(prices[id]) }),
    });
    setSaving((s) => ({ ...s, [id]: false }));
    setSaved((s) => ({ ...s, [id]: true }));
    setTimeout(() => setSaved((s) => ({ ...s, [id]: false })), 2000);
  }

  return (
    <>
    <div className="min-h-screen bg-slate-100">
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.push("/dashboard")} className="text-gray-500 text-xl w-8">←</button>
        <h1 className="text-base font-bold text-gray-900">ตั้งราคาน้ำมัน</h1>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-3">
        <p className="text-xs text-gray-400 px-1">ราคาที่ตั้งไว้จะ auto-fill ในฟอร์มบันทึกขาย</p>
        {fuelTypes.map((ft) => (
          <div key={ft.id} className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex justify-between items-center mb-3">
              <p className="text-base font-bold text-gray-800">{ft.label}</p>
              <button
                onClick={() => deleteFuelType(ft)}
                disabled={deleting[ft.id]}
                className="text-red-400 text-xs px-2 py-1 rounded-lg hover:bg-red-50 disabled:opacity-40"
              >
                {deleting[ft.id] ? "..." : "ลบ"}
              </button>
            </div>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={prices[ft.id] ?? ""}
                onChange={(e) => setPrices((p) => ({ ...p, [ft.id]: e.target.value }))}
                placeholder="0.00"
                className="flex-1 border-2 border-gray-200 rounded-xl px-4 py-3 text-2xl font-bold text-center focus:outline-none focus:border-blue-500"
              />
              <span className="text-sm text-gray-400 flex-shrink-0">บ/ล</span>
              <button
                onClick={() => savePrice(ft.id)}
                disabled={saving[ft.id] || !prices[ft.id]}
                className={`flex-shrink-0 px-5 py-3 rounded-xl text-sm font-bold transition-colors ${
                  saved[ft.id]
                    ? "bg-green-100 text-green-700"
                    : "bg-blue-600 text-white disabled:opacity-40"
                }`}
              >
                {saving[ft.id] ? "..." : saved[ft.id] ? "✓" : "บันทึก"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
    </>
  );
}
