"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type FuelType = { id: number; name: string; label: string; currentPrice: number };
type Product = { id: number; name: string; category: string; size: string; unit: string; currentPrice: number; currentStock: number; image: string | null };

const PUMP_OPTIONS = ["1", "2", "3", "4"];
const PAYMENT_OPTIONS = [
  { value: "cash", label: "เงินสด" },
  { value: "transfer", label: "โอน" },
  { value: "credit", label: "เครดิต" },
];
const SELLER_KEY = "fuel_last_seller";

const PAYMENT_COLOR: Record<string, string> = {
  cash: "bg-green-600",
  transfer: "bg-blue-600",
  credit: "bg-orange-500",
};

export default function NewSalePage() {
  const router = useRouter();
  const [saleType, setSaleType] = useState<"fuel" | "product">("fuel");
  const [fuelTypes, setFuelTypes] = useState<FuelType[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [successData, setSuccessData] = useState({ amount: 0, label: "" });

  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; })();
  const nowDT = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}T${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; };

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
    fetch("/api/fuel-types")
      .then((r) => r.json())
      .then((data: FuelType[]) => {
        setFuelTypes(data);
        if (data.length > 0) {
          const ft = data[0];
          setFuelForm((f) => ({ ...f, fuelTypeId: String(ft.id), pricePerLiter: ft.currentPrice > 0 ? String(ft.currentPrice) : "" }));
        }
      });
    fetch("/api/products")
      .then((r) => r.json())
      .then((data: Product[]) => {
        setProducts(data);
        if (data.length > 0) {
          setProductForm((f) => ({ ...f, productId: String(data[0].id), unitPrice: String(data[0].currentPrice) }));
        }
      });
    const saved = localStorage.getItem(SELLER_KEY);
    if (saved) {
      setFuelForm((f) => ({ ...f, sellerName: saved }));
      setProductForm((f) => ({ ...f, sellerName: saved }));
    }
  }, []);

  function setFuel(field: string, value: string) {
    setFuelForm((f) => ({ ...f, [field]: value }));
    setError("");
  }
  function setProd(field: string, value: string) {
    setProductForm((f) => ({ ...f, [field]: value }));
    setError("");
  }

  const fuelPrice = Number(fuelForm.pricePerLiter || 0);
  const fuelAmount = Number(fuelForm.totalAmount || 0);
  const liters = fuelPrice > 0 && fuelAmount > 0 ? fuelAmount / fuelPrice : 0;

  const selectedProduct = products.find((p) => String(p.id) === productForm.productId);
  const productTotal = Number(productForm.quantity || 0) * Number(productForm.unitPrice || 0);

  async function submitFuel(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!fuelForm.sellerName.trim()) return setError("กรอกชื่อคนขาย");
    if (!fuelForm.fuelTypeId) return setError("เลือกชนิดน้ำมัน");
    if (!fuelForm.totalAmount || fuelAmount <= 0) return setError("กรอกยอดเงิน");
    if (!fuelForm.pricePerLiter || fuelPrice <= 0) return setError("กรอกราคาต่อลิตร");
    if (fuelForm.paymentMethod === "credit" && !fuelForm.customerName.trim()) return setError("กรอกชื่อลูกค้าเครดิต");

    setLoading(true);
    localStorage.setItem(SELLER_KEY, fuelForm.sellerName.trim());
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fuelForm, pumpNo: `หัวจ่าย ${fuelForm.pumpNo}`, date: fuelForm.date + "+07:00" }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "บันทึกไม่สำเร็จ");
      setSuccessData({ amount: fuelAmount, label: `${liters.toFixed(2)} ลิตร` });
      setSuccess(true);
      setTimeout(() => router.push("/dashboard"), 1500);
    } catch {
      setError("เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  async function submitProduct(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!productForm.sellerName.trim()) return setError("กรอกชื่อคนขาย");
    if (!productForm.productId) return setError("เลือกสินค้า");
    if (!productForm.quantity || Number(productForm.quantity) <= 0) return setError("กรอกจำนวน");
    if (!productForm.unitPrice || Number(productForm.unitPrice) <= 0) return setError("กรอกราคา");
    if (productForm.paymentMethod === "credit" && !productForm.customerName.trim()) return setError("กรอกชื่อลูกค้าเครดิต");

    setLoading(true);
    localStorage.setItem(SELLER_KEY, productForm.sellerName.trim());
    try {
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
      if (!res.ok) return setError(data.error ?? "บันทึกไม่สำเร็จ");
      setSuccessData({ amount: productTotal, label: `${selectedProduct?.name ?? ""} ${productForm.quantity} ${selectedProduct?.unit ?? ""}` });
      setSuccess(true);
      setTimeout(() => router.push("/dashboard"), 1500);
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
          <p className="text-2xl font-bold text-green-700">{successData.amount.toLocaleString("th-TH")} บาท</p>
          <p className="text-gray-500">{successData.label}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.push("/dashboard")} className="text-gray-500 text-xl w-8">←</button>
        <h1 className="text-base font-bold text-gray-800">บันทึกยอดขาย</h1>
      </div>

      {/* Type selector */}
      <div className="max-w-lg mx-auto px-4 pt-4">
        <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1 rounded-2xl">
          <button
            type="button"
            onClick={() => { setSaleType("fuel"); setError(""); }}
            className={`py-2.5 rounded-xl text-sm font-bold transition-all ${saleType === "fuel" ? "bg-white shadow text-blue-600" : "text-gray-500"}`}
          >
            ⛽ ขายน้ำมัน
          </button>
          <button
            type="button"
            onClick={() => { setSaleType("product"); setError(""); }}
            className={`py-2.5 rounded-xl text-sm font-bold transition-all ${saleType === "product" ? "bg-white shadow text-blue-600" : "text-gray-500"}`}
          >
            🛒 ขายสินค้า
          </button>
        </div>
      </div>

      {/* Fuel form */}
      {saleType === "fuel" && (
        <form onSubmit={submitFuel} className="max-w-lg mx-auto p-4 space-y-5">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">ชนิดน้ำมัน</p>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(fuelTypes.length, 4)}, 1fr)` }}>
              {fuelTypes.map((ft) => (
                <button
                  key={ft.id}
                  type="button"
                  onClick={() => { setFuel("fuelTypeId", String(ft.id)); setFuel("pricePerLiter", ft.currentPrice > 0 ? String(ft.currentPrice) : ""); }}
                  className={`py-4 rounded-2xl font-bold text-sm transition-all ${fuelForm.fuelTypeId === String(ft.id) ? "bg-blue-600 text-white shadow-md" : "bg-white text-gray-700 border-2 border-gray-200"}`}
                >
                  {ft.label}
                  <span className={`block text-xs mt-0.5 font-normal ${fuelForm.fuelTypeId === String(ft.id) ? "text-blue-200" : "text-gray-400"}`}>
                    {ft.currentPrice > 0 ? `${ft.currentPrice} บ/ล` : "ยังไม่ตั้งราคา"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">หัวจ่าย</p>
            <div className="grid grid-cols-4 gap-2">
              {PUMP_OPTIONS.map((p) => (
                <button key={p} type="button" onClick={() => setFuel("pumpNo", p)}
                  className={`py-3 rounded-xl font-bold text-lg transition-all ${fuelForm.pumpNo === p ? "bg-gray-800 text-white" : "bg-white text-gray-700 border-2 border-gray-200"}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">ยอดเงิน (บาท)</p>
            <div className="grid grid-cols-4 gap-2 mb-2">
              {[50, 60, 70, 80, 100, 150, 200, 300, 500, 1000].map((amt) => (
                <button key={amt} type="button" onClick={() => setFuel("totalAmount", String(amt))}
                  className={`py-3 rounded-xl font-bold text-base transition-all ${fuelForm.totalAmount === String(amt) ? "bg-blue-600 text-white" : "bg-white text-gray-700 border-2 border-gray-200 active:bg-gray-100"}`}
                >
                  {amt}
                </button>
              ))}
              <button type="button" onClick={() => setFuel("totalAmount", "")}
                className={`py-3 rounded-xl font-bold text-sm transition-all col-span-2 ${fuelForm.totalAmount !== "" && !["50","60","70","80","100","150","200","300","500","1000"].includes(fuelForm.totalAmount) ? "bg-gray-700 text-white" : "bg-white text-gray-500 border-2 border-gray-200"}`}
              >
                อื่นๆ
              </button>
            </div>
            <input type="number" inputMode="numeric" value={fuelForm.totalAmount} onChange={(e) => setFuel("totalAmount", e.target.value)}
              placeholder="กรอกยอดเอง" className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-3xl font-bold text-center focus:outline-none focus:border-blue-500" required />
            {liters > 0 && <p className="text-center text-sm text-gray-400 mt-1">= {liters.toFixed(2)} ลิตร</p>}
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">ราคาต่อลิตร</p>
            <input type="number" step="0.01" inputMode="decimal" value={fuelForm.pricePerLiter} onChange={(e) => setFuel("pricePerLiter", e.target.value)}
              placeholder="0.00" className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-base font-mono focus:outline-none focus:border-blue-500" required />
          </div>

          <PaymentRow value={fuelForm.paymentMethod} onChange={(v) => setFuel("paymentMethod", v)} />
          {fuelForm.paymentMethod === "credit" && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">ชื่อลูกค้า</p>
              <input type="text" value={fuelForm.customerName} onChange={(e) => setFuel("customerName", e.target.value)}
                placeholder="ชื่อลูกค้า / บริษัท" className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 text-base focus:outline-none focus:border-blue-500" />
            </div>
          )}

          <SellerRow value={fuelForm.sellerName} onChange={(v) => setFuel("sellerName", v)} />
          <DateRow value={fuelForm.date} onChange={(v) => setFuel("date", v)} />
          {error && <ErrorBox msg={error} />}
          <SubmitBtn loading={loading} />
        </form>
      )}

      {/* Product form */}
      {saleType === "product" && (
        <form onSubmit={submitProduct} className="max-w-lg mx-auto p-4 space-y-5">
          {products.length === 0 ? (
            <div className="text-center py-12 text-gray-400 space-y-2">
              <p className="text-4xl">📦</p>
              <p className="text-sm">ยังไม่มีสินค้า</p>
              <button type="button" onClick={() => router.push("/settings/products")}
                className="text-blue-600 text-sm underline">เพิ่มสินค้าใน Settings</button>
            </div>
          ) : (
            <>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">สินค้า</p>
                {(() => {
                    const byCat: Record<string, typeof products> = {};
                    for (const p of products) {
                      const cat = p.category || "อื่นๆ";
                      if (!byCat[cat]) byCat[cat] = [];
                      byCat[cat].push(p);
                    }
                    return Object.entries(byCat).map(([cat, items]) => (
                      <div key={cat}>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mt-3 mb-1">{cat}</p>
                        <div className="space-y-1.5">
                          {items.map((p) => (
                            <button key={p.id} type="button"
                              onClick={() => { setProd("productId", String(p.id)); setProd("unitPrice", String(p.currentPrice)); }}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl border-2 transition-all ${productForm.productId === String(p.id) ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white"}`}
                            >
                              {p.image ? (
                                <img src={p.image} alt={p.name} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
                              ) : (
                                <div className="w-10 h-10 rounded-xl bg-gray-100 flex-shrink-0 flex items-center justify-center text-lg">🛢</div>
                              )}
                              <div className="text-left flex-1 min-w-0">
                                <p className={`font-bold text-sm ${productForm.productId === String(p.id) ? "text-blue-700" : "text-gray-800"}`}>
                                  {p.name}
                                  {p.size && <span className="font-normal text-xs ml-1 opacity-60">{p.size}</span>}
                                </p>
                                <p className="text-xs text-gray-400">คงเหลือ {p.currentStock} {p.unit}</p>
                              </div>
                              <span className={`text-sm font-semibold flex-shrink-0 ${productForm.productId === String(p.id) ? "text-blue-600" : "text-gray-500"}`}>
                                {p.currentPrice > 0 ? `${p.currentPrice} บ` : "—"}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">จำนวน ({selectedProduct?.unit ?? "ชิ้น"})</p>
                  <input type="number" inputMode="numeric" min="1" value={productForm.quantity} onChange={(e) => setProd("quantity", e.target.value)}
                    className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 text-xl font-bold text-center focus:outline-none focus:border-blue-500" required />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">ราคา/หน่วย (บาท)</p>
                  <input type="number" inputMode="numeric" value={productForm.unitPrice} onChange={(e) => setProd("unitPrice", e.target.value)}
                    placeholder="0" className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 text-xl font-bold text-center focus:outline-none focus:border-blue-500" required />
                </div>
              </div>
              {productTotal > 0 && (
                <div className="bg-blue-50 rounded-2xl p-4 text-center">
                  <p className="text-xs text-blue-400 mb-1">ยอดรวม</p>
                  <p className="text-3xl font-bold text-blue-700">{productTotal.toLocaleString("th-TH")} บาท</p>
                </div>
              )}

              <PaymentRow value={productForm.paymentMethod} onChange={(v) => setProd("paymentMethod", v)} />
              {productForm.paymentMethod === "credit" && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">ชื่อลูกค้า</p>
                  <input type="text" value={productForm.customerName} onChange={(e) => setProd("customerName", e.target.value)}
                    placeholder="ชื่อลูกค้า / บริษัท" className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 text-base focus:outline-none focus:border-blue-500" />
                </div>
              )}

              <SellerRow value={productForm.sellerName} onChange={(v) => setProd("sellerName", v)} />
              <DateRow value={productForm.date} onChange={(v) => setProd("date", v)} />
              {error && <ErrorBox msg={error} />}
              <SubmitBtn loading={loading} />
            </>
          )}
        </form>
      )}
    </div>
  );
}

function PaymentRow({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">วิธีจ่าย</p>
      <div className="grid grid-cols-3 gap-2">
        {PAYMENT_OPTIONS.map((p) => (
          <button key={p.value} type="button" onClick={() => onChange(p.value)}
            className={`py-3 rounded-xl font-semibold text-sm transition-all ${value === p.value ? `${PAYMENT_COLOR[p.value]} text-white` : "bg-white text-gray-700 border-2 border-gray-200"}`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SellerRow({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">คนขาย</p>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder="ชื่อคนขาย" className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 text-base focus:outline-none focus:border-blue-500" required />
    </div>
  );
}

function DateRow({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const display = value
    ? new Date(value).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "";
  return (
    <details className="text-sm">
      <summary className="text-gray-400 cursor-pointer select-none">เวลา: {display}</summary>
      <input type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full border-2 border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500" />
    </details>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{msg}</div>;
}

function SubmitBtn({ loading }: { loading: boolean }) {
  return (
    <button type="submit" disabled={loading}
      className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-4 rounded-2xl text-xl transition-colors">
      {loading ? "..." : "บันทึก"}
    </button>
  );
}
