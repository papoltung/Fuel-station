"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type FuelType = { id: number; label: string; currentPrice: number };
type Sale = { id: number; sellerName: string; fuelTypeId: number; pumpNo: string; totalAmount: number; pricePerLiter: number; paymentMethod: string; customerName: string | null; note: string | null };

export default function EditSalePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [sale, setSale] = useState<Sale | null>(null);
  const [fuelTypes, setFuelTypes] = useState<FuelType[]>([]);
  const [actorName, setActorName] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/sales/${id}`, { cache: "no-store" }),
      fetch("/api/fuel-types", { cache: "no-store" }),
      fetch("/api/me", { cache: "no-store" }),
    ]).then(async ([saleResponse, fuelsResponse, meResponse]) => {
      if (!saleResponse.ok) throw new Error((await saleResponse.json()).error || "เปิดรายการไม่ได้");
      setSale(await saleResponse.json());
      if (fuelsResponse.ok) setFuelTypes(await fuelsResponse.json());
      if (meResponse.ok) setActorName((await meResponse.json()).name || "");
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "โหลดข้อมูลไม่สำเร็จ"));
  }, [id]);

  function update<K extends keyof Sale>(key: K, value: Sale[K]) {
    setSale((current) => current ? { ...current, [key]: value } : current);
  }

  async function save() {
    if (!sale || !reason.trim()) return setError("กรุณาระบุเหตุผลที่แก้ไข");
    setSaving(true); setError("");
    const response = await fetch(`/api/sales/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...sale, reason }) });
    const data = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) return setError(data.error || "แก้ไขไม่สำเร็จ");
    router.push("/dashboard"); router.refresh();
  }

  async function cancelSale() {
    if (!reason.trim()) return setError("กรุณาระบุเหตุผลที่ยกเลิก");
    if (!window.confirm("ยืนยันยกเลิกรายการนี้? สต็อกน้ำมันจะถูกคืนกลับ")) return;
    setSaving(true); setError("");
    const response = await fetch(`/api/sales/${id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
    const data = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) return setError(data.error || "ยกเลิกไม่สำเร็จ");
    router.push("/dashboard"); router.refresh();
  }

  if (!sale) return <main className="grid min-h-dvh place-items-center bg-slate-50 p-6"><div className="text-center"><p>{error || "กำลังโหลด…"}</p><Link href="/dashboard" className="mt-4 inline-block text-blue-600">กลับหน้าหลัก</Link></div></main>;

  return <main className="min-h-dvh bg-slate-50 px-4 py-8 text-slate-950">
    <div className="mx-auto max-w-2xl">
      <Link href="/dashboard" className="text-sm font-bold text-blue-600">← กลับหน้าหลัก</Link>
      <h1 className="mt-5 text-2xl font-black">แก้ไขรายการขาย #{sale.id}</h1>
      <p className="mt-1 text-sm text-slate-500">ขายโดย {sale.sellerName} · แก้ไขโดย {actorName || "บัญชีปัจจุบัน"}</p>
      <div className="mt-6 space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <label className="block text-sm font-bold">ประเภทน้ำมัน<select value={sale.fuelTypeId} onChange={(event) => { const fuelTypeId = Number(event.target.value); const fuel = fuelTypes.find((item) => item.id === fuelTypeId); setSale((current) => current ? { ...current, fuelTypeId, pricePerLiter: fuel?.currentPrice || current.pricePerLiter } : current); }} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 px-3">{fuelTypes.map((fuel) => <option key={fuel.id} value={fuel.id}>{fuel.label}</option>)}</select></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold">ยอดเงิน<input type="number" min="0.01" step="0.01" value={sale.totalAmount} onChange={(event) => update("totalAmount", Number(event.target.value))} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 px-3" /></label>
          <label className="text-sm font-bold">ราคาต่อลิตร<input type="number" min="0.01" step="0.01" value={sale.pricePerLiter} onChange={(event) => update("pricePerLiter", Number(event.target.value))} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 px-3" /></label>
          <label className="text-sm font-bold">หัวจ่าย<input value={sale.pumpNo} onChange={(event) => update("pumpNo", event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 px-3" /></label>
          <label className="text-sm font-bold">วิธีชำระ<select value={sale.paymentMethod} onChange={(event) => update("paymentMethod", event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 px-3"><option value="cash">เงินสด</option><option value="transfer">โอน</option><option value="credit">เครดิต</option><option value="qr">QR</option></select></label>
        </div>
        <label className="block text-sm font-bold">ลูกค้า (ถ้ามี)<input value={sale.customerName || ""} onChange={(event) => update("customerName", event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 px-3" /></label>
        <label className="block text-sm font-bold">หมายเหตุ<input value={sale.note || ""} onChange={(event) => update("note", event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 px-3" /></label>
        <label className="block text-sm font-bold">เหตุผลที่แก้ไข/ยกเลิก <span className="text-red-500">*</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} placeholder="เช่น กรอกยอดเงินผิด" className="mt-2 w-full rounded-xl border border-slate-200 p-3" /></label>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><button type="button" disabled={saving} onClick={cancelSale} className="min-h-12 rounded-xl border border-red-200 px-5 font-bold text-red-600 disabled:opacity-50">ยกเลิกรายการและคืนสต็อก</button><button type="button" disabled={saving} onClick={save} className="min-h-12 rounded-xl bg-blue-600 px-6 font-bold text-white disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึกการแก้ไข"}</button></div>
      </div>
    </div>
  </main>;
}
