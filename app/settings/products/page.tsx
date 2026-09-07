"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type Product = {
  id: number;
  name: string;
  category: string;
  size: string;
  unit: string;
  currentPrice: number;
  costPrice: number;
  currentStock: number;
  minStock: number;
  image: string | null;
  isActive: boolean;
};

const UNIT_OPTIONS = ["ขวด", "แกลลอน", "ชิ้น", "กระป๋อง", "แพ็ค"];

function displayDate() {
  return new Date().toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmt(n: number) {
  return Number(n || 0).toLocaleString("th-TH", {
    maximumFractionDigits: 0,
  });
}

export default function ProductSettingsPage() {
  const router = useRouter();
  const pathname = usePathname();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ทั้งหมด");

  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [saved, setSaved] = useState<Record<number, boolean>>({});
  const [prices, setPrices] = useState<Record<number, string>>({});
  const [stocks, setStocks] = useState<Record<number, string>>({});

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    category: "",
    size: "",
    unit: "",
    costPrice: "",
    minStock: "",
  });

  const [addForm, setAddForm] = useState({
    name: "",
    category: "",
    size: "",
    unit: "ขวด",
    currentPrice: "",
    costPrice: "",
    currentStock: "",
    minStock: "3",
  });

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [uploadingId, setUploadingId] = useState<number | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/products?all=1")
      .then((r) => r.json())
      .then((data: Product[]) => {
        setProducts(data ?? []);

        const p: Record<number, string> = {};
        const s: Record<number, string> = {};

        (data ?? []).forEach((pr) => {
          p[pr.id] = pr.currentPrice > 0 ? String(pr.currentPrice) : "";
          s[pr.id] = String(pr.currentStock);
        });

        setPrices(p);
        setStocks(s);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    queueMicrotask(load);
  }, []);

  async function saveProduct(id: number) {
    setSaving((v) => ({ ...v, [id]: true }));

    await fetch(`/api/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPrice: Number(prices[id]) || 0,
        currentStock: Number(stocks[id]) || 0,
      }),
    });

    setSaving((v) => ({ ...v, [id]: false }));
    setSaved((v) => ({ ...v, [id]: true }));

    setTimeout(() => {
      setSaved((v) => ({ ...v, [id]: false }));
    }, 2000);

    load();
  }

  async function saveDetail(id: number) {
    await fetch(`/api/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editForm.name,
        category: editForm.category,
        size: editForm.size,
        unit: editForm.unit,
        costPrice: Number(editForm.costPrice) || 0,
        minStock: Number(editForm.minStock) || 3,
      }),
    });

    setEditingId(null);
    load();
  }

  async function toggleActive(p: Product) {
    await fetch(`/api/products/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !p.isActive }),
    });

    load();
  }

  async function deleteProduct(p: Product) {
    if (!confirm(`ลบ "${p.name}" ถาวร?`)) return;

    setDeletingId(p.id);

    const res = await fetch(`/api/products/${p.id}`, {
      method: "DELETE",
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error ?? "ลบไม่สำเร็จ");
    } else {
      load();
    }

    setDeletingId(null);
  }

  async function uploadImage(p: Product, file: File) {
    setUploadingId(p.id);

    const fd = new FormData();
    fd.append("file", file);

    const res = await fetch(`/api/products/${p.id}/image`, {
      method: "POST",
      body: fd,
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error ?? "อัปโหลดไม่สำเร็จ");
    } else {
      load();
    }

    setUploadingId(null);
  }

  async function addProduct(e: React.FormEvent) {
    e.preventDefault();

    if (!addForm.name.trim()) return;

    await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: addForm.name.trim(),
        category: addForm.category.trim(),
        size: addForm.size.trim(),
        unit: addForm.unit,
        currentPrice: Number(addForm.currentPrice) || 0,
        costPrice: Number(addForm.costPrice) || 0,
        currentStock: Number(addForm.currentStock) || 0,
        minStock: Number(addForm.minStock) || 3,
      }),
    });

    setAddForm({
      name: "",
      category: "",
      size: "",
      unit: "ขวด",
      currentPrice: "",
      costPrice: "",
      currentStock: "",
      minStock: "3",
    });

    setShowAdd(false);
    load();
  }

  const activeProducts = products.filter((p) => p.isActive);
  const inactiveProducts = products.filter((p) => !p.isActive);

  const categories = useMemo(() => {
    const values = Array.from(
      new Set(activeProducts.map((p) => p.category || "อื่นๆ"))
    );
    return ["ทั้งหมด", ...values];
  }, [activeProducts]);

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();

    return activeProducts.filter((p) => {
      const matchCategory =
        categoryFilter === "ทั้งหมด" ||
        (p.category || "อื่นๆ") === categoryFilter;

      const matchQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.category || "").toLowerCase().includes(q) ||
        (p.size || "").toLowerCase().includes(q);

      return matchCategory && matchQuery;
    });
  }, [activeProducts, query, categoryFilter]);

  const lowCount = activeProducts.filter(
    (p) => p.currentStock <= p.minStock
  ).length;

  const totalUnits = activeProducts.reduce(
    (sum, p) => sum + Number(p.currentStock || 0),
    0
  );

  const totalValue = activeProducts.reduce(
    (sum, p) =>
      sum + Number(p.currentStock || 0) * Number(p.costPrice || 0),
    0
  );

  return (
    <main className="min-h-screen bg-[#eef4fb] text-slate-900">
      <div className="mx-auto min-h-screen w-full max-w-[480px] bg-[#f8fbff] shadow-[0_0_45px_rgba(15,23,42,0.08)] md:my-5 md:min-h-[calc(100vh-40px)] md:rounded-[34px] md:overflow-hidden">
        {/* APP HEADER */}
        <header className="bg-white px-5 pt-5 pb-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.push("/dashboard")}
              className="flex items-center gap-2"
            >
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
                {lowCount > 0 && (
                  <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold">
                📅 {displayDate()}
              </div>
            </div>
          </div>
        </header>

        {/* TITLE */}
        <section className="px-5 pt-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">จัดการสินค้าในร้าน</p>
              <h1 className="mt-1 text-[32px] font-black tracking-tight">
                สินค้า
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                รูป ราคา ต้นทุน และจำนวนคงเหลือ
              </p>
            </div>

            <button
              onClick={() => setShowAdd(true)}
              className="mb-1 h-11 rounded-2xl bg-blue-600 px-4 text-sm font-bold text-white shadow-lg shadow-blue-600/20"
            >
              + เพิ่มสินค้า
            </button>
          </div>
        </section>

        {/* SUMMARY */}
        <section className="grid grid-cols-3 gap-3 px-5 pt-5">
          <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] text-slate-400">สินค้า</p>
            <p className="mt-1 text-2xl font-black">{activeProducts.length}</p>
          </div>

          <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] text-slate-400">จำนวนรวม</p>
            <p className="mt-1 text-2xl font-black">{fmt(totalUnits)}</p>
          </div>

          <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] text-slate-400">สต็อกต่ำ</p>
            <p className={`mt-1 text-2xl font-black ${lowCount > 0 ? "text-red-600" : ""}`}>
              {lowCount}
            </p>
          </div>
        </section>

        {/* STOCK VALUE */}
        <section className="px-5 pt-4">
          <div className="rounded-[24px] bg-gradient-to-br from-blue-600 to-blue-700 p-5 text-white shadow-xl shadow-blue-600/20">
            <p className="text-sm text-blue-100">มูลค่าสินค้าโดยต้นทุน</p>
            <p className="mt-1 text-[34px] font-black tabular-nums">
              ฿{fmt(totalValue)}
            </p>
            <p className="mt-2 text-xs text-blue-100">
              คำนวณจากต้นทุน × จำนวนคงเหลือ
            </p>
          </div>
        </section>

        {/* SEARCH */}
        <section className="px-5 pt-5">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
              ⌕
            </span>

            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาสินค้า..."
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm outline-none focus:border-blue-500 shadow-sm"
            />
          </div>
        </section>

        {/* CATEGORY PILLS */}
        <section className="pt-3">
          <div className="flex gap-2 overflow-x-auto px-5 pb-1">
            {categories.map((cat) => {
              const active = categoryFilter === cat;

              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`h-10 shrink-0 rounded-full border px-4 text-sm font-semibold ${
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

        {/* PRODUCTS */}
        <section className="px-5 pt-5 pb-28">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-black">รายการสินค้า</h2>
            <span className="text-xs text-slate-400">
              {filteredProducts.length} รายการ
            </span>
          </div>

          {loading ? (
            <div className="rounded-[24px] bg-white p-10 text-center text-slate-300">
              กำลังโหลด...
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="rounded-[24px] border border-slate-200 bg-white p-10 text-center">
              <div className="text-4xl">📦</div>
              <p className="mt-3 font-bold">ไม่พบสินค้า</p>
              <p className="mt-1 text-sm text-slate-400">
                ลองค้นหาหรือเพิ่มสินค้าใหม่
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredProducts.map((p) => {
                const profit =
                  p.currentPrice > 0 && p.costPrice > 0
                    ? p.currentPrice - p.costPrice
                    : null;

                const isLow = p.currentStock <= p.minStock;
                const isEditing = editingId === p.id;

                return (
                  <article
                    key={p.id}
                    className={`overflow-hidden rounded-[26px] border bg-white shadow-sm ${
                      isLow ? "border-red-200" : "border-slate-200"
                    }`}
                  >
                    {/* PRODUCT TOP */}
                    <div className="p-4">
                      <div className="flex gap-3">
                        <label className="relative h-20 w-20 shrink-0 cursor-pointer overflow-hidden rounded-2xl bg-slate-100">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) uploadImage(p, f);
                              e.target.value = "";
                            }}
                          />

                          {p.image ? (
                            <img
                              src={p.image}
                              alt={p.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-2xl text-slate-400">
                              {uploadingId === p.id ? "..." : "📷"}
                            </div>
                          )}

                          <div className="absolute bottom-1 right-1 rounded-full bg-white/90 px-1.5 py-0.5 text-[9px] font-bold text-blue-600 shadow">
                            รูป
                          </div>
                        </label>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="line-clamp-2 text-base font-black leading-5">
                                {p.name}
                              </p>

                              <p className="mt-1 text-xs text-slate-400">
                                {[p.category, p.size].filter(Boolean).join(" · ") || "สินค้า"}
                              </p>
                            </div>

                            {isLow && (
                              <span className="shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-bold text-red-600">
                                สต็อกต่ำ
                              </span>
                            )}
                          </div>

                          <div className="mt-3 flex items-center gap-2 text-xs">
                            {p.costPrice > 0 && (
                              <span className="rounded-full bg-slate-50 px-2.5 py-1 text-slate-500">
                                ทุน ฿{fmt(p.costPrice)}
                              </span>
                            )}

                            {profit !== null && (
                              <span
                                className={`rounded-full px-2.5 py-1 font-bold ${
                                  profit >= 0
                                    ? "bg-emerald-50 text-emerald-600"
                                    : "bg-red-50 text-red-600"
                                }`}
                              >
                                กำไร {profit >= 0 ? "+" : ""}
                                {fmt(profit)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* PRICE/STOCK */}
                      <div className="mt-4 grid grid-cols-[1fr_1fr_auto] gap-2">
                        <label>
                          <span className="mb-1 block text-[10px] font-bold text-slate-400">
                            ราคาขาย
                          </span>

                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                              ฿
                            </span>
                            <input
                              type="number"
                              inputMode="decimal"
                              value={prices[p.id] ?? ""}
                              onChange={(e) =>
                                setPrices((v) => ({
                                  ...v,
                                  [p.id]: e.target.value,
                                }))
                              }
                              placeholder="0"
                              className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-2 text-center text-lg font-black outline-none focus:border-blue-500 focus:bg-white"
                            />
                          </div>
                        </label>

                        <label>
                          <span
                            className={`mb-1 block text-[10px] font-bold ${
                              isLow ? "text-red-500" : "text-slate-400"
                            }`}
                          >
                            สต็อก ({p.unit})
                          </span>

                          <input
                            type="number"
                            inputMode="numeric"
                            value={stocks[p.id] ?? ""}
                            onChange={(e) =>
                              setStocks((v) => ({
                                ...v,
                                [p.id]: e.target.value,
                              }))
                            }
                            placeholder="0"
                            className={`h-12 w-full rounded-xl border bg-slate-50 px-2 text-center text-lg font-black outline-none focus:bg-white ${
                              isLow
                                ? "border-red-200 focus:border-red-500"
                                : "border-slate-200 focus:border-blue-500"
                            }`}
                          />
                        </label>

                        <button
                          onClick={() => saveProduct(p.id)}
                          disabled={saving[p.id]}
                          className={`mt-[18px] h-12 rounded-xl px-4 text-sm font-bold ${
                            saved[p.id]
                              ? "bg-emerald-50 text-emerald-600"
                              : "bg-blue-600 text-white shadow-lg shadow-blue-600/15"
                          }`}
                        >
                          {saving[p.id] ? "..." : saved[p.id] ? "✓" : "บันทึก"}
                        </button>
                      </div>

                      {/* ACTIONS */}
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (isEditing) {
                              setEditingId(null);
                              return;
                            }

                            setEditingId(p.id);
                            setEditForm({
                              name: p.name,
                              category: p.category,
                              size: p.size,
                              unit: p.unit,
                              costPrice: String(p.costPrice),
                              minStock: String(p.minStock),
                            });
                          }}
                          className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-600"
                        >
                          {isEditing ? "ปิดรายละเอียด" : "แก้รายละเอียด"}
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleActive(p)}
                          className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500"
                        >
                          ซ่อน
                        </button>

                        <button
                          type="button"
                          onClick={() => deleteProduct(p)}
                          disabled={deletingId === p.id}
                          className="ml-auto px-2 text-xs font-semibold text-red-400"
                        >
                          {deletingId === p.id ? "..." : "ลบ"}
                        </button>
                      </div>
                    </div>

                    {/* EDIT PANEL */}
                    {isEditing && (
                      <div className="border-t border-slate-100 bg-slate-50 p-4">
                        <p className="mb-3 text-xs font-black text-slate-600">
                          รายละเอียดสินค้า
                        </p>

                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={editForm.name}
                            onChange={(e) =>
                              setEditForm((f) => ({
                                ...f,
                                name: e.target.value,
                              }))
                            }
                            placeholder="ชื่อสินค้า"
                            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500"
                          />

                          <input
                            type="text"
                            value={editForm.category}
                            onChange={(e) =>
                              setEditForm((f) => ({
                                ...f,
                                category: e.target.value,
                              }))
                            }
                            placeholder="หมวด"
                            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500"
                          />
                        </div>

                        <div className="mt-2 grid grid-cols-3 gap-2">
                          <input
                            type="text"
                            value={editForm.size}
                            onChange={(e) =>
                              setEditForm((f) => ({
                                ...f,
                                size: e.target.value,
                              }))
                            }
                            placeholder="ขนาด"
                            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500"
                          />

                          <select
                            value={editForm.unit}
                            onChange={(e) =>
                              setEditForm((f) => ({
                                ...f,
                                unit: e.target.value,
                              }))
                            }
                            className="h-11 rounded-xl border border-slate-200 bg-white px-2 text-sm outline-none focus:border-blue-500"
                          >
                            {UNIT_OPTIONS.map((u) => (
                              <option key={u}>{u}</option>
                            ))}
                          </select>

                          <input
                            type="number"
                            value={editForm.minStock}
                            onChange={(e) =>
                              setEditForm((f) => ({
                                ...f,
                                minStock: e.target.value,
                              }))
                            }
                            placeholder="แจ้งเตือน"
                            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500"
                          />
                        </div>

                        <input
                          type="number"
                          value={editForm.costPrice}
                          onChange={(e) =>
                            setEditForm((f) => ({
                              ...f,
                              costPrice: e.target.value,
                            }))
                          }
                          placeholder="ต้นทุน (บาท)"
                          className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500"
                        />

                        <button
                          type="button"
                          onClick={() => saveDetail(p.id)}
                          className="mt-3 h-11 w-full rounded-xl bg-slate-900 text-sm font-bold text-white"
                        >
                          บันทึกรายละเอียด
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {inactiveProducts.length > 0 && (
            <details className="mt-6 rounded-[24px] border border-slate-200 bg-white shadow-sm">
              <summary className="cursor-pointer list-none p-4 text-sm font-black text-slate-600">
                ซ่อนอยู่ ({inactiveProducts.length})
              </summary>

              <div className="border-t border-slate-100 divide-y divide-slate-100">
                {inactiveProducts.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 p-4 opacity-70">
                    {p.image ? (
                      <img
                        src={p.image}
                        alt={p.name}
                        className="h-12 w-12 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
                        📦
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{p.name}</p>
                      <p className="text-xs text-slate-400">{p.category}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleActive(p)}
                      className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-600"
                    >
                      เปิด
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteProduct(p)}
                      disabled={deletingId === p.id}
                      className="text-xs font-semibold text-red-400"
                    >
                      ลบ
                    </button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>

        {/* ADD PRODUCT BOTTOM SHEET */}
        {showAdd && (
          <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/35 px-3">
            <div className="max-h-[92vh] w-full max-w-[480px] overflow-y-auto rounded-t-[30px] bg-white p-5 shadow-2xl">
              <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200" />

              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-black">เพิ่มสินค้าใหม่</h2>
                  <p className="mt-1 text-xs text-slate-400">
                    เพิ่มข้อมูลพื้นฐานก่อน แล้วค่อยใส่รูปภายหลังได้
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="h-9 w-9 rounded-full bg-slate-100 text-slate-500"
                >
                  ×
                </button>
              </div>

              <form onSubmit={addProduct} className="mt-5 space-y-3">
                <input
                  type="text"
                  value={addForm.name}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="ชื่อสินค้า"
                  required
                  className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm outline-none focus:border-blue-500"
                />

                <input
                  type="text"
                  value={addForm.category}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, category: e.target.value }))
                  }
                  placeholder="หมวด เช่น 2T, 4T, เฟืองท้าย"
                  className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm outline-none focus:border-blue-500"
                />

                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={addForm.size}
                    onChange={(e) =>
                      setAddForm((f) => ({ ...f, size: e.target.value }))
                    }
                    placeholder="ขนาด เช่น 1L"
                    className="h-12 rounded-2xl border border-slate-200 px-4 text-sm outline-none focus:border-blue-500"
                  />

                  <select
                    value={addForm.unit}
                    onChange={(e) =>
                      setAddForm((f) => ({ ...f, unit: e.target.value }))
                    }
                    className="h-12 rounded-2xl border border-slate-200 px-4 text-sm outline-none focus:border-blue-500"
                  >
                    {UNIT_OPTIONS.map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    value={addForm.currentPrice}
                    onChange={(e) =>
                      setAddForm((f) => ({
                        ...f,
                        currentPrice: e.target.value,
                      }))
                    }
                    placeholder="ราคาขาย"
                    className="h-12 rounded-2xl border border-slate-200 px-4 text-sm outline-none focus:border-blue-500"
                  />

                  <input
                    type="number"
                    value={addForm.costPrice}
                    onChange={(e) =>
                      setAddForm((f) => ({
                        ...f,
                        costPrice: e.target.value,
                      }))
                    }
                    placeholder="ต้นทุน"
                    className="h-12 rounded-2xl border border-slate-200 px-4 text-sm outline-none focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    value={addForm.currentStock}
                    onChange={(e) =>
                      setAddForm((f) => ({
                        ...f,
                        currentStock: e.target.value,
                      }))
                    }
                    placeholder="สต็อกเริ่มต้น"
                    className="h-12 rounded-2xl border border-slate-200 px-4 text-sm outline-none focus:border-blue-500"
                  />

                  <input
                    type="number"
                    value={addForm.minStock}
                    onChange={(e) =>
                      setAddForm((f) => ({
                        ...f,
                        minStock: e.target.value,
                      }))
                    }
                    placeholder="แจ้งเตือนเมื่อ ≤"
                    className="h-12 rounded-2xl border border-slate-200 px-4 text-sm outline-none focus:border-blue-500"
                  />
                </div>

                <button
                  type="submit"
                  className="h-14 w-full rounded-2xl bg-blue-600 text-base font-black text-white shadow-lg shadow-blue-600/20"
                >
                  เพิ่มสินค้า
                </button>
              </form>
            </div>
          </div>
        )}

        {/* BOTTOM NAV */}
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
      </div>
    </main>
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
