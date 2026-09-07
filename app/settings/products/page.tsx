"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Product = {
  id: number; name: string; category: string; size: string; unit: string;
  currentPrice: number; costPrice: number; currentStock: number; minStock: number;
  image: string | null; isActive: boolean;
};

const UNIT_OPTIONS = ["ขวด", "แกลลอน", "ชิ้น", "กระป๋อง", "แพ็ค"];

export default function ProductSettingsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  // per-product save state
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [saved, setSaved] = useState<Record<number, boolean>>({});
  const [prices, setPrices] = useState<Record<number, string>>({});
  const [stocks, setStocks] = useState<Record<number, string>>({});

  // edit detail state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: "", category: "", size: "", unit: "", costPrice: "", minStock: "" });

  // add form
  const [addForm, setAddForm] = useState({ name: "", category: "", size: "", unit: "ขวด", currentPrice: "", costPrice: "", currentStock: "", minStock: "3" });

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
  useEffect(() => { queueMicrotask(load); }, []);

  async function saveProduct(id: number) {
    setSaving((v) => ({ ...v, [id]: true }));
    await fetch(`/api/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPrice: Number(prices[id]) || 0, currentStock: Number(stocks[id]) || 0 }),
    });
    setSaving((v) => ({ ...v, [id]: false }));
    setSaved((v) => ({ ...v, [id]: true }));
    setTimeout(() => setSaved((v) => ({ ...v, [id]: false })), 2000);
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
    const res = await fetch(`/api/products/${p.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) alert(data.error ?? "ลบไม่สำเร็จ");
    else load();
    setDeletingId(null);
  }

  async function uploadImage(p: Product, file: File) {
    setUploadingId(p.id);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/products/${p.id}/image`, { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) alert(data.error ?? "อัปโหลดไม่สำเร็จ");
    else load();
    setUploadingId(null);
  }

  async function addProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!addForm.name.trim()) return;
    await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: addForm.name.trim(), category: addForm.category.trim(), size: addForm.size.trim(),
        unit: addForm.unit, currentPrice: Number(addForm.currentPrice) || 0,
        costPrice: Number(addForm.costPrice) || 0, currentStock: Number(addForm.currentStock) || 0,
        minStock: Number(addForm.minStock) || 3,
      }),
    });
    setAddForm({ name: "", category: "", size: "", unit: "ขวด", currentPrice: "", costPrice: "", currentStock: "", minStock: "3" });
    setShowAdd(false);
    load();
  }

  const activeProducts = products.filter((p) => p.isActive);
  const inactiveProducts = products.filter((p) => !p.isActive);

  // group active by category
  const byCategory: Record<string, Product[]> = {};
  for (const p of activeProducts) {
    const cat = p.category || "อื่นๆ";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(p);
  }

  return (
    <>
    <div className="min-h-screen bg-slate-100">
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard")} className="text-gray-500 text-xl w-8">←</button>
          <h1 className="text-base font-bold text-gray-900">จัดการสินค้า</h1>
        </div>
        <button onClick={() => setShowAdd((v) => !v)}
          className="bg-purple-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-purple-700">
          {showAdd ? "ยกเลิก" : "+ เพิ่มสินค้า"}
        </button>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-3">
        <p className="text-xs text-gray-400 px-1">แตะ 📷 เพื่อใส่รูป · กด + − เพื่ออัปเดตสต๊อก</p>

        {/* Add form */}
        {showAdd && (
          <form onSubmit={addProduct} className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
            <p className="text-sm font-bold text-gray-700">เพิ่มสินค้าใหม่</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-400 mb-1">ชื่อสินค้า</p>
                <input type="text" value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="ชื่อสินค้า" required
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500" />
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">หมวด</p>
                <input type="text" value={addForm.category} onChange={(e) => setAddForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="2T, 4T, เฟืองท้าย"
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-gray-400 mb-1">ขนาด</p>
                <input type="text" value={addForm.size} onChange={(e) => setAddForm((f) => ({ ...f, size: e.target.value }))}
                  placeholder="1L"
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500" />
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">หน่วย</p>
                <select value={addForm.unit} onChange={(e) => setAddForm((f) => ({ ...f, unit: e.target.value }))}
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500">
                  {UNIT_OPTIONS.map((u) => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">สต๊อก</p>
                <input type="number" value={addForm.currentStock} onChange={(e) => setAddForm((f) => ({ ...f, currentStock: e.target.value }))}
                  placeholder="0"
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-gray-400 mb-1">ราคาขาย (฿)</p>
                <input type="number" value={addForm.currentPrice} onChange={(e) => setAddForm((f) => ({ ...f, currentPrice: e.target.value }))}
                  placeholder="0"
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500" />
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">ต้นทุน (฿)</p>
                <input type="number" value={addForm.costPrice} onChange={(e) => setAddForm((f) => ({ ...f, costPrice: e.target.value }))}
                  placeholder="0"
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500" />
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">แจ้งเตือน ≤</p>
                <input type="number" value={addForm.minStock} onChange={(e) => setAddForm((f) => ({ ...f, minStock: e.target.value }))}
                  placeholder="3"
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500" />
              </div>
            </div>
            <button type="submit" className="w-full bg-purple-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-purple-700">
              เพิ่ม
            </button>
          </form>
        )}

        {loading ? (
          <div className="text-center py-20 text-gray-300 text-4xl animate-pulse">...</div>
        ) : (
          <>
            {/* Active products grouped by category */}
            {Object.entries(byCategory).map(([cat, items]) => (
              <div key={cat}>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide px-1 mb-2">{cat}</p>
                <div className="space-y-3">
                  {items.map((p) => {
                    const profit = p.currentPrice > 0 && p.costPrice > 0 ? p.currentPrice - p.costPrice : null;
                    const isLow = p.currentStock <= p.minStock;
                    const isEditing = editingId === p.id;
                    return (
                      <div key={p.id} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
                        {/* Row 1: image + name + actions */}
                        <div className="flex items-center gap-3">
                          <label className="flex-shrink-0 cursor-pointer">
                            <input type="file" accept="image/*" className="hidden"
                              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(p, f); e.target.value = ""; }} />
                            {p.image ? (
                              <img src={p.image} alt={p.name} className="w-14 h-14 rounded-xl object-cover border border-gray-200" />
                            ) : (
                              <div className="w-14 h-14 rounded-xl bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-xl">
                                {uploadingId === p.id ? "..." : "📷"}
                              </div>
                            )}
                          </label>
                          <div className="flex-1 min-w-0">
                            <p className="text-base font-bold text-gray-800">
                              {p.name}
                              {p.size && <span className="text-xs text-gray-400 font-normal ml-1">{p.size}</span>}
                            </p>
                            <div className="flex gap-2 text-xs text-gray-400 mt-0.5 flex-wrap">
                              {p.costPrice > 0 && <span>ทุน {p.costPrice} ฿</span>}
                              {profit !== null && (
                                <span className={`font-semibold ${profit >= 0 ? "text-green-600" : "text-red-500"}`}>
                                  กำไร {profit >= 0 ? "+" : ""}{profit} ฿/ชิ้น
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <button onClick={() => {
                              if (isEditing) { setEditingId(null); return; }
                              setEditingId(p.id);
                              setEditForm({ name: p.name, category: p.category, size: p.size, unit: p.unit, costPrice: String(p.costPrice), minStock: String(p.minStock) });
                            }} className="text-xs text-blue-600 px-2 py-1 rounded-lg hover:bg-blue-50">
                              {isEditing ? "ปิด" : "แก้ไข"}
                            </button>
                            <button onClick={() => toggleActive(p)} className="text-xs text-gray-400 px-2 py-1 rounded-lg hover:bg-gray-50">ซ่อน</button>
                            <button onClick={() => deleteProduct(p)} disabled={deletingId === p.id}
                              className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 disabled:opacity-40">
                              {deletingId === p.id ? "..." : "ลบ"}
                            </button>
                          </div>
                        </div>

                        {/* Row 2: price + stock + save */}
                        <div className="flex gap-2 items-center">
                          <div className="flex-1">
                            <p className="text-xs text-gray-400 mb-1">ราคาขาย (฿/{p.unit})</p>
                            <input type="number" inputMode="decimal" value={prices[p.id] ?? ""}
                              onChange={(e) => setPrices((v) => ({ ...v, [p.id]: e.target.value }))}
                              placeholder="0"
                              className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-xl font-bold text-center focus:outline-none focus:border-purple-500" />
                          </div>
                          <div className="flex-1">
                            <p className={`text-xs mb-1 ${isLow ? "text-red-500 font-semibold" : "text-gray-400"}`}>
                              สต๊อก ({p.unit}) {isLow ? "⚠" : ""}
                            </p>
                            <input type="number" inputMode="numeric" value={stocks[p.id] ?? ""}
                              onChange={(e) => setStocks((v) => ({ ...v, [p.id]: e.target.value }))}
                              placeholder="0"
                              className={`w-full border-2 rounded-xl px-3 py-2.5 text-xl font-bold text-center focus:outline-none ${isLow ? "border-red-300 focus:border-red-500" : "border-gray-200 focus:border-purple-500"}`} />
                          </div>
                          <button onClick={() => saveProduct(p.id)} disabled={saving[p.id]}
                            className={`flex-shrink-0 px-4 py-2.5 rounded-xl text-sm font-bold mt-4 transition-colors ${saved[p.id] ? "bg-green-100 text-green-700" : "bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40"}`}>
                            {saving[p.id] ? "..." : saved[p.id] ? "✓" : "บันทึก"}
                          </button>
                        </div>

                        {/* Row 3: edit detail (collapsible) */}
                        {isEditing && (
                          <div className="pt-3 border-t border-gray-100 space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <p className="text-xs text-gray-400 mb-1">ชื่อสินค้า</p>
                                <input type="text" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500" />
                              </div>
                              <div>
                                <p className="text-xs text-gray-400 mb-1">หมวด</p>
                                <input type="text" value={editForm.category} onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500" />
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <p className="text-xs text-gray-400 mb-1">ขนาด</p>
                                <input type="text" value={editForm.size} onChange={(e) => setEditForm((f) => ({ ...f, size: e.target.value }))}
                                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500" />
                              </div>
                              <div>
                                <p className="text-xs text-gray-400 mb-1">หน่วย</p>
                                <select value={editForm.unit} onChange={(e) => setEditForm((f) => ({ ...f, unit: e.target.value }))}
                                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500">
                                  {UNIT_OPTIONS.map((u) => <option key={u}>{u}</option>)}
                                </select>
                              </div>
                              <div>
                                <p className="text-xs text-gray-400 mb-1">แจ้งเตือน ≤</p>
                                <input type="number" value={editForm.minStock} onChange={(e) => setEditForm((f) => ({ ...f, minStock: e.target.value }))}
                                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500" />
                              </div>
                            </div>
                            <div>
                              <p className="text-xs text-gray-400 mb-1">ต้นทุน (฿)</p>
                              <input type="number" value={editForm.costPrice} onChange={(e) => setEditForm((f) => ({ ...f, costPrice: e.target.value }))}
                                placeholder="0"
                                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-500" />
                            </div>
                            <button onClick={() => saveDetail(p.id)}
                              className="w-full bg-gray-800 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-gray-900">
                              บันทึกรายละเอียด
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {activeProducts.length === 0 && !showAdd && (
              <div className="text-center py-16 text-gray-300">
                <p className="text-4xl mb-2">📦</p>
                <p className="text-sm">ยังไม่มีสินค้า กด + เพิ่มสินค้า</p>
              </div>
            )}

            {/* Inactive */}
            {inactiveProducts.length > 0 && (
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide px-1 mb-2">ซ่อนอยู่</p>
                <div className="space-y-2">
                  {inactiveProducts.map((p) => (
                    <div key={p.id} className="bg-white rounded-2xl shadow-sm px-4 py-3 flex items-center gap-3 opacity-60">
                      {p.image && <img src={p.image} alt={p.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-700">{p.name} {p.size && <span className="text-xs text-gray-400">{p.size}</span>}</p>
                        <p className="text-xs text-gray-400">{p.category}</p>
                      </div>
                      <button onClick={() => toggleActive(p)} className="text-xs text-green-600 px-2 py-1 rounded-lg hover:bg-green-50">เปิด</button>
                      <button onClick={() => deleteProduct(p)} disabled={deletingId === p.id}
                        className="text-xs text-red-400 px-2 py-1 rounded-lg hover:bg-red-50 disabled:opacity-40">
                        {deletingId === p.id ? "..." : "ลบ"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
    </>
  );
}
