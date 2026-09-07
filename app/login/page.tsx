"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

  async function signInWithGoogle() {
    setLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback?next=/dashboard` },
      });
      if (authError) throw authError;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "เข้าสู่ระบบไม่สำเร็จ");
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" aria-labelledby="login-title">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-blue-600 text-3xl" aria-hidden="true">💧</div>
          <h1 id="login-title" className="text-2xl font-extrabold text-slate-950">FuelPOS</h1>
          <p className="mt-1 text-sm text-slate-500">ระบบจัดการสถานีน้ำมัน</p>
        </div>

        <h2 className="text-lg font-bold text-slate-900">เข้าสู่ระบบ</h2>
        <p className="mt-1 text-sm text-slate-500">ใช้บัญชี Google ที่ได้รับอนุญาต</p>

        {!configured && (
          <div role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            ยังไม่ได้ตั้งค่า Supabase Auth กรุณาเพิ่ม URL และ Publishable key ในไฟล์ environment
          </div>
        )}
        {error && <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

        <button type="button" onClick={signInWithGoogle} disabled={!configured || loading} className="mt-6 flex min-h-14 w-full items-center justify-center gap-3 rounded-xl border-2 border-slate-200 bg-white px-4 font-bold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50">
          <span className="grid size-7 place-items-center rounded-full bg-white text-lg font-black text-blue-600" aria-hidden="true">G</span>
          {loading ? "กำลังเปิด Google…" : "เข้าสู่ระบบด้วย Google"}
        </button>

        <p className="mt-6 text-center text-xs leading-5 text-slate-400">บัญชีที่ไม่ได้รับสิทธิ์จะไม่สามารถเข้าถึงข้อมูลของสถานีได้</p>
      </section>
    </main>
  );
}
