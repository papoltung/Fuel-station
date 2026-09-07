"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type FuelType = {
  id: number;
  name: string;
  label: string;
};

function displayDate() {
  return new Date().toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmt(n: number) {
  return Number(n || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const FUEL_COLOR: Record<string, string> = {
  diesel: "bg-amber-400",
  benzin95: "bg-blue-500",
  benzin91: "bg-emerald-500",
  e20: "bg-violet-500",
};

const FUEL_BG: Record<string, string> = {
  diesel: "bg-amber-50 text-amber-700",
  benzin95: "bg-blue-50 text-blue-700",
  benzin91: "bg-emerald-50 text-emerald-700",
  e20: "bg-violet-50 text-violet-700",
};

export default function NewPurchasePage() {
  const router = useRouter();
  const pathname = usePathname();

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
    isPaid: true,
    paidNote: "",
  });

  useEffect(() => {
    fetch("/api/fuel-types")
      .then((r) => r.json())
      .then((data: FuelType[]) => {
        setFuelTypes(data ?? []);
        if (data.length > 0) {
          setForm((f) => ({
            ...f,
            fuelTypeId: String(data[0].id),
          }));
        }
      })
      .catch(() => setError("โหลดข้อมูลน้ำมันไม่สำเร็จ"));
  }, []);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setError("");
  }

  const selectedFuel = fuelTypes.find(
    (ft) => String(ft.id) === form.fuelTypeId
  );

  const totalCost = Number(form.liters) * Number(form.costPerLiter);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!form.fuelTypeId) return setError("เลือกชนิดน้ำมัน");
    if (!form.liters || Number(form.liters) <= 0)
      return setError("กรอกจำนวนลิตร");
    if (!form.costPerLiter || Number(form.costPerLiter) <= 0)
      return setError("กรอกราคาทุนต่อลิตร");

    setLoading(true);

    try {
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "บันทึกไม่สำเร็จ");
        return;
      }

      setSuccess(true);
    } catch {
      setError("เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <main className="min-h-screen bg-[#eef4fb] text-slate-900">
        <div className="mx-auto min-h-screen w-full max-w-[480px] bg-[#f8fbff] shadow-[0_0_45px_rgba(15,23,42,0.08)] md:my-5 md:min-h-[calc(100vh-40px)] md:rounded-[34px] md:overflow-hidden">
          <AppHeader onBack={() => router.push("/stock")} />

          <section className="flex min-h-[68vh] items-center justify-center px-5">
            <div className="w-full rounded-[30px] border border-emerald-100 bg-white p-7 text-center shadow-sm">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-4xl text-emerald-600">
                ✓
              </div>

              <p className="mt-5 text-sm text-slate-400">
                รับน้ำมันเข้าเรียบร้อย
              </p>

              <h1 className="mt-2 text-3xl font-black">
                {selectedFuel?.label ?? "น้ำมัน"}
              </h1>

              <p className="mt-2 text-4xl font-black text-blue-600 tabular-nums">
                +{Number(form.liters).toLocaleString("th-TH")} L
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs text-slate-400">ต้นทุน/ลิตร</p>
                  <p className="mt-1 font-black">{fmt(Number(form.costPerLiter))} ฿</p>
                </div>

                <div className="rounded-2xl bg-blue-50 p-4">
                  <p className="text-xs text-blue-400">ต้นทุนรวม</p>
                  <p className="mt-1 font-black text-blue-700">
                    ฿{fmt(totalCost)}
                  </p>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    setSuccess(false);
                    setForm((f) => ({
                      ...f,
                      liters: "",
                      costPerLiter: "",
                      invoiceNo: "",
                      supplier: "",
                      note: "",
                      paidNote: "",
                      date: today,
                    }));
                  }}
                  className="h-13 rounded-2xl border border-slate-200 bg-white font-bold text-slate-600"
                >
                  รับเข้าเพิ่ม
                </button>

                <button
                  onClick={() => router.push("/stock")}
                  className="h-13 rounded-2xl bg-blue-600 font-bold text-white shadow-lg shadow-blue-600/20"
                >
                  กลับหน้าสต็อก
                </button>
              </div>
            </div>
          </section>

          <BottomNav router={router} pathname={pathname} />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#eef4fb] text-slate-900">
      <div className="mx-auto min-h-screen w-full max-w-[480px] bg-[#f8fbff] shadow-[0_0_45px_rgba(15,23,42,0.08)] md:my-5 md:min-h-[calc(100vh-40px)] md:rounded-[34px] md:overflow-hidden">
        <AppHeader onBack={() => router.push("/stock")} />

        {/* TITLE */}
        <section className="px-5 pt-5">
          <p className="text-sm text-slate-500">เพิ่มสต็อกน้ำมัน</p>
          <h1 className="mt-1 text-[32px] font-black tracking-tight">
            รับน้ำมันเข้า
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            บันทึกจำนวนลิตร ต้นทุน และสถานะการชำระเงิน
          </p>
        </section>

        <form onSubmit={handleSubmit} className="px-5 pt-5 pb-40 space-y-5">
          {/* FUEL */}
          <section>
            <p className="mb-2 text-xs font-bold text-slate-500">ชนิดน้ำมัน</p>

            <div className="grid grid-cols-2 gap-3">
              {fuelTypes.map((ft) => {
                const active = form.fuelTypeId === String(ft.id);

                return (
                  <button
                    key={ft.id}
                    type="button"
                    onClick={() => set("fuelTypeId", String(ft.id))}
                    className={`rounded-[22px] border p-4 text-left transition active:scale-[0.98] ${
                      active
                        ? "border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-600/15"
                        : "border-slate-200 bg-white text-slate-700 shadow-sm"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                          active
                            ? "bg-white/15 text-white"
                            : FUEL_BG[ft.name] ?? "bg-slate-100 text-slate-600"
                        }`}
                      >
                        ⛽
                      </div>

                      {active && (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs">
                          ✓
                        </span>
                      )}
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          FUEL_COLOR[ft.name] ?? "bg-slate-400"
                        }`}
                      />
                      <span className="font-black">{ft.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* LITERS */}
          <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold text-slate-500">จำนวนลิตร</p>

            <div className="relative mt-2">
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={form.liters}
                onChange={(e) => set("liters", e.target.value)}
                placeholder="0"
                className="h-20 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 pr-16 text-center text-[36px] font-black tabular-nums outline-none focus:border-blue-500 focus:bg-white"
                required
              />

              <span className="absolute right-5 top-1/2 -translate-y-1/2 text-lg font-black text-slate-400">
                L
              </span>
            </div>
          </section>

          {/* COST */}
          <section className="grid grid-cols-2 gap-3">
            <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
              <label className="text-xs font-bold text-slate-500">
                ต้นทุน/ลิตร
              </label>

              <div className="relative mt-2">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                  ฿
                </span>

                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={form.costPerLiter}
                  onChange={(e) => set("costPerLiter", e.target.value)}
                  placeholder="0.00"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 text-center text-lg font-black tabular-nums outline-none focus:border-blue-500 focus:bg-white"
                  required
                />
              </div>
            </div>

            <div className="rounded-[22px] bg-blue-600 p-4 text-white shadow-lg shadow-blue-600/15">
              <p className="text-xs text-blue-100">ต้นทุนรวม</p>
              <p className="mt-2 text-xl font-black tabular-nums">
                ฿{totalCost > 0 ? fmt(totalCost) : "0.00"}
              </p>
            </div>
          </section>

          {/* PAYMENT */}
          <section>
            <p className="mb-2 text-xs font-bold text-slate-500">
              การชำระเงิน
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    isPaid: true,
                    paidNote: "",
                  }))
                }
                className={`h-14 rounded-2xl border font-black transition ${
                  form.isPaid
                    ? "border-emerald-500 bg-emerald-50 text-emerald-600"
                    : "border-slate-200 bg-white text-slate-500"
                }`}
              >
                ✓ จ่ายแล้ว
              </button>

              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    isPaid: false,
                  }))
                }
                className={`h-14 rounded-2xl border font-black transition ${
                  !form.isPaid
                    ? "border-red-500 bg-red-50 text-red-600"
                    : "border-slate-200 bg-white text-slate-500"
                }`}
              >
                ! ค้างจ่าย
              </button>
            </div>

            {!form.isPaid && (
              <input
                type="text"
                value={form.paidNote}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    paidNote: e.target.value,
                  }))
                }
                placeholder="เช่น นัดจ่าย 25 พ.ค."
                className="mt-3 h-12 w-full rounded-2xl border border-red-200 bg-white px-4 text-sm outline-none focus:border-red-400"
              />
            )}
          </section>

          {/* OPTIONAL INFO */}
          <details className="rounded-[24px] border border-slate-200 bg-white shadow-sm">
            <summary className="cursor-pointer list-none p-4 text-sm font-black text-slate-600">
              ข้อมูลเอกสารและรายละเอียด
            </summary>

            <div className="border-t border-slate-100 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={form.invoiceNo}
                  onChange={(e) => set("invoiceNo", e.target.value)}
                  placeholder="เลขที่บิล"
                  className="h-12 rounded-2xl border border-slate-200 px-4 text-sm outline-none focus:border-blue-500"
                />

                <input
                  type="text"
                  value={form.supplier}
                  onChange={(e) => set("supplier", e.target.value)}
                  placeholder="บริษัท / ผู้ส่ง"
                  className="h-12 rounded-2xl border border-slate-200 px-4 text-sm outline-none focus:border-blue-500"
                />
              </div>

              <input
                type="date"
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
                className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm outline-none focus:border-blue-500"
              />

              <input
                type="text"
                value={form.note}
                onChange={(e) => set("note", e.target.value)}
                placeholder="หมายเหตุ (ถ้ามี)"
                className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm outline-none focus:border-blue-500"
              />
            </div>
          </details>

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* STICKY SAVE */}
          <div className="fixed inset-x-0 bottom-[75px] z-40 mx-auto w-full max-w-[480px] px-5">
            <div className="rounded-[22px] border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur">
              <div className="mb-2 flex items-center justify-between text-xs">
                <div className="min-w-0">
                  <p className="truncate font-bold text-slate-700">
                    {selectedFuel?.label ?? "เลือกน้ำมัน"}
                    {form.liters ? ` · ${Number(form.liters).toLocaleString("th-TH")} L` : ""}
                  </p>
                  <p className="mt-0.5 text-slate-400">
                    {form.isPaid ? "จ่ายแล้ว" : "ค้างจ่าย"}
                  </p>
                </div>

                <p className="ml-3 text-base font-black text-blue-600 tabular-nums">
                  ฿{totalCost > 0 ? fmt(totalCost) : "0.00"}
                </p>
              </div>

              <button
                type="submit"
                disabled={
                  loading ||
                  !form.fuelTypeId ||
                  Number(form.liters) <= 0 ||
                  Number(form.costPerLiter) <= 0
                }
                className="h-14 w-full rounded-2xl bg-blue-600 text-base font-black text-white shadow-lg shadow-blue-600/20 transition active:scale-[0.99] disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
              >
                {loading ? "กำลังบันทึก..." : "รับน้ำมันเข้า"}
              </button>
            </div>
          </div>
        </form>

        <BottomNav router={router} pathname={pathname} />
      </div>
    </main>
  );
}

function AppHeader({ onBack }: { onBack: () => void }) {
  return (
    <header className="bg-white px-5 pt-5 pb-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-xl text-white shadow-lg shadow-blue-600/20">
            💧
          </div>

          <div className="text-left">
            <div className="text-[20px] font-black leading-none">
              Fuel<span className="text-blue-600">POS</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              ระบบจัดการสถานีน้ำมัน
            </div>
          </div>
        </button>

        <div className="flex items-center gap-2">
          <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 text-lg">
            🔔
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold">
            📅 {displayDate()}
          </div>
        </div>
      </div>
    </header>
  );
}

function BottomNav({
  router,
  pathname,
}: {
  router: ReturnType<typeof useRouter>;
  pathname: string;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[480px] border-t border-slate-200 bg-white/95 px-3 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2 backdrop-blur md:bottom-5 md:rounded-b-[34px]">
      <div className="grid grid-cols-5">
        <NavItem
          label="หน้าหลัก"
          icon="⌂"
          active={pathname === "/dashboard"}
          onClick={() => router.push("/dashboard")}
        />
        <NavItem
          label="ขาย"
          icon="⛽"
          active={pathname.startsWith("/sales") || pathname === "/quick"}
          onClick={() => router.push("/sales/new")}
        />
        <NavItem
          label="สต็อก"
          icon="◇"
          active={pathname.startsWith("/stock") || pathname.startsWith("/purchases")}
          onClick={() => router.push("/stock")}
        />
        <NavItem
          label="มิเตอร์"
          icon="▥"
          active={pathname.startsWith("/meter")}
          onClick={() => router.push("/meter")}
        />
        <NavItem
          label="รายงาน"
          icon="▮"
          active={pathname.startsWith("/report")}
          onClick={() => router.push("/reports")}
        />
      </div>
    </nav>
  );
}

function NavItem({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex min-h-[58px] flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-bold ${
        active ? "text-blue-600" : "text-slate-400"
      }`}
    >
      <span className={`text-[22px] leading-none ${active ? "scale-110" : ""}`}>
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}
