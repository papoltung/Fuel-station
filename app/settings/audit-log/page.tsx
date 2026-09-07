"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Snapshot = { totalAmount?: number; liters?: number; fuelTypeId?: number; pumpNo?: string; paymentMethod?: string; sellerName?: string };
type AuditRow = { id: number; saleId: number; action: "create" | "update" | "cancel"; actorName: string; actorEmail: string; beforeData: Snapshot | null; afterData: Snapshot | null; reason: string | null; createdAt: string };
type FuelType = { id: number; label: string };

const ACTION = {
  create: { label: "สร้างรายการ", style: "bg-emerald-50 text-emerald-700" },
  update: { label: "แก้ไข", style: "bg-amber-50 text-amber-700" },
  cancel: { label: "ยกเลิก", style: "bg-red-50 text-red-700" },
};
const PAYMENT: Record<string, string> = { cash: "เงินสด", transfer: "โอน", credit: "เครดิต", qr: "QR" };
const money = (value?: number) => Number(value ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function AuditLogPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [fuels, setFuels] = useState<FuelType[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([fetch("/api/audit-log", { cache: "no-store" }), fetch("/api/fuel-types", { cache: "no-store" })])
      .then(async ([auditResponse, fuelResponse]) => {
        if (!auditResponse.ok) throw new Error((await auditResponse.json()).error || "เปิดประวัติไม่ได้");
        setRows(await auditResponse.json());
        if (fuelResponse.ok) setFuels(await fuelResponse.json());
      }).catch((cause) => setError(cause instanceof Error ? cause.message : "โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => filter === "all" ? rows : rows.filter((row) => row.action === filter), [filter, rows]);
  const fuelName = (id?: number) => fuels.find((fuel) => fuel.id === id)?.label || (id ? `น้ำมัน #${id}` : "-");

  function details(row: AuditRow) {
    const before = row.beforeData;
    const after = row.afterData;
    if (row.action === "create" && after) return `${fuelName(after.fuelTypeId)} · ฿${money(after.totalAmount)} · ${after.pumpNo || "-"} · ${PAYMENT[after.paymentMethod || ""] || after.paymentMethod || "-"}`;
    if (row.action === "cancel" && before) return `${fuelName(before.fuelTypeId)} · ฿${money(before.totalAmount)} · ${before.pumpNo || "-"}`;
    if (before && after) {
      const changes: string[] = [];
      if (before.totalAmount !== after.totalAmount) changes.push(`ยอด ฿${money(before.totalAmount)} → ฿${money(after.totalAmount)}`);
      if (before.fuelTypeId !== after.fuelTypeId) changes.push(`${fuelName(before.fuelTypeId)} → ${fuelName(after.fuelTypeId)}`);
      if (before.pumpNo !== after.pumpNo) changes.push(`หัวจ่าย ${before.pumpNo} → ${after.pumpNo}`);
      if (before.paymentMethod !== after.paymentMethod) changes.push(`${PAYMENT[before.paymentMethod || ""] || before.paymentMethod} → ${PAYMENT[after.paymentMethod || ""] || after.paymentMethod}`);
      return changes.join(" · ") || "บันทึกข้อมูลรายการใหม่";
    }
    return "-";
  }

  return <main className="min-h-dvh bg-slate-50 px-4 py-6 text-slate-950 sm:px-6">
    <div className="mx-auto max-w-6xl">
      <Link href="/settings" className="inline-flex min-h-11 items-center font-bold text-blue-600">← กลับหน้าตั้งค่า</Link>
      <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><h1 className="text-3xl font-black">ประวัติการทำรายการ</h1><p className="mt-1 text-sm text-slate-500">ตรวจสอบว่าใครสร้าง แก้ไข หรือยกเลิกรายการขาย เมื่อไร และเพราะอะไร</p></div>
        <label className="text-sm font-bold">แสดงรายการ<select value={filter} onChange={(event) => setFilter(event.target.value)} className="ml-2 min-h-11 rounded-xl border border-slate-200 bg-white px-3"><option value="all">ทั้งหมด</option><option value="create">สร้างรายการ</option><option value="update">แก้ไข</option><option value="cancel">ยกเลิก</option></select></label>
      </div>
      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-live="polite">
        {loading ? <p className="p-8 text-center text-slate-500">กำลังโหลด…</p> : error ? <p role="alert" className="p-8 text-center font-semibold text-red-600">{error}</p> : visible.length === 0 ? <p className="p-8 text-center text-slate-500">ยังไม่มีประวัติ</p> : <div className="divide-y divide-slate-100">{visible.map((row) => {
          const action = ACTION[row.action];
          return <article key={row.id} className="grid gap-3 p-4 sm:grid-cols-[9rem_8rem_1fr] sm:p-5">
            <div><time className="text-sm font-semibold">{new Date(row.createdAt).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</time><p className="mt-1 text-xs text-slate-400">รายการ #{row.saleId}</p></div>
            <div><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${action.style}`}>{action.label}</span></div>
            <div><p className="font-bold">{row.actorName}</p><p className="text-xs text-slate-400">{row.actorEmail}</p><p className="mt-2 text-sm text-slate-700">{details(row)}</p>{row.reason && <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"><strong>เหตุผล:</strong> {row.reason}</p>}</div>
          </article>;
        })}</div>}
      </section>
      <p className="mt-3 text-xs text-slate-400">หน้านี้เปิดได้เฉพาะเจ้าของและผู้จัดการ แสดงล่าสุดไม่เกิน 200 เหตุการณ์</p>
    </div>
  </main>;
}
