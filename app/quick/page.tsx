"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { browserSaleQueue, createSaleQueueSynchronizer, repairPumpAssignments, retryNeedsReview, type PendingSale } from "@/lib/sale-queue";

type FuelType = {
  id: number;
  name: string;
  label: string;
  currentPrice: number;
};

type Product = {
  id: number;
  name: string;
  category: string;
  size: string;
  unit: string;
  currentPrice: number;
  currentStock: number;
  image: string | null;
};

type Pump = {
  id: number;
  number: string;
  label: string;
  isActive: boolean;
  fuelTypeId: number | null;
};

const PUMP_OPTIONS = ["1", "2", "3", "4"];

const PAYMENT_OPTIONS = [
  { value: "cash", label: "เงินสด", icon: "฿" },
  { value: "transfer", label: "โอน", icon: "⇄" },
  { value: "credit", label: "เครดิต", icon: "▣" },
];

const QUICK_AMOUNTS = [40, 50, 60, 80, 100, 200, 300, 500, 1000];
type Account = { authUserId: string; name: string; role: "owner" | "manager" | "staff" };

const syncSaleQueue = createSaleQueueSynchronizer(browserSaleQueue, async (item: PendingSale) => {
    const response = await fetch("/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item.payload),
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, error: data.error, errorCode: data.code };
}, async () => {
  try {
    const response = await fetch("/api/me", { cache: "no-store" });
    if (!response.ok) return null;
    const user = await response.json().catch(() => null);
    return typeof user?.authUserId === "string" ? user.authUserId : null;
  } catch {
    return null;
  }
});

