"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type FuelType = { id: number; label: string; currentPrice: number };
type Sale = {
  id: number;
  sellerName: string;
  fuelTypeId: number;
  pumpNo: string;
  totalAmount: number;
  pricePerLiter: number;
  paymentMethod: string;
  customerName: string | null;
  note: string | null;
  version: number;
};

export default function EditSalePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [sale, setSale] = useState<Sale | null>(null);
  const [fuelTypes, setFuelTypes] = useState<FuelType[]>([]);
  const [actorName, setActorName] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);
  const [isCancelled, setIsCancelled] = useState(false);
  const [saving, setSaving] = useState(false);

  async function loadSale() {
    try {
      const res = await fetch(`/api/sales/${id}`, { cache: "no-store" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "เปิดรายการไม่ได้");
      }
      const data = await res.json();
      setSale(data);
      return data;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "โหลดข้อมูลไม่สำเร็จ");
      return null;
    }
  }

  useEffect(() => {
    Promise.all([
      loadSale(),
      fetch("/api/fuel-types", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])),
      fetch("/api/me", { cache: "no-store" }).then((r) => (r.ok ? (r.json() as Promise<{ name?: string }>) : null)),
    ]).then(([_, fuels, me]) => {
      if (fuels) setFuelTypes(fuels);
      if (me?.name) setActorName(me.name);
    });
  }, [id]);

  function update<K extends keyof Sale>(key: K, value: Sale[K]) {
    setSale((current) => (current ? { ...current, [key]: value } : current));
  }

  async function save() {
    if (!sale || !reason.trim()) return setError("กรุณาระบุเหตุผลที่แก้ไข");
    setSaving(true);
    setError("");
    setConflictNotice(null);

    try {
      const response = await fetch(`/api/sales/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...sale,
          expectedVersion: sale.version,
          reason,
        }),
      });

      const data = await response.json().catch(() => ({}));
      setSaving(false);

      if (!response.ok) {
        if (data.code === "SALE_CHANGED") {
          // Reload latest sale from server
          await loadSale();
          setConflictNotice(
            "⚠️ รายการขายนี้มีการเปลี่ยนแปลงจากผู้ใช้อื่น ข้อมูลในหน้าจอถูกรีเฟรชเป็นสถานะล่าสุดแล้ว กรุณาตรวจสอบก่อนกดยืนยันบันทึกอีกครั้ง"
          );
          return;
        }

        if (data.code === "SALE_CANCELLED") {
          setIsCancelled(true);
          setError("⚠️ รายการขายนี้ถูกยกเลิกไปแล้วโดยผู้ใช้อื่น");
          return;
        }

        if (data.code === "INSUFFICIENT_FUEL_STOCK") {
          // Preserve user proposed edit, do not alter or silently retry
          setError(data.error || "สต็อกน้ำมันไม่เพียงพอสำหรับการแก้ไขรายการขาย");
          return;
        }

        return setError(data.error || "แก้ไขไม่สำเร็จ");
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setSaving(false);
      setError("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    }
  }

  async function cancelSale() {
    if (!sale || !reason.trim()) return setError("กรุณาระบุเหตุผลที่ยกเลิก");
    if (!window.confirm("ยืนยันยกเลิกรายการนี้? สต็อกน้ำมันจะถูกคืนกลับ")) return;
    setSaving(true);
    setError("");
    setConflictNotice(null);

    try {
      const response = await fetch(`/api/sales/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: sale.version,
          reason,
        }),
      });

      const data = await response.json().catch(() => ({}));
      setSaving(false);

      if (!response.ok) {
        if (data.code === "SALE_CANCELLED" || response.status === 404) {
          setIsCancelled(true);
          return setError("⚠️ รายการขายนี้ไม่มีอยู่แล้ว หรืออาจถูกยกเลิกเรียบร้อยแล้ว");
        }

        if (data.code === "SALE_CHANGED") {
          await loadSale();
          setConflictNotice(
            "⚠️ รายการขายนี้มีการเปลี่ยนแปลงจากผู้ใช้อื่น ข้อมูลถูกรีเฟรชเป็นสถานะล่าสุดแล้ว กรุณาตรวจสอบก่อนยกเลิกอีกครั้ง"
          );
          return;
        }

        return setError(data.error || "ยกเลิกไม่สำเร็จ");
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setSaving(false);
      setError("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    }
  }

  if (!sale) {
    return (
      <main className="grid min-h-dvh place-items-center bg-slate-50 p-6">
        <div className="text-center">
          <p>{error || "กำลังโหลด…"}</p>
          <Link href="/dashboard" className="mt-4 inline-block text-blue-600">
            กลับหน้าหลัก
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-slate-50 px-4 py-8 text-slate-950">
      <div className="mx-auto max-w-2xl">
        <Link href="/dashboard" className="text-sm font-bold text-blue-600">
          ← กลับหน้าหลัก
        </Link>
        <h1 className="mt-5 text-2xl font-black">แก้ไขรายการขาย #{sale.id}</h1>
        <p className="mt-1 text-sm text-slate-500">
          ขายโดย {sale.sellerName} · แก้ไขโดย {actorName || "บัญชีปัจจุบัน"}
        </p>

        {conflictNotice && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm" role="alert">
            <p className="font-bold">แจ้งเตือนการเปลี่ยนแปลง</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-800">{conflictNotice}</p>
          </div>
        )}

        {isCancelled && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 shadow-sm" role="alert">
            <p className="font-bold">รายการถูกยกเลิกแล้ว</p>
            <p className="mt-1 text-xs leading-relaxed text-red-800">
              รายการขายนี้ถูกยกเลิกแล้ว ไม่สามารถแก้ไขได้อีก
            </p>
            <Link href="/dashboard" className="mt-3 inline-block font-bold text-blue-600 hover:underline">
              กลับหน้าหลัก
            </Link>
          </div>
        )}

        <div className="mt-6 space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <label className="block text-sm font-bold">
            ประเภทน้ำมัน
            <select
              disabled={isCancelled}
              value={sale.fuelTypeId}
              onChange={(event) => {
                const fuelTypeId = Number(event.target.value);
                const fuel = fuelTypes.find((item) => item.id === fuelTypeId);
                setSale((current) =>
                  current
                    ? {
                        ...current,
                        fuelTypeId,
                        pricePerLiter: fuel?.currentPrice || current.pricePerLiter,
                      }
                    : current
                );
              }}
              className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 px-3 disabled:bg-slate-100"
            >
              {fuelTypes.map((fuel) => (
                <option key={fuel.id} value={fuel.id}>
                  {fuel.label}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-bold">
              ยอดเงิน
              <input
                disabled={isCancelled}
                type="number"
                min="0.01"
                step="0.01"
                value={sale.totalAmount}
                onChange={(event) => update("totalAmount", Number(event.target.value))}
                className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 px-3 disabled:bg-slate-100"
              />
            </label>
            <label className="text-sm font-bold">
              ราคาต่อลิตร
              <input
                disabled={isCancelled}
                type="number"
                min="0.01"
                step="0.01"
                value={sale.pricePerLiter}
                onChange={(event) => update("pricePerLiter", Number(event.target.value))}
                className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 px-3 disabled:bg-slate-100"
              />
            </label>
            <label className="text-sm font-bold">
              หัวจ่าย
              <input
                disabled={isCancelled}
                value={sale.pumpNo}
                onChange={(event) => update("pumpNo", event.target.value)}
                className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 px-3 disabled:bg-slate-100"
              />
            </label>
            <label className="text-sm font-bold">
              วิธีชำระ
              <select
                disabled={isCancelled}
                value={sale.paymentMethod}
                onChange={(event) => update("paymentMethod", event.target.value)}
                className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 px-3 disabled:bg-slate-100"
              >
                <option value="cash">เงินสด</option>
                <option value="transfer">โอน</option>
                <option value="credit">เครดิต</option>
                <option value="qr">QR</option>
              </select>
            </label>
          </div>

          <label className="block text-sm font-bold">
            ลูกค้า (ถ้ามี)
            <input
              disabled={isCancelled}
              value={sale.customerName || ""}
              onChange={(event) => update("customerName", event.target.value)}
              className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 px-3 disabled:bg-slate-100"
            />
          </label>
          <label className="block text-sm font-bold">
            หมายเหตุ
            <input
              disabled={isCancelled}
              value={sale.note || ""}
              onChange={(event) => update("note", event.target.value)}
              className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 px-3 disabled:bg-slate-100"
            />
          </label>
          <label className="block text-sm font-bold">
            เหตุผลที่แก้ไข/ยกเลิก <span className="text-red-500">*</span>
            <textarea
              disabled={isCancelled}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              placeholder="เช่น กรอกยอดเงินผิด"
              className="mt-2 w-full rounded-xl border border-slate-200 p-3 disabled:bg-slate-100"
            />
          </label>

          {error && (
            <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
              {error}
            </p>
          )}

          {!isCancelled && (
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <button
                type="button"
                disabled={saving}
                onClick={cancelSale}
                className="min-h-12 rounded-xl border border-red-200 px-5 font-bold text-red-600 disabled:opacity-50"
              >
                ยกเลิกรายการและคืนสต็อก
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={save}
                className="min-h-12 rounded-xl bg-blue-600 px-6 font-bold text-white disabled:opacity-50"
              >
                {saving ? "กำลังบันทึก…" : "บันทึกการแก้ไข"}
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
