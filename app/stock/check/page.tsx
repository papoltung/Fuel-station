"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type FuelType = {
  id: number;
  name: string;
  label: string;
};

type StockItem = {
  fuelTypeId: number;
  currentLiters: number;
  fuelType: FuelType;
};

type CheckResult = {
  label: string;
  system: number;
  actual: number;
  diff: number;
};

function fmt(n: number) {
  return Number(n || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function displayDate() {
  return new Date().toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
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

export default function StockCheckPage() {
  const router = useRouter();
  const pathname = usePathname();

  const [fuelTypes, setFuelTypes] = useState<FuelType[]>([]);
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<CheckResult[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);
  const [actuals, setActuals] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});

  useEffect(() => {
    Promise.all([
      fetch("/api/fuel-types").then((r) => r.json()),
      fetch("/api/fuel-stock").then((r) => r.json()),
    ])
      .then(([fts, stks]: [FuelType[], StockItem[]]) => {
        setFuelTypes(fts ?? []);
        setStocks(stks ?? []);
      })
      .catch(() => setError("โหลดข้อมูลไม่สำเร็จ"));
  }, []);

  function getSystemLiters(fuelTypeId: number) {
    return stocks.find((s) => s.fuelTypeId === fuelTypeId)?.currentLiters ?? 0;
  }

  const enteredCount = useMemo(
    () =>
      fuelTypes.filter(
        (ft) => actuals[ft.id] !== undefined && actuals[ft.id] !== ""
      ).length,
    [fuelTypes, actuals]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const entries = fuelTypes.filter(
      (ft) => actuals[ft.id] !== undefined && actuals[ft.id] !== ""
    );

    if (entries.length === 0) {
      setError("กรอกค่าวัดถังจริงอย่างน้อย 1 ชนิด");
      return;
    }

    setLoading(true);

    try {
      const res = await Promise.all(
        entries.map(async (ft) => {
          const response = await fetch("/api/stock-checks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fuelTypeId: ft.id,
              actualLiters: Number(actuals[ft.id]),
              note: notes[ft.id] || null,
              date,
            }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error ?? "บันทึกไม่สำเร็จ");
          }

          return data;
        })
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    const totalDiff = results.reduce((sum, r) => sum + r.diff, 0);
    const hasWarning = results.some((r) => Math.abs(r.diff) > 20);

    return (
      <main className="min-h-screen bg-[#eef4fb] text-slate-900">
        <div className="mx-auto min-h-screen w-full max-w-[480px] bg-[#f8fbff] shadow-[0_0_45px_rgba(15,23,42,0.08)] md:my-5 md:min-h-[calc(100vh-40px)] md:rounded-[34px] md:overflow-hidden">
          <AppHeader onBack={() => router.push("/stock")} />

          <section className="px-5 pt-5">
            <p className="text-sm text-slate-500">ตรวจสอบเรียบร้อย</p>
            <h1 className="mt-1 text-[32px] font-black tracking-tight">
              ผลวัดถัง
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              เปรียบเทียบค่าระบบกับค่าที่วัดจริง
            </p>
          </section>

          <section className="px-5 pt-5">
            <div
              className={`rounded-[26px] p-5 shadow-sm ${
                hasWarning
                  ? "border border-red-100 bg-red-50"
                  : "border border-emerald-100 bg-emerald-50"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p
                    className={`text-xs font-bold ${
                      hasWarning ? "text-red-500" : "text-emerald-500"
                    }`}
                  >
                    ภาพรวมการตรวจ
                  </p>

                  <p
                    className={`mt-1 text-3xl font-black tabular-nums ${
                      hasWarning ? "text-red-700" : "text-emerald-700"
                    }`}
                  >
                    {totalDiff > 0 ? "+" : ""}
                    {fmt(totalDiff)} L
                  </p>
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    hasWarning
                      ? "bg-red-100 text-red-600"
                      : "bg-emerald-100 text-emerald-600"
                  }`}
                >
                  {hasWarning ? "ควรตรวจสอบ" : "ปกติ"}
                </span>
              </div>

              <p className="mt-2 text-xs text-slate-500">
                ตรวจ {results.length} ชนิดน้ำมัน · {displayDate()}
              </p>
            </div>
          </section>

          <section className="px-5 pt-5 pb-28">
            <div className="space-y-4">
              {results.map((r, i) => {
                const isShort = r.diff < -20;
                const isOver = r.diff > 20;
                const ok = !isShort && !isOver;

                return (
                  <article
                    key={i}
                    className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <h2 className="font-black">{r.label}</h2>

                      <span
                        className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                          isShort
                            ? "bg-red-50 text-red-600"
                            : isOver
                            ? "bg-amber-50 text-amber-600"
                            : "bg-emerald-50 text-emerald-600"
                        }`}
                      >
                        {isShort ? "น้ำมันขาด" : isOver ? "น้ำมันเกิน" : "ปกติ"}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-[11px] text-slate-400">
                          คงเหลือตามระบบ
                        </p>
                        <p className="mt-1 text-xl font-black tabular-nums">
                          {fmt(r.system)} L
                        </p>
                      </div>

                      <div className="rounded-2xl bg-blue-50 p-4">
                        <p className="text-[11px] text-blue-400">วัดถังจริง</p>
                        <p className="mt-1 text-xl font-black text-blue-700 tabular-nums">
                          {fmt(r.actual)} L
                        </p>
                      </div>
                    </div>

                    <div
                      className={`mt-3 rounded-2xl px-4 py-3 flex items-center justify-between ${
                        isShort
                          ? "bg-red-50"
                          : isOver
                          ? "bg-amber-50"
                          : "bg-emerald-50"
                      }`}
                    >
                      <span
                        className={`text-sm font-bold ${
                          isShort
                            ? "text-red-600"
                            : isOver
                            ? "text-amber-700"
                            : "text-emerald-600"
                        }`}
                      >
                        ส่วนต่าง
                      </span>

                      <span
                        className={`text-lg font-black tabular-nums ${
                          isShort
                            ? "text-red-700"
                            : isOver
                            ? "text-amber-700"
                            : "text-emerald-700"
                        }`}
                      >
                        {r.diff > 0 ? "+" : ""}
                        {fmt(r.diff)} L
                      </span>
                    </div>

                    {!ok && (
                      <p
                        className={`mt-3 text-xs font-semibold ${
                          isShort ? "text-red-600" : "text-amber-700"
                        }`}
                      >
                        ⚠{" "}
                        {isShort
                          ? `น้ำมันขาด ${fmt(Math.abs(r.diff))} ลิตร กรุณาตรวจสอบ`
                          : `น้ำมันเกิน ${fmt(r.diff)} ลิตร กรุณาตรวจสอบ`}
                      </p>
                    )}
                  </article>
                );
              })}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setSubmitted(false);
                  setResults([]);
                }}
                className="h-13 rounded-2xl border border-slate-200 bg-white font-bold text-slate-600"
              >
                วัดใหม่
              </button>

              <button
                onClick={() => router.push("/stock")}
                className="h-13 rounded-2xl bg-blue-600 font-bold text-white shadow-lg shadow-blue-600/20"
              >
                กลับหน้าสต็อก
              </button>
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

        <section className="px-5 pt-5">
          <p className="text-sm text-slate-500">ตรวจสอบสต็อกจริง</p>
          <h1 className="mt-1 text-[32px] font-black tracking-tight">
            วัดถัง
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            กรอกปริมาณจริงเพื่อเทียบกับสต็อกในระบบ
          </p>
        </section>

        <section className="px-5 pt-5">
          <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">วันที่ตรวจ</p>
                <p className="mt-1 font-black">{displayDate()}</p>
              </div>

              <details className="relative">
                <summary className="cursor-pointer list-none rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-blue-600">
                  เปลี่ยนวันที่
                </summary>

                <div className="absolute right-0 z-20 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-500"
                  />
                </div>
              </details>
            </div>
          </div>
        </section>

        <form onSubmit={handleSubmit} className="px-5 pt-5 pb-36 space-y-4">
          {fuelTypes.map((ft) => {
            const system = getSystemLiters(ft.id);
            const hasValue =
              actuals[ft.id] !== undefined && actuals[ft.id] !== "";
            const diff = hasValue ? Number(actuals[ft.id]) - system : 0;
            const isShort = diff < -20;
            const isOver = diff > 20;
            const ok = hasValue && !isShort && !isOver;

            return (
              <article
                key={ft.id}
                className={`rounded-[26px] border bg-white p-5 shadow-sm ${
                  hasValue
                    ? isShort
                      ? "border-red-200"
                      : isOver
                      ? "border-amber-200"
                      : "border-emerald-200"
                    : "border-slate-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                      FUEL_BG[ft.name] ?? "bg-slate-100 text-slate-600"
                    }`}
                  >
                    ⛽
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          FUEL_COLOR[ft.name] ?? "bg-slate-400"
                        }`}
                      />
                      <h2 className="font-black">{ft.label}</h2>
                    </div>

                    <p className="mt-1 text-xs text-slate-400">
                      ระบบ {fmt(system)} L
                    </p>
                  </div>

                  {hasValue && (
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                        isShort
                          ? "bg-red-50 text-red-600"
                          : isOver
                          ? "bg-amber-50 text-amber-600"
                          : "bg-emerald-50 text-emerald-600"
                      }`}
                    >
                      {isShort ? "ขาด" : isOver ? "เกิน" : "ปกติ"}
                    </span>
                  )}
                </div>

                <div className="mt-4">
                  <label className="mb-2 block text-xs font-bold text-slate-500">
                    วัดถังจริง (ลิตร)
                  </label>

                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      value={actuals[ft.id] ?? ""}
                      onChange={(e) =>
                        setActuals((a) => ({
                          ...a,
                          [ft.id]: e.target.value,
                        }))
                      }
                      placeholder={fmt(system)}
                      className="h-16 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 pr-12 text-center text-2xl font-black tabular-nums outline-none focus:border-blue-500 focus:bg-white"
                    />

                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                      L
                    </span>
                  </div>
                </div>

                {hasValue && (
                  <div
                    className={`mt-3 rounded-2xl px-4 py-3 flex items-center justify-between ${
                      isShort
                        ? "bg-red-50"
                        : isOver
                        ? "bg-amber-50"
                        : "bg-emerald-50"
                    }`}
                  >
                    <span
                      className={`text-xs font-bold ${
                        isShort
                          ? "text-red-600"
                          : isOver
                          ? "text-amber-700"
                          : "text-emerald-600"
                      }`}
                    >
                      ส่วนต่าง
                    </span>

                    <span
                      className={`font-black tabular-nums ${
                        isShort
                          ? "text-red-700"
                          : isOver
                          ? "text-amber-700"
                          : "text-emerald-700"
                      }`}
                    >
                      {diff > 0 ? "+" : ""}
                      {fmt(diff)} L
                    </span>
                  </div>
                )}

                <details className="mt-3">
                  <summary className="cursor-pointer list-none text-xs font-semibold text-slate-400">
                    + หมายเหตุ
                  </summary>

                  <input
                    type="text"
                    value={notes[ft.id] ?? ""}
                    onChange={(e) =>
                      setNotes((n) => ({
                        ...n,
                        [ft.id]: e.target.value,
                      }))
                    }
                    placeholder="หมายเหตุ..."
                    className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-500"
                  />
                </details>
              </article>
            );
          })}

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="fixed inset-x-0 bottom-[75px] z-40 mx-auto w-full max-w-[480px] px-5">
            <div className="rounded-[22px] border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  กรอกแล้ว {enteredCount}/{fuelTypes.length} ชนิด
                </span>

                <span className="font-bold text-slate-600">{displayDate()}</span>
              </div>

              <button
                type="submit"
                disabled={loading || enteredCount === 0}
                className="h-14 w-full rounded-2xl bg-blue-600 text-base font-black text-white shadow-lg shadow-blue-600/20 transition active:scale-[0.99] disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
              >
                {loading ? "กำลังบันทึก..." : "บันทึกผลวัดถัง"}
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
          onClick={() => router.push("/quick")}
        />
        <NavItem
          label="สต็อก"
          icon="◇"
          active={pathname.startsWith("/stock")}
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
          onClick={() => router.push("/dashboard")}
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
