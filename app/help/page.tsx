import Link from "next/link";

export default function HelpPage() {
  return (
    <main className="min-h-dvh bg-slate-50 px-4 py-10 text-slate-950">
      <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <Link href="/dashboard" className="text-sm font-bold text-blue-600">← กลับหน้าภาพรวม</Link>
        <h1 className="mt-5 text-2xl font-black">ช่วยเหลือ</h1>
        <p className="mt-2 text-slate-500">คู่มือย่อสำหรับการใช้งาน FuelPOS</p>
        <div className="mt-6 divide-y divide-slate-100">
          <article className="py-4"><h2 className="font-bold">บันทึกการขาย</h2><p className="mt-1 text-sm text-slate-500">เลือกน้ำมัน จำนวนเงิน วิธีชำระ แล้วกดบันทึกการขาย</p></article>
          <article className="py-4"><h2 className="font-bold">ตรวจสต็อก</h2><p className="mt-1 text-sm text-slate-500">เปิดเมนูสต็อกเพื่อดูยอดคงเหลือและบันทึกการตรวจนับ</p></article>
          <article className="py-4"><h2 className="font-bold">บัญชีและสิทธิ์</h2><p className="mt-1 text-sm text-slate-500">ชื่อบัญชีดึงจาก Google ส่วนสิทธิ์ Owner, Manager และ Staff จะกำหนดจากระบบยศ</p></article>
        </div>
      </section>
    </main>
  );
}