export default function NewSalePage() {
  const router = useRouter();

  const [saleType, setSaleType] = useState<"fuel" | "product">("fuel");
  const [fuelTypes, setFuelTypes] = useState<FuelType[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [pumps, setPumps] = useState<Pump[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [successData, setSuccessData] = useState({ amount: 0, label: "" });
  const [account, setAccount] = useState<Account | null>(null);
  const [queueStatus, setQueueStatus] = useState<{ queued: number; needsReview: number; lastError?: string }>({ queued: 0, needsReview: 0 });
  const [syncing, setSyncing] = useState(false);
  const [queuedFlash, setQueuedFlash] = useState("");
  const [showKeypad, setShowKeypad] = useState(false);
  const [keypadAmount, setKeypadAmount] = useState("");
  const customSubmitAmount = useRef<string | null>(null);
  const fuelFormRef = useRef<HTMLFormElement>(null);
  const backgroundSyncTimer = useRef<number | null>(null);

  // product-shop UX
  const [productSearch, setProductSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("ทั้งหมด");

  const nowDT = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes()
    ).padStart(2, "0")}`;
  };

  const [fuelForm, setFuelForm] = useState({
    date: nowDT(),
    sellerName: "",
    fuelTypeId: "",
    pumpNo: "1",
    totalAmount: "",
    pricePerLiter: "",
    paymentMethod: "cash",
    customerName: "",
  });

  const [productForm, setProductForm] = useState({
    date: nowDT(),
    sellerName: "",
    productId: "",
    quantity: "1",
    unitPrice: "",
    paymentMethod: "cash",
    customerName: "",
  });

  useEffect(() => {
    fetch("/api/fuel-types", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: FuelType[]) => {
        setFuelTypes(data);
        const firstAvailable =
          data.find((x) => Number(x.currentPrice) > 0) ?? data[0];

        if (firstAvailable) {
          setFuelForm((f) => ({
            ...f,
            fuelTypeId: String(firstAvailable.id),
            pricePerLiter:
              Number(firstAvailable.currentPrice) > 0
                ? String(firstAvailable.currentPrice)
                : "",
          }));
        }
      })
      .catch(() => setError("โหลดข้อมูลน้ำมันไม่สำเร็จ"));

    fetch("/api/products", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: Product[]) => {
        setProducts(data);

        if (data.length > 0) {
          setProductForm((f) => ({
            ...f,
            productId: String(data[0].id),
            unitPrice: String(data[0].currentPrice),
          }));
        }
      })
      .catch(() => setError("โหลดข้อมูลสินค้าไม่สำเร็จ"));

    fetch("/api/pumps", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : [])
      .then((data: Pump[]) => setPumps(Array.isArray(data) ? data : []))
      .catch(() => setPumps([]));

    fetch("/api/me").then((response) => response.ok ? response.json() : null).then(setAccount);
  }, []);

  useEffect(() => {
    let mounted = true;
    const refreshQueue = async () => {
      setSyncing(true);
      try {
        const result = await syncSaleQueue();
        if (mounted) setQueueStatus({ queued: result.queued, needsReview: result.needsReview, lastError: result.lastError });
      } finally {
        if (mounted) setSyncing(false);
      }
    };
    void refreshQueue();
    window.addEventListener("online", refreshQueue);
    return () => {
      mounted = false;
      window.removeEventListener("online", refreshQueue);
      if (backgroundSyncTimer.current !== null) window.clearTimeout(backgroundSyncTimer.current);
    };
  }, []);

  useEffect(() => {
    async function refreshPrices() {
      if (document.visibilityState === "hidden") return;
      const response = await fetch("/api/fuel-types", { cache: "no-store" });
      if (!response.ok) return;
      const data: FuelType[] = await response.json();
      setFuelTypes(data);
      setFuelForm((form) => {
        const selected = data.find((fuel) => String(fuel.id) === form.fuelTypeId);
        return selected ? { ...form, pricePerLiter: selected.currentPrice > 0 ? String(selected.currentPrice) : "" } : form;
      });
    }
    window.addEventListener("focus", refreshPrices);
    document.addEventListener("visibilitychange", refreshPrices);
    return () => {
      window.removeEventListener("focus", refreshPrices);
      document.removeEventListener("visibilitychange", refreshPrices);
    };
  }, []);

  function setFuel(field: string, value: string) {
    setFuelForm((f) => ({ ...f, [field]: value }));
    setError("");
  }

  function setProd(field: string, value: string) {
    setProductForm((f) => ({ ...f, [field]: value }));
    setError("");
  }

  const selectedFuel = useMemo(
    () => fuelTypes.find((ft) => String(ft.id) === fuelForm.fuelTypeId),
    [fuelTypes, fuelForm.fuelTypeId]
  );
  const compatiblePumps = useMemo(
    () => pumps.filter((pump) => pump.isActive && pump.fuelTypeId === Number(fuelForm.fuelTypeId)),
    [pumps, fuelForm.fuelTypeId]
  );
  const selectedPump = useMemo(
    () => compatiblePumps.find((pump) => pump.number === fuelForm.pumpNo) ?? compatiblePumps[0],
    [compatiblePumps, fuelForm.pumpNo]
  );

  const fuelPrice = Number(fuelForm.pricePerLiter || 0);
  const fuelAmount = Number(fuelForm.totalAmount || 0);
  const liters =
    fuelPrice > 0 && fuelAmount > 0 ? fuelAmount / fuelPrice : 0;

  const selectedProduct = products.find(
    (p) => String(p.id) === productForm.productId
  );

  const productTotal =
    Number(productForm.quantity || 0) * Number(productForm.unitPrice || 0);

  const categories = useMemo(() => {
    const unique = Array.from(
      new Set(products.map((p) => (p.category || "อื่นๆ").trim()))
    );
    return ["ทั้งหมด", ...unique];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();

    return products.filter((p) => {
      const category = (p.category || "อื่นๆ").trim();
      const categoryOK =
        activeCategory === "ทั้งหมด" || category === activeCategory;

      const searchOK =
        !q ||
        p.name.toLowerCase().includes(q) ||
        category.toLowerCase().includes(q) ||
        (p.size || "").toLowerCase().includes(q);

      return categoryOK && searchOK;
    });
  }, [products, productSearch, activeCategory]);

  const canSubmitFuel =
    !loading &&
    !!fuelForm.fuelTypeId &&
    fuelAmount > 0 &&
    fuelPrice > 0 &&
    !!fuelForm.paymentMethod &&
    (fuelForm.paymentMethod !== "credit" ||
      !!fuelForm.customerName.trim()) &&
    !!account;

  const canSubmitProduct =
    !loading &&
    !!productForm.productId &&
    Number(productForm.quantity) > 0 &&
    Number(productForm.unitPrice) > 0 &&
    !!account &&
    (productForm.paymentMethod !== "credit" ||
      !!productForm.customerName.trim());

  async function submitFuel(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const amountForSubmit = customSubmitAmount.current ?? fuelForm.totalAmount;
    customSubmitAmount.current = null;
    const effectiveFuelAmount = Number(amountForSubmit || 0);

    if (!fuelForm.fuelTypeId) return setError("เลือกชนิดน้ำมัน");
    if (!amountForSubmit || effectiveFuelAmount <= 0)
      return setError("กรอกยอดเงิน");
    if (!fuelForm.pricePerLiter || fuelPrice <= 0)
      return setError("ยังไม่ได้ตั้งราคาน้ำมันชนิดนี้");
    if (!selectedPump)
      return setError("กรุณาเลือกหัวจ่ายที่ตั้งค่าไว้");
    if (
      fuelForm.paymentMethod === "credit" &&
      !fuelForm.customerName.trim()
    )
      return setError("กรอกชื่อลูกค้าเครดิต");

    // Persist first, clear the form immediately, then let the queue sync in the background.
    try {
      if (!account?.authUserId) {
        setError("กรุณาเข้าสู่ระบบก่อนบันทึกการขาย");
        return;
      }
      const id = crypto.randomUUID();
      await browserSaleQueue.put({
        id,
        createdAt: new Date().toISOString(),
        status: "queued",
        attempts: 0,
        createdByAuthUserId: account.authUserId,
        expectedPumpId: selectedPump.id,
        payload: {
          clientRequestId: id,
          expectedPumpId: selectedPump.id,
          pumpId: selectedPump.id,
          ...fuelForm,
          totalAmount: amountForSubmit,
          pumpNo: `หัวจ่าย ${selectedPump.number}`,
          date: fuelForm.date + "+07:00",
        },
      });
      setQueuedFlash(`${selectedFuel?.label ?? "น้ำมัน"} ฿${effectiveFuelAmount.toLocaleString("th-TH")} — บันทึกแล้ว`);
      setQueueStatus((value) => ({ ...value, queued: value.queued + 1 }));
      setFuelForm((form) => ({ ...form, date: nowDT(), totalAmount: "", customerName: "" }));
      window.setTimeout(() => setQueuedFlash(""), 3500);
      if (backgroundSyncTimer.current !== null) window.clearTimeout(backgroundSyncTimer.current);
      backgroundSyncTimer.current = window.setTimeout(() => {
        backgroundSyncTimer.current = null;
        setSyncing(true);
        void syncSaleQueue()
          .then((result) => setQueueStatus({ queued: result.queued, needsReview: result.needsReview, lastError: result.lastError }))
          .finally(() => setSyncing(false));
      }, 5000);
      return;
    } catch {
      setError("อุปกรณ์นี้เก็บคิวขายไม่ได้ กรุณาลองใหม่");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientRequestId: crypto.randomUUID(),
          pumpId: selectedPump.id,
          ...fuelForm,
          pumpNo: `หัวจ่าย ${selectedPump.number}`,
          date: fuelForm.date + "+07:00",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "บันทึกไม่สำเร็จ");
        return;
      }

      setSuccessData({
        amount: fuelAmount,
        label: `${selectedFuel?.label ?? ""} · ${liters.toFixed(2)} ลิตร`,
      });
      setSuccess(true);
    } catch {
      setError("เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  async function submitProduct(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!productForm.productId) return setError("เลือกสินค้า");
    if (!productForm.quantity || Number(productForm.quantity) <= 0)
      return setError("กรอกจำนวน");
    if (!productForm.unitPrice || Number(productForm.unitPrice) <= 0)
      return setError("กรอกราคา");
    if (
      productForm.paymentMethod === "credit" &&
      !productForm.customerName.trim()
    )
      return setError("กรอกชื่อลูกค้าเครดิต");

    setLoading(true);

    try {
      // Product sales are intentionally online-only; they are not placed in the fuel offline queue.
      const res = await fetch("/api/product-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...productForm,
          totalAmount: productTotal,
          date: productForm.date + "+07:00",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "บันทึกไม่สำเร็จ");
        return;
      }

      setSuccessData({
        amount: productTotal,
        label: `${selectedProduct?.name ?? ""} ${productForm.quantity} ${
          selectedProduct?.unit ?? ""
        }`,
      });
      setSuccess(true);
    } catch {
      setError("เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  function resetForNextSale() {
    setSuccess(false);
    setError("");

    setFuelForm((f) => ({
      ...f,
      date: nowDT(),
      totalAmount: "",
      customerName: "",
    }));

    setProductForm((f) => ({
      ...f,
      date: nowDT(),
      quantity: "1",
      customerName: "",
    }));
  }

  function changeQty(delta: number) {
    const current = Math.max(1, Number(productForm.quantity || 1));
    const maxStock =
      selectedProduct && selectedProduct.currentStock > 0
        ? selectedProduct.currentStock
        : current + delta;

    const next = Math.max(1, Math.min(current + delta, maxStock));
    setProd("quantity", String(next));
  }

  if (success) {
    return (
      <main className="min-h-screen bg-slate-50 px-5 flex items-center justify-center">
        <section className="w-full max-w-sm rounded-[28px] bg-white border border-slate-200 shadow-sm p-7 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 text-3xl font-bold">
            ✓
          </div>

          <p className="text-sm text-slate-500">บันทึกการขายสำเร็จ</p>

          <p className="mt-2 text-4xl font-black text-slate-950 tabular-nums">
            ฿{successData.amount.toLocaleString("th-TH")}
          </p>

          <p className="mt-2 text-sm text-slate-500">{successData.label}</p>

          <div className="mt-7 grid gap-3">
            <button
              type="button"
              onClick={resetForNextSale}
              className="h-14 rounded-2xl bg-blue-600 text-white font-bold text-base active:scale-[0.99] transition"
            >
              ขายรายการถัดไป
            </button>

            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="h-12 rounded-2xl bg-slate-100 text-slate-700 font-semibold"
            >
              กลับหน้าหลัก
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F6F8FC] text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="max-w-lg mx-auto h-16 px-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="h-10 w-10 rounded-xl flex items-center justify-center text-xl text-slate-700 hover:bg-slate-100"
            aria-label="กลับ"
          >
            ←
          </button>

          <div className="text-center">
            <h1 className="font-bold text-base">บันทึกการขาย</h1>
            <p className="text-[11px] text-slate-400">
              เลือกสินค้า • ชำระเงิน • บันทึก
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              if (saleType === "fuel") setFuel("totalAmount", "");
              else setProd("quantity", "1");
              setError("");
            }}
            className="h-10 px-2 text-sm font-semibold text-blue-600"
          >
            ล้าง
          </button>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-4">
        {(queuedFlash || queueStatus.queued > 0 || queueStatus.needsReview > 0) && (
          <div className={`mb-3 rounded-2xl border px-4 py-3 text-sm ${queueStatus.needsReview > 0 ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`} role="status">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-bold">{queuedFlash || (syncing ? "กำลังส่งคิวขาย…" : queueStatus.queued > 0 ? `รอส่ง ${queueStatus.queued} รายการ` : `มี ${queueStatus.needsReview} รายการต้องตรวจสอบ`)}</p>
                {queueStatus.needsReview > 0 && <p className="mt-1 text-xs">{queueStatus.lastError || `มี ${queueStatus.needsReview} รายการต้องตรวจสอบข้อมูล`}</p>}
              </div>
              {(queueStatus.queued > 0 || queueStatus.needsReview > 0) && (
                <button type="button" disabled={syncing} onClick={() => { if (backgroundSyncTimer.current !== null) { window.clearTimeout(backgroundSyncTimer.current); backgroundSyncTimer.current = null; } setSyncing(true); void repairPumpAssignments(browserSaleQueue, pumps).then(() => retryNeedsReview(browserSaleQueue)).then(() => syncSaleQueue()).then((result) => setQueueStatus({ queued: result.queued, needsReview: result.needsReview, lastError: result.lastError })).finally(() => setSyncing(false)); }} className="min-h-10 shrink-0 rounded-xl bg-white px-3 font-bold shadow-sm disabled:opacity-50">ส่งอีกครั้ง</button>
              )}
            </div>
          </div>
        )}
        {account && <div className="mb-3 flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3"><span className="grid size-9 place-items-center rounded-full bg-blue-600 font-black text-white">{account.name.slice(0, 1).toUpperCase()}</span><div><p className="text-xs text-blue-600">ขายโดย</p><p className="font-bold text-slate-900">{account.name}<span className="ml-1 text-xs font-semibold text-slate-500">· {account.role === "owner" ? "เจ้าของ" : account.role === "manager" ? "ผู้จัดการ" : "พนักงาน"}</span></p></div></div>}
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-200/70 p-1">
          <button
            type="button"
            onClick={() => {
              setSaleType("fuel");
              setError("");
            }}
            className={`h-11 rounded-xl text-sm font-bold transition ${
              saleType === "fuel"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-slate-500"
            }`}
          >
            ⛽ น้ำมัน
          </button>

          <button
            type="button"
            onClick={() => {
              setSaleType("product");
              setError("");
            }}
            className={`h-11 rounded-xl text-sm font-bold transition ${
              saleType === "product"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-slate-500"
            }`}
          >
            🛍 สินค้า
          </button>
        </div>
      </div>

      {saleType === "fuel" ? (
        <form
          ref={fuelFormRef}
          onSubmit={submitFuel}
          className="max-w-lg mx-auto px-4 pt-5 pb-36 space-y-6"
        >
          <section>
            <SectionTitle title="เลือกน้ำมัน" />

            <div className="grid grid-cols-2 gap-3">
              {fuelTypes.map((ft) => {
                const active = fuelForm.fuelTypeId === String(ft.id);
                const available = Number(ft.currentPrice) > 0;

                return (
                  <button
                    key={ft.id}
                    type="button"
                    disabled={!available}
                    onClick={() => {
                      setFuel("fuelTypeId", String(ft.id));
                      setFuel(
                        "pricePerLiter",
                        available ? String(ft.currentPrice) : ""
                      );
                    }}
                    className={`relative min-h-[92px] rounded-[22px] border p-4 text-left transition active:scale-[0.98] ${
                      active
                        ? "border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-600/15"
                        : "border-slate-200 bg-white text-slate-900 shadow-sm"
                    } ${!available ? "opacity-45" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold text-base">
                        {ft.label}
                      </span>

                      {active && (
                        <span className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center text-xs">
                          ✓
                        </span>
                      )}
                    </div>

                    <p
                      className={`mt-3 text-sm tabular-nums ${
                        active ? "text-blue-100" : "text-slate-500"
                      }`}
                    >
                      {available
                        ? `${Number(ft.currentPrice).toFixed(2)} บาท/L`
                        : "ยังไม่ตั้งราคา"}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <SectionTitle title="ยอดขาย" />

            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-800">฿</span>

                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={fuelForm.totalAmount}
                  onChange={(e) => setFuel("totalAmount", e.target.value)}
                  placeholder="0"
                  className="min-w-0 w-full bg-transparent text-5xl leading-none font-black tabular-nums outline-none placeholder:text-slate-200"
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="font-bold text-blue-600 tabular-nums">
                  {liters > 0 ? `≈ ${liters.toFixed(2)} L` : "เลือกจำนวนเงิน"}
                </span>

                {fuelPrice > 0 && (
                  <>
                    <span className="text-slate-300">•</span>

                    <span className="text-slate-500 tabular-nums">
                      {fuelPrice.toFixed(2)} บาท/L
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2">
              {QUICK_AMOUNTS.map((amt) => {
                const active = fuelForm.totalAmount === String(amt);

                return (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setFuel("totalAmount", String(amt))}
                    className={`h-12 rounded-2xl border text-base font-bold tabular-nums transition active:scale-[0.98] ${
                      active
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-800"
                    }`}
                  >
                    {amt.toLocaleString("th-TH")}
                  </button>
                );
              })}

              <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={showKeypad}
                onClick={() => { setKeypadAmount(fuelForm.totalAmount); setShowKeypad(true); }}
                className="h-12 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 active:scale-[0.98]"
              >
                อื่นๆ
              </button>
            </div>
          </section>

          <section>
            <SectionTitle title="วิธีชำระเงิน" />

            <PaymentRow
              value={fuelForm.paymentMethod}
              onChange={(v) => setFuel("paymentMethod", v)}
            />
          </section>

          <section>
            <SectionTitle title="หัวจ่าย" />

            <div className="grid grid-cols-4 gap-2">
              {(compatiblePumps.length > 0 ? compatiblePumps.map((pump) => pump.number) : PUMP_OPTIONS).map((p) => {
                const active = selectedPump?.number === p;

                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setFuel("pumpNo", p)}
                    className={`h-12 rounded-2xl border font-bold transition active:scale-[0.98] ${
                      active
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </section>

          {fuelForm.paymentMethod === "credit" && (
            <section>
              <SectionTitle title="ลูกค้าเครดิต" />

              <input
                type="text"
                value={fuelForm.customerName}
                onChange={(e) => setFuel("customerName", e.target.value)}
                placeholder="ชื่อลูกค้า / บริษัท"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500"
              />
            </section>
          )}

          <details className="group rounded-[22px] border border-slate-200 bg-white shadow-sm">
            <summary className="cursor-pointer list-none px-4 py-4 flex items-center justify-between font-semibold text-sm">
              <span>ข้อมูลเพิ่มเติม</span>
              <span className="text-slate-400 group-open:rotate-180 transition">
                ↓
              </span>
            </summary>

            <div className="border-t border-slate-100 p-4 space-y-4">
              <DateRow
                value={fuelForm.date}
                onChange={(v) => setFuel("date", v)}
              />
            </div>
          </details>

          {error && <ErrorBox msg={error} />}

          {showKeypad && (
            <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="keypad-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowKeypad(false); }}>
              <section className="w-full max-w-md rounded-t-[30px] bg-white p-5 shadow-2xl sm:rounded-[30px]">
                <div className="flex items-start justify-between gap-4"><div><h2 id="keypad-title" className="text-xl font-black">กรอกยอดเงิน</h2><p className="mt-1 text-sm text-slate-500">กดยืนยันเพื่อบันทึกขายทันที</p></div><button type="button" onClick={() => setShowKeypad(false)} className="grid size-11 place-items-center rounded-full bg-slate-100 text-xl" aria-label="ปิดแป้นตัวเลข">×</button></div>
                <output className="mt-5 flex min-h-20 items-center rounded-2xl bg-slate-50 px-5 text-4xl font-black tabular-nums text-slate-950" aria-live="polite">฿ {Number(keypadAmount || 0).toLocaleString("th-TH")}</output>
                <div className="mt-4 grid grid-cols-3 gap-2">{["1","2","3","4","5","6","7","8","9","00","0","⌫"].map((key) => <button key={key} type="button" onClick={() => setKeypadAmount((current) => key === "⌫" ? current.slice(0, -1) : current === "0" ? key : `${current}${key}`.replace(/^0+/, ""))} className="min-h-14 rounded-2xl border border-slate-200 bg-white text-xl font-black active:scale-95 active:bg-slate-100" aria-label={key === "⌫" ? "ลบตัวเลข" : key}>{key}</button>)}</div>
                <button type="button" disabled={Number(keypadAmount) <= 0} onClick={() => { const amount = String(Number(keypadAmount)); customSubmitAmount.current = amount; setFuel("totalAmount", amount); setShowKeypad(false); fuelFormRef.current?.requestSubmit(); }} className="mt-4 min-h-14 w-full rounded-2xl bg-blue-600 text-lg font-black text-white shadow-lg shadow-blue-600/20 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none">ยืนยัน ฿{Number(keypadAmount || 0).toLocaleString("th-TH")}</button>
              </section>
            </div>
          )}

          <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur">
            <div className="max-w-lg mx-auto px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="truncate text-slate-500">
                  {selectedFuel?.label ?? "เลือกน้ำมัน"}
                  {liters > 0 ? ` · ${liters.toFixed(2)} L` : ""}
                </span>

                <span className="ml-3 font-black tabular-nums">
                  ฿{fuelAmount.toLocaleString("th-TH")}
                </span>
              </div>

              <button
                type="submit"
                disabled={!canSubmitFuel}
                className="w-full h-14 rounded-2xl bg-blue-600 text-white font-extrabold text-lg shadow-lg shadow-blue-600/15 transition active:scale-[0.99] disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
              >
                {loading
                  ? "กำลังบันทึก..."
                  : fuelAmount > 0
                  ? `บันทึก ฿${fuelAmount.toLocaleString("th-TH")}`
                  : "เลือกจำนวนเงิน"}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <form
          onSubmit={submitProduct}
          className="max-w-lg mx-auto px-4 pt-4 pb-40 space-y-5"
        >
          {/* Search */}
          <section>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                ⌕
              </span>

              <input
                type="search"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="ค้นหาสินค้า..."
                className="w-full h-12 rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm outline-none focus:border-blue-500 shadow-sm"
              />
            </div>
          </section>

          {/* Category pills */}
          <section className="-mx-4">
            <div className="flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide">
              {categories.map((cat) => {
                const active = activeCategory === cat;

                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(cat)}
                    className={`shrink-0 rounded-full border px-4 h-10 text-sm font-semibold transition ${
                      active
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-200 bg-white text-slate-600"
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Product grid */}
          <section>
            <div className="flex items-end justify-between mb-3">
              <div>
                <h2 className="text-base font-extrabold">สินค้า</h2>
                <p className="text-xs text-slate-400">
                  {filteredProducts.length} รายการ
                </p>
              </div>
            </div>

            {filteredProducts.length === 0 ? (
              <div className="rounded-[24px] border border-slate-200 bg-white p-8 text-center">
                <div className="text-4xl">🔎</div>
                <p className="mt-3 font-bold">ไม่พบสินค้า</p>
                <p className="mt-1 text-sm text-slate-400">
                  ลองค้นหาด้วยชื่อหรือหมวดหมู่อื่น
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {filteredProducts.map((p) => {
                  const active = productForm.productId === String(p.id);
                  const soldOut = Number(p.currentStock) <= 0;

                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={soldOut}
                      onClick={() => {
                        setProd("productId", String(p.id));
                        setProd("unitPrice", String(p.currentPrice));
                        setProd("quantity", "1");
                      }}
                      className={`overflow-hidden rounded-[22px] border bg-white text-left transition active:scale-[0.98] ${
                        active
                          ? "border-blue-500 ring-2 ring-blue-100 shadow-md"
                          : "border-slate-200 shadow-sm"
                      } ${soldOut ? "opacity-50" : ""}`}
                    >
                      <div className="relative aspect-[1/1] bg-slate-100 overflow-hidden">
                        {p.image ? (
                          <img
                            src={p.image}
                            alt={p.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-4xl">
                            🛢
                          </div>
                        )}

                        <div className="absolute top-2 left-2">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold backdrop-blur ${
                              soldOut
                                ? "bg-red-500/90 text-white"
                                : "bg-white/90 text-slate-700"
                            }`}
                          >
                            {soldOut
                              ? "หมด"
                              : `เหลือ ${p.currentStock} ${p.unit}`}
                          </span>
                        </div>

                        {active && (
                          <div className="absolute top-2 right-2 h-7 w-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs shadow">
                            ✓
                          </div>
                        )}
                      </div>

                      <div className="p-3">
                        <p className="font-extrabold text-sm leading-5 line-clamp-2 min-h-[40px]">
                          {p.name}
                        </p>

                        <div className="mt-1 flex items-center justify-between gap-2">
                          <span className="text-xs text-slate-400 truncate">
                            {p.size || p.category || "สินค้า"}
                          </span>
                        </div>

                        <p className="mt-2 text-lg font-black text-slate-950 tabular-nums">
                          ฿{Number(p.currentPrice).toLocaleString("th-TH")}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Selected product / mini cart */}
          {selectedProduct && (
            <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex gap-3">
                <div className="h-16 w-16 overflow-hidden rounded-2xl bg-slate-100 shrink-0">
                  {selectedProduct.image ? (
                    <img
                      src={selectedProduct.image}
                      alt={selectedProduct.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-2xl">
                      🛢
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="font-extrabold leading-5 truncate">
                    {selectedProduct.name}
                  </p>

                  <p className="mt-1 text-sm text-slate-400">
                    ฿{Number(productForm.unitPrice || 0).toLocaleString("th-TH")} /{" "}
                    {selectedProduct.unit || "ชิ้น"}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-xs text-slate-400">รวม</p>
                  <p className="text-lg font-black tabular-nums">
                    ฿{productTotal.toLocaleString("th-TH")}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between rounded-2xl bg-slate-50 p-2">
                <span className="pl-2 text-sm font-semibold text-slate-600">
                  จำนวน
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => changeQty(-1)}
                    className="h-10 w-10 rounded-xl border border-slate-200 bg-white text-xl font-bold"
                  >
                    −
                  </button>

                  <input
                    type="number"
                    min="1"
                    max={selectedProduct.currentStock || undefined}
                    value={productForm.quantity}
                    onChange={(e) => setProd("quantity", e.target.value)}
                    className="w-12 bg-transparent text-center text-lg font-black outline-none tabular-nums"
                  />

                  <button
                    type="button"
                    onClick={() => changeQty(1)}
                    className="h-10 w-10 rounded-xl border border-slate-200 bg-white text-xl font-bold"
                  >
                    +
                  </button>
                </div>
              </div>
            </section>
          )}

          <section>
            <SectionTitle title="วิธีชำระเงิน" />

            <PaymentRow
              value={productForm.paymentMethod}
              onChange={(v) => setProd("paymentMethod", v)}
            />
          </section>

          {productForm.paymentMethod === "credit" && (
            <section>
              <SectionTitle title="ลูกค้าเครดิต" />

              <input
                type="text"
                value={productForm.customerName}
                onChange={(e) => setProd("customerName", e.target.value)}
                placeholder="ชื่อลูกค้า / บริษัท"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500"
              />
            </section>
          )}

          <details className="group rounded-[22px] border border-slate-200 bg-white shadow-sm">
            <summary className="cursor-pointer list-none px-4 py-4 flex items-center justify-between font-semibold text-sm">
              <span>ข้อมูลเพิ่มเติม</span>
              <span className="text-slate-400 group-open:rotate-180 transition">
                ↓
              </span>
            </summary>

            <div className="border-t border-slate-100 p-4 space-y-4">
              <DateRow
                value={productForm.date}
                onChange={(v) => setProd("date", v)}
              />
            </div>
          </details>

          {error && <ErrorBox msg={error} />}

          {/* Sticky checkout */}
          <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur">
            <div className="max-w-lg mx-auto px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-700">
                    {selectedProduct?.name ?? "เลือกสินค้า"}
                  </p>

                  <p className="text-xs text-slate-400">
                    {selectedProduct
                      ? `${productForm.quantity} ${selectedProduct.unit || "ชิ้น"}`
                      : "เลือกรายการก่อนชำระเงิน"}
                  </p>
                </div>

                <p className="text-xl font-black tabular-nums">
                  ฿{productTotal.toLocaleString("th-TH")}
                </p>
              </div>

              <button
                type="submit"
                disabled={!canSubmitProduct}
                className="w-full h-14 rounded-2xl bg-blue-600 text-white font-extrabold text-lg shadow-lg shadow-blue-600/15 transition active:scale-[0.99] disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
              >
                {loading
                  ? "กำลังบันทึก..."
                  : selectedProduct
                  ? `ชำระเงิน ฿${productTotal.toLocaleString("th-TH")}`
                  : "เลือกสินค้า"}
              </button>
            </div>
          </div>
        </form>
      )}
    </main>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <p className="mb-2 text-[13px] font-bold text-slate-700">
      {title}
    </p>
  );
}

function PaymentRow({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {PAYMENT_OPTIONS.map((p) => {
        const active = value === p.value;

        return (
          <button
            key={p.value}
            type="button"
            onClick={() => onChange(p.value)}
            className={`min-h-[72px] rounded-[20px] border flex flex-col items-center justify-center gap-1 transition active:scale-[0.98] ${
              active
                ? "border-blue-600 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-700"
            }`}
          >
            <span className="text-lg font-black">{p.icon}</span>
            <span className="text-sm font-bold">{p.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function DateRow({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-semibold text-slate-500">
        วันและเวลา
      </label>

      <input
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500"
      />
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
      {msg}
    </div>
  );
}
