"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { browserSaleQueue, syncPendingSales, type PendingSale } from "@/lib/sale-queue";

type FuelType = { id: number; name: string; label: string; currentPrice: number };
type Payment = "cash" | "qr" | "transfer";
type QueueStatus = { queued: number; needsReview: number };

const PRESETS = [50, 100, 200, 300, 500, 1000];
const PAYMENTS: Array<{ value: Payment; label: string; icon: string }> = [
  { value: "cash", label: "เงินสด", icon: "฿" },
  { value: "qr", label: "QR", icon: "▦" },
  { value: "transfer", label: "โอน", icon: "⇄" },
];

function fmt(value: number, digits = 0) {
  return value.toLocaleString("th-TH", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function localDateKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function QuickPage() {
  const [fuelTypes, setFuelTypes] = useState<FuelType[]>([]);
  const [fuelId, setFuelId] = useState("");
  const [payment, setPayment] = useState<Payment>("cash");
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [todayRevenue, setTodayRevenue] = useState<number | null>(null);
  const [queueStatus, setQueueStatus] = useState<QueueStatus>({ queued: 0, needsReview: 0 });
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);
  const syncAgainRef = useRef(false);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [today] = useState(localDateKey);

  async function loadSummary() {
    const response = await fetch(`/api/sales/summary?date=${today}`);
    if (!response.ok) return;
    const data = await response.json();
    setTodayRevenue(Number(data.totalRevenue) || 0);
  }

  async function syncQueue() {
    if (syncingRef.current) {
      syncAgainRef.current = true;
      return;
    }
    syncingRef.current = true;
    setSyncing(true);
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
      setQueueStatus({ queued: result.queued, needsReview: result.needsReview });
      if (result.synced) await loadSummary();
    } catch {
      const items = await browserSaleQueue.list().catch(() => []);
      setQueueStatus({
        queued: items.filter((item) => item.status !== "needs-review").length,
        needsReview: items.filter((item) => item.status === "needs-review").length,
      });
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      if (syncAgainRef.current) {
        syncAgainRef.current = false;
        void syncQueue();
      }
    }
  }

  useEffect(() => {
    const savedPayment = localStorage.getItem("quick_payment") as Payment | null;
    if (savedPayment && PAYMENTS.some((item) => item.value === savedPayment)) queueMicrotask(() => setPayment(savedPayment));
    fetch("/api/fuel-types")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: FuelType[]) => {
        setFuelTypes(data);
        const savedId = localStorage.getItem("quick_fuelId");
        setFuelId(savedId && data.some((fuel) => String(fuel.id) === savedId) ? savedId : String(data[0]?.id ?? ""));
      })
      .catch(() => setFuelTypes([]));
    queueMicrotask(() => {
      void loadSummary();
      void syncQueue();
    });
    const handleOnline = () => void syncQueue();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
    // Stable for the lifetime of this page; online retries use the same IndexedDB queue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  const fuel = fuelTypes.find((item) => String(item.id) === fuelId);
  const liters = fuel && fuel.currentPrice > 0 ? amount / fuel.currentPrice : 0;

  function resetForm() {
    setAmount(0);
    setNote("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fuel || amount <= 0 || fuel.currentPrice <= 0) return;
    const now = new Date();
    const clientRequestId = crypto.randomUUID();
    const item: PendingSale = {
      id: clientRequestId,
      createdAt: now.toISOString(),
      status: "queued",
      attempts: 0,
      payload: {
        clientRequestId,
        date: `${localDateKey()}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
        sellerName: localStorage.getItem("fuel_last_seller") ?? "N",
        fuelTypeId: fuelId,
        pumpNo: "หัวจ่าย 1",
        totalAmount: String(amount),
        pricePerLiter: String(fuel.currentPrice),
        paymentMethod: payment,
        customerName: "",
        note,
      },
    };
    setSaving(true);
    try {
      await browserSaleQueue.put(item);
      setQueueStatus((current) => ({ ...current, queued: current.queued + 1 }));
      setMessage(`เก็บรายการ ${fmt(amount)} บาทแล้ว`);
      resetForm();
      if (messageTimer.current) clearTimeout(messageTimer.current);
      messageTimer.current = setTimeout(() => setMessage(""), 2200);
      void syncQueue();
    } catch {
      setMessage("เก็บรายการไม่สำเร็จ ยอดเงินยังอยู่ กรุณาลองอีกครั้ง");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="quick-sale min-h-dvh bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <Link href="/dashboard" className="grid min-h-12 min-w-12 place-items-center rounded-xl text-2xl" aria-label="กลับหน้าหลัก">←</Link>
          <div className="text-center">
            <h1 className="text-lg font-extrabold">บันทึกการขาย</h1>
            <p className="text-xs text-slate-500">เลือกน้ำมัน → จำนวนเงิน → ชำระเงิน</p>
          </div>
          <button type="button" onClick={resetForm} className="min-h-12 min-w-12 rounded-xl text-sm font-semibold text-blue-600">ล้าง</button>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 pb-32 pt-5">
        {(queueStatus.queued > 0 || queueStatus.needsReview > 0 || syncing) && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900" role="status">
            <span className="font-semibold">{syncing ? "กำลังส่งข้อมูล…" : queueStatus.needsReview ? `ต้องตรวจ ${queueStatus.needsReview} รายการ` : `รอส่ง ${queueStatus.queued} รายการ`}</span>
            {!syncing && queueStatus.queued > 0 && <button type="button" className="min-h-12 font-bold text-blue-700" onClick={() => void syncQueue()}>ส่งอีกครั้ง</button>}
          </div>
        )}

        <form onSubmit={save} className="space-y-6">
          <fieldset>
            <legend className="mb-3 text-base font-extrabold">เลือกประเภทน้ำมัน</legend>
            {fuelTypes.length === 0 ? <div className="h-24 animate-pulse rounded-xl bg-slate-200" aria-label="กำลังโหลดชนิดน้ำมัน" /> : (
              <div className="grid grid-cols-4 gap-2">
                {fuelTypes.map((item, index) => {
                  const selected = fuelId === String(item.id);
                  const selectedColors = ["border-emerald-500 bg-emerald-500", "border-blue-600 bg-blue-600", "border-orange-500 bg-orange-500", "border-slate-700 bg-slate-700"];
                  return <label key={item.id} className={`grid min-h-24 cursor-pointer place-items-center rounded-xl border-2 p-2 text-center transition ${selected ? `${selectedColors[index % 4]} text-white shadow-sm` : "border-slate-200 bg-white text-slate-700"}`}>
                    <input className="sr-only" type="radio" name="fuel" value={item.id} checked={selected} onChange={() => { setFuelId(String(item.id)); localStorage.setItem("quick_fuelId", String(item.id)); }} />
                    <span aria-hidden="true" className="text-xl">⛽</span>
                    <span className="text-sm font-extrabold leading-tight">{item.label}</span>
                    <span className={`text-[11px] ${selected ? "text-white/80" : "text-slate-500"}`}>{fmt(item.currentPrice, 2)} ฿/L</span>
                  </label>;
                })}
              </div>
            )}
          </fieldset>

          <fieldset>
            <legend className="mb-3 text-base font-extrabold">จำนวนเงิน</legend>
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map((preset) => <button key={preset} type="button" onClick={() => setAmount(preset)} aria-pressed={amount === preset} className={`min-h-14 rounded-xl border text-lg font-extrabold transition active:scale-[.98] ${amount === preset ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-slate-100 text-slate-900"}`}>{fmt(preset)}</button>)}
            </div>
            <label htmlFor="sale-amount" className="sr-only">จำนวนเงินที่ต้องการ</label>
            <div className="mt-3 flex min-h-20 items-center rounded-xl border-2 border-slate-200 bg-white px-4 focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-100">
              <span className="text-2xl font-bold">฿</span>
              <input id="sale-amount" name="amount" inputMode="decimal" value={amount || ""} onChange={(event) => setAmount(Math.max(0, Number(event.target.value) || 0))} placeholder="0.00" className="min-w-0 flex-1 bg-transparent px-3 text-4xl font-extrabold outline-none placeholder:text-slate-300" />
              {amount > 0 && <button type="button" onClick={() => setAmount(0)} className="min-h-12 min-w-12 rounded-full text-slate-400" aria-label="ล้างจำนวนเงิน">×</button>}
            </div>
            {liters > 0 && <p className="mt-2 text-sm text-slate-500">ประมาณ {fmt(liters, 2)} ลิตร · {fmt(fuel?.currentPrice ?? 0, 2)} บาท/ลิตร</p>}
          </fieldset>

          <fieldset>
            <legend className="mb-3 text-base font-extrabold">วิธีการชำระเงิน</legend>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENTS.map((item) => <label key={item.value} className={`grid min-h-20 cursor-pointer place-items-center rounded-xl border-2 p-2 text-center ${payment === item.value ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700"}`}>
                <input className="sr-only" type="radio" name="payment" value={item.value} checked={payment === item.value} onChange={() => { setPayment(item.value); localStorage.setItem("quick_payment", item.value); }} />
                <span className="text-xl font-black" aria-hidden="true">{item.icon}</span><span className="text-sm font-bold">{item.label}</span>
              </label>)}
            </div>
          </fieldset>

          <div>
            <label htmlFor="sale-note" className="mb-2 block text-base font-extrabold">หมายเหตุ <span className="font-normal text-slate-400">(ถ้ามี)</span></label>
            <textarea id="sale-note" name="note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={100} rows={2} placeholder="เช่น ทะเบียนรถ, ลูกค้าองค์กร" className="w-full resize-y rounded-xl border-2 border-slate-200 bg-white p-3 text-base outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
          </div>

          <button type="submit" disabled={saving || !fuel || amount <= 0} className="min-h-16 w-full rounded-xl bg-blue-600 px-5 text-lg font-extrabold text-white shadow-sm transition hover:bg-blue-700 active:scale-[.99] disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none">
            {saving ? "กำลังเก็บลงเครื่อง…" : amount > 0 ? `บันทึกการขาย ฿${fmt(amount)}` : "เลือกจำนวนเงินก่อน"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-400">ยอดขายวันนี้ {todayRevenue === null ? "กำลังโหลด…" : `฿${fmt(todayRevenue)}`}</p>
        <div className="sr-only" aria-live="polite">{message}</div>
        {message && <div className="fixed inset-x-4 bottom-24 z-30 mx-auto max-w-sm rounded-xl bg-slate-900 px-4 py-3 text-center text-sm font-bold text-white shadow-lg">✓ {message}</div>}
      </main>

      <nav aria-label="เมนูหลัก" className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {[{ href: "/dashboard", icon: "⌂", label: "หน้าหลัก" }, { href: "/quick", icon: "⛽", label: "ขาย" }, { href: "/stock", icon: "▣", label: "สต็อก" }, { href: "/dashboard", icon: "▥", label: "รายงาน" }, { href: "/settings", icon: "⚙", label: "ตั้งค่า" }].map((item) => <Link key={`${item.href}-${item.label}`} href={item.href} aria-current={item.label === "ขาย" ? "page" : undefined} className={`grid min-h-16 place-items-center content-center gap-0.5 text-xs font-semibold ${item.label === "ขาย" ? "text-blue-600" : "text-slate-500"}`}><span className="text-xl" aria-hidden="true">{item.icon}</span>{item.label}</Link>)}
        </div>
      </nav>
    </div>
  );
}
