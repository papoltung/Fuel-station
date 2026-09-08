import Link from "next/link";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { estimateProfit, reportDay } from "@/lib/profit";
import { reconcileMeter } from "@/lib/meter-reconciliation";

export const dynamic = "force-dynamic";
export const metadata = { title: "รายงานกำไร | FuelPOS" };
const money = (value: number | null) => value === null ? "ต้นทุนไม่ครบ" : `฿ ${value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const auth = await requireRole(["owner"]);
  if (!auth.ok) return <main className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-bold">รายงานสำหรับเจ้าของเท่านั้น</h1><p className="my-4">ไม่มีสิทธิ์เข้าถึง หรือไม่สามารถตรวจสอบบัญชีได้</p><Link href="/dashboard" className="text-blue-700 underline">กลับหน้าภาพรวม</Link></main>;
  const params = await searchParams;
  // Server-only, dynamically rendered for each authenticated request.
  // eslint-disable-next-line react-hooks/purity
  const date = params.date ?? new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const range = reportDay(date);
  if (!range) return <main className="p-8"><h1>วันที่ไม่ถูกต้อง</h1><Link href="/reports" className="text-blue-700 underline">กลับรายงานวันนี้</Link></main>;

  let report;
  let comparison;
  try {
    const where = { date: { gte: range.start, lt: range.end } };
    const [sales, products, purchases, periods] = await Promise.all([
      prisma.sale.findMany({ where, include: { fuelType: true }, orderBy: { date: "asc" } }),
      prisma.productSale.findMany({ where, include: { product: true }, orderBy: { date: "asc" } }),
      prisma.fuelPurchase.findMany({ where: { date: { lt: range.end } }, orderBy: [{ date: "desc" }, { id: "desc" }], select: { fuelTypeId: true, date: true, costPerLiter: true } }),
      prisma.meterPeriod.findMany({ where, include: { fuelType: true } }),
    ]);
    const fuelIds = [...new Set([...sales.map(row => row.fuelTypeId), ...periods.map(row => row.fuelTypeId)])];
    comparison = fuelIds.map(id => ({ id,
      label: sales.find(row => row.fuelTypeId === id)?.fuelType.label ?? periods.find(row => row.fuelTypeId === id)!.fuelType.label,
      ...reconcileMeter(sales.filter(row => row.fuelTypeId === id), periods.filter(row => row.fuelTypeId === id)),
    }));
    report = estimateProfit([
      ...sales.map(sale => ({ label: sale.fuelType.label, revenue: sale.totalAmount, quantity: sale.liters,
        unitCost: purchases.find(purchase => purchase.fuelTypeId === sale.fuelTypeId && purchase.date <= sale.date)?.costPerLiter ?? null })),
      ...products.map(sale => ({ label: sale.product.name, revenue: sale.totalAmount, quantity: sale.quantity, unitCost: sale.product.costPrice })),
    ]);
  } catch {
    return <main className="p-8"><h1>โหลดรายงานไม่สำเร็จ</h1><p>กรุณาลองใหม่ ไม่ได้แสดงยอดเป็นศูนย์แทนข้อมูลที่โหลดไม่ได้</p><Link href={`/reports?date=${date}`} className="text-blue-700 underline">ลองอีกครั้ง</Link></main>;
  }
  return <main className="mx-auto min-h-screen max-w-6xl bg-slate-50 px-4 py-6 text-slate-900 sm:px-8">
    <Link href="/dashboard" className="inline-block py-2 text-sm font-semibold text-blue-700">← กลับภาพรวมสถานี</Link>
    <header className="my-6 flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-semibold text-blue-700">FuelPOS · เฉพาะ Owner</p><h1 className="mt-2 text-3xl font-black">รายงานกำไร</h1><p className="mt-2 text-sm text-slate-600">ยอดขายที่บันทึกสำเร็จ · เวลาไทย</p></div>
      <form action="/reports" className="flex flex-wrap items-end gap-2"><div><label htmlFor="report-date" className="block text-sm font-semibold">วันที่รายงาน</label><input id="report-date" name="date" type="date" required defaultValue={date} className="mt-1 min-h-11 rounded-xl border border-slate-400 bg-white px-3" /></div><button className="min-h-11 rounded-xl bg-blue-600 px-5 font-semibold text-white">ดูรายงาน</button></form>
    </header>
    <div className="grid gap-4 sm:grid-cols-3">{[
      { label: "ยอดขายรวม", value: report.revenue }, { label: "ต้นทุนประมาณการ", value: report.cost }, { label: "กำไรขั้นต้นประมาณการ", value: report.profit },
    ].map(card => <section key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-sm font-semibold text-slate-600">{card.label}</h2><p className={`mt-3 text-2xl font-black tabular-nums ${card.value !== null && card.value < 0 ? "text-red-700" : "text-slate-900"}`}>{money(card.value)}</p></section>)}</div>
    <p className="my-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">น้ำมันใช้ราคาทุนซื้อครั้งล่าสุดก่อนเวลาขาย ไม่ใช่ FIFO หรือกำไรทางบัญชี สินค้าใช้ต้นทุนปัจจุบันซึ่งเปลี่ยนย้อนหลังได้ ยังไม่หักค่าแรง ค่าไฟ ภาษี และค่าใช้จ่ายอื่น จึงไม่ใช่กำไรสุทธิ</p>
    {report.missingCount > 0 && <p role="status" className="mb-4 font-semibold text-amber-800">มี {report.missingCount} รายการไม่มีต้นทุนที่ใช้ได้ จึงยังไม่สรุปกำไรรวม กรุณาตรวจข้อมูลซื้อน้ำมันและต้นทุนสินค้า</p>}
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap justify-between gap-3"><h2 className="text-lg font-bold">เทียบมิเตอร์กับยอดขาย</h2><Link href="/meter" className="text-blue-700 underline">ไปบันทึก / ปิดมิเตอร์ →</Link></div>
      <p className="my-3 text-sm leading-relaxed text-slate-600">เทียบตามวันที่และชนิดน้ำมันเบื้องต้น ต้องตรวจว่าครบทุกหัวจ่ายและเป็นช่วงเวลาเดียวกัน ส่วนต่าง = ยอดขาย − ยอดจากมิเตอร์ ไม่บวกเข้ากำไรโดยอัตโนมัติ และไม่รวมยอดสินค้า</p>
      {comparison.length === 0 ? <p className="py-4 text-slate-600">ยังไม่มีข้อมูลขายน้ำมันหรือมิเตอร์วันนี้</p> : comparison.map(row => <article key={row.id} className="border-t border-slate-100 py-4">
        <h3 className="font-bold">{row.label}</h3>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-slate-600">ลิตรตามรายการขาย</dt><dd className="font-semibold tabular-nums">{row.saleLiters.toLocaleString("th-TH", { maximumFractionDigits: 6 })} L</dd></div><div><dt className="text-slate-600">ลิตรจากมิเตอร์</dt><dd className="font-semibold tabular-nums">{row.meterLiters === null ? "รอปิดรอบ / ตรวจข้อมูล" : `${row.meterLiters.toLocaleString("th-TH", { maximumFractionDigits: 6 })} L`}</dd></div><div><dt className="text-slate-600">ส่วนต่างลิตร</dt><dd className="font-semibold tabular-nums">{row.literDifference === null ? "—" : `${row.literDifference.toLocaleString("th-TH", { maximumFractionDigits: 6, signDisplay: "exceptZero" })} L`}</dd></div></dl>
        <p className="mt-3 text-sm">ยอดขาย {money(row.saleRevenue)} · มูลค่าจากมิเตอร์ {row.meterRevenue === null ? "—" : money(row.meterRevenue)}</p>
        <p className={`mt-2 font-semibold ${row.moneyDifference !== null && row.moneyDifference < -0.000001 ? "text-red-700" : "text-slate-700"}`}>{row.moneyDifference === null ? "ยังสรุปยอดเกิน / ขาดไม่ได้" : `${Math.abs(row.moneyDifference) < 0.000001 ? "ยอดตรงกัน" : row.moneyDifference < 0 ? "ยอดขาด • ตรวจสอบ" : "ยอดเกิน • ตรวจสอบรอบและการปัดเศษ"} (${row.moneyDifference.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 6, signDisplay: "exceptZero" })} บาท)`}</p>
      </article>)}
      <p className="mt-3 text-xs leading-relaxed text-slate-600">มิเตอร์ละเอียด 0.01 L ไม่ได้แปลว่าทุกครั้งปัดลง ต้องยืนยันวิธีปัดของเครื่อง ส่วนต่างอาจเกิดจากรายการตกหล่น ราคาคนละช่วง หรือรอบมิเตอร์ไม่ตรงกันด้วย</p>
    </section>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><h2 className="border-b border-slate-100 p-5 text-lg font-bold">รายละเอียดการขาย · {report.rows.length} รายการ</h2>
      {report.rows.length === 0 ? <p className="p-8 text-center text-slate-600">ยังไม่มีรายการขายที่บันทึกสำเร็จในวันนี้</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">ยอดขาย ต้นทุน และกำไรขั้นต้นประมาณการแต่ละรายการ หน่วยบาท</caption><thead className="bg-slate-50"><tr>{["ประเภท / สินค้า", "ยอดขาย", "ต้นทุนประมาณการ", "กำไรประมาณการ"].map(label => <th key={label} scope="col" className="whitespace-nowrap p-4 text-left">{label}</th>)}</tr></thead><tbody>{report.rows.map((row, index) => <tr key={index} className="border-t border-slate-100"><th scope="row" className="p-4 text-left font-medium">{row.label}</th><td className="p-4 tabular-nums">{money(row.revenue)}</td><td className="p-4 tabular-nums">{money(row.cost)}</td><td className={`p-4 font-semibold tabular-nums ${row.profit !== null && row.profit < 0 ? "text-red-700" : "text-slate-900"}`}>{money(row.profit)}</td></tr>)}</tbody></table></div>}
    </section>
  </main>;
}
