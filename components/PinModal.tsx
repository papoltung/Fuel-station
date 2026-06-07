"use client";

import { useState, useEffect, useRef } from "react";

const PIN_KEY = "fuel_pin";

export function getStoredPin(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(PIN_KEY);
}
export function savePin(pin: string) { localStorage.setItem(PIN_KEY, pin); }
export function verifyPin(pin: string): boolean { return localStorage.getItem(PIN_KEY) === pin; }

type Props = { onSuccess: () => void; onCancel?: () => void; title?: string };

export default function PinModal({ onSuccess, onCancel, title = "ใส่รหัสผ่าน" }: Props) {
  const [step, setStep] = useState<"enter" | "set" | "confirm">("enter");
  const [value, setValue] = useState("");
  const [pin1, setPin1] = useState("");
  const [err, setErr] = useState("");
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!getStoredPin()) setStep("set");
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  function doShake(msg: string) {
    setErr(msg); setShake(true); setValue("");
    setTimeout(() => { setShake(false); inputRef.current?.focus(); }, 400);
  }

  function submit() {
    if (!value) return;
    if (step === "enter") {
      if (verifyPin(value)) onSuccess();
      else doShake("รหัสผิด");
    } else if (step === "set") {
      setPin1(value); setValue(""); setStep("confirm");
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      if (value === pin1) { savePin(value); onSuccess(); }
      else doShake("รหัสไม่ตรงกัน");
    }
  }

  const heading = step === "set" ? "ตั้งรหัสผ่านใหม่" : step === "confirm" ? "ยืนยันรหัสอีกครั้ง" : title;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className={`bg-white rounded-3xl shadow-2xl p-8 w-80 flex flex-col gap-5 ${shake ? "animate-shake" : ""}`}>
        <p className="text-sm font-semibold text-gray-700 text-center">{heading}</p>
        <input
          ref={inputRef}
          type="password"
          value={value}
          onChange={(e) => { setValue(e.target.value); setErr(""); }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="รหัสผ่าน"
          className="border border-gray-200 rounded-xl px-4 py-3 text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-400"
          autoComplete="off"
        />
        {err && <p className="text-xs text-red-500 text-center -mt-2">{err}</p>}
        <div className="flex gap-3">
          {onCancel && (
            <button onClick={onCancel} className="flex-1 py-3 rounded-2xl border border-gray-200 text-sm text-gray-500 active:bg-gray-50">
              ยกเลิก
            </button>
          )}
          <button onClick={submit} className="flex-1 py-3 rounded-2xl bg-blue-500 text-white text-sm font-semibold active:bg-blue-600">
            {step === "set" ? "ต่อไป" : step === "confirm" ? "บันทึก" : "เข้า"}
          </button>
        </div>
      </div>
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}25%,75%{transform:translateX(-8px)}50%{transform:translateX(8px)}}.animate-shake{animation:shake 0.35s ease}`}</style>
    </div>
  );
}
