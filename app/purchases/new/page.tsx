"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type FuelType = { id: number; name: string; label: string };

export default function NewPurchasePage() {
  const router = useRouter();
  const [fuelTypes, setFuelTypes] = useState<FuelType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({
    date: today,
    fuelTypeId: "",
    liters: "",
    costPerLiter: "",
    invoiceNo: "",
    supplier: "",
    note: "",
  });

  useEffect(() => {
    fetch("/api/fuel-types")
      .then((r) => r.json())
      .then((data: FuelType[]) => {
        setFuelTypes(data);
        if (data.length > 0) setForm((f) => ({ ...f, fuelTypeId: String(data[0].id) }));
      });
  }, []);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setError("");
  }

  const totalCost = Number(form.liters) * Number(form.costPerLiter);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.fuelTypeId) return setError("เลือกชนิดน้ำมัน");
    if (!form.liters || Number(form.liters) <= 0) return setError("กรอกจำนวนลิตร");
    if (!form.costPerLiter || Number(form.costPerLiter) <= 0) return setError("กรอกราคาทุนต่อลิตร");

    setLoading(true);
    try {
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "บันทึกไม่สำเร็จ");
      setSuccess(true);
      setTimeout(() => router.push("/stock"), 1500);
    } catch {
      setError("เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="text-6xl">✓</div>
          <p className="text-xl font-bold text-green-700">รับน้ำมันเข้าแล้ว</p>
          <p className="text-gray-400 text-sm">+{Number(form.liters).toLocaleString("th-TH")} ลิตร</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.push("/stock")} className="text-gray-500 text-xl w-8">←</button>
        <h1 className="text-base font-bold text-gray-800">รับน้ำมันเข้า</h1>
      </div>

      <form onSubmit={handleSubmit} className="max-w-lg mx-auto p-4 space-y-4">

        {/* ชนิดน้ำมัน */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">ชนิดน้ำมัน</p>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(fuelTypes.length, 4)}, 1fr)` }}>
            {fuelTypes.map((ft) => (
              <button
                key={ft.id}
                type="button"
                onClick={() => set("fuelTypeId", String(ft.id))}
                className={`py-3 rounded-xl font-bold text-sm transition-all ${
                  form.fuelTypeId === String(ft.id)
                    ? "bg-amber-500 text-white shadow-md"
                    : "bg-white text-gray-700 border-2 border-gray-200"
                }`}
              >
                {ft.label}
              </button>
            ))}
          </div>
        </div>

        {/* จำนวนลิตร */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">จำนวนลิตร</p>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            value={form.liters}
            onChange={(e) => set("liters", e.target.value)}
            placeholder="0"
            className="w-full border-2 border-gray-200 rounded-2xl px-4 py-4 text-3xl font-bold text-center focus:outline-none focus:border-amber-500"
            required
          />
        </div>

        {/* ราคาทุน */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">ราคาทุนต่อลิตร (บาท)</p>
          <input
            type="number"
            step="0.01"
            inputMode="decimal"
            value={form.costPerLiter}
            onChange={(e) => set("costPerLiter", e.target.value)}
            placeholder="0.00"
            className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 text-lg font-mono focus:outline-none focus:border-amber-500"
            required
          />
        </div>

        {/* ต้นทุนรวม */}
        {totalCost > 0 && (
          <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 flex justify-between items-center">
            <span className="text-sm text-amber-700">ต้นทุนรวม</span>
            <span className="text-xl font-bold text-amber-700">
              {totalCost.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท
            </span>
          </div>
        )}

        {/* เลขที่บิล + ผู้ส่ง */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">เลขที่บิล</p>
            <input
              type="text"
              value={form.invoiceNo}
              onChange={(e) => set("invoiceNo", e.target.value)}
              placeholder="INV-001"
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">ผู้ส่ง</p>
            <input
              type="text"
              value={form.supplier}
              onChange={(e) => set("supplier", e.target.value)}
              placeholder="บริษัทน้ำมัน"
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {/* วันที่ */}
        <details className="text-sm">
          <summary className="text-gray-400 cursor-pointer select-none">วันที่: {form.date}</summary>
          <input
            type="date"
            value={form.date}
            onChange={(e) => set("date", e.target.value)}
            className="mt-2 w-full border-2 border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500"
          />
        </details>

        {/* หมายเหตุ */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">หมายเหตุ</p>
          <input
            type="text"
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
            placeholder="หมายเหตุ (ถ้ามี)"
            className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{error}</div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold py-4 rounded-2xl text-xl transition-colors"
        >
          {loading ? "..." : "รับน้ำมันเข้า"}
        </button>
      </form>
    </div>
  );
}
