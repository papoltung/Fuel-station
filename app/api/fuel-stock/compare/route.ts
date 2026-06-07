import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function toDateKey(d: Date) {
  return d.toISOString().split("T")[0];
}

export async function GET() {
  try {
    const [fuelTypes, purchases, sales, meterPeriods, stocks, stockChecks] = await Promise.all([
      prisma.fuelType.findMany(),
      prisma.fuelPurchase.findMany({ orderBy: { date: "asc" } }),
      prisma.sale.findMany({ orderBy: { date: "asc" } }),
      prisma.meterPeriod.findMany({ orderBy: { date: "asc" } }),
      prisma.fuelStock.findMany({ include: { fuelType: true } }),
      prisma.stockCheck.findMany({ orderBy: { date: "desc" } }),
    ]);

    const result = fuelTypes.map((ft) => {
      const lastCheck = stockChecks.find((c) => c.fuelTypeId === ft.id);
      const checkDate = lastCheck?.date ?? null;
      const checkActual = lastCheck?.actualLiters ?? 0;

      const isAfter = (d: Date) => !checkDate || d > checkDate;

      const purchasesAfter = purchases.filter((p) => p.fuelTypeId === ft.id && isAfter(new Date(p.date)));
      const totalPurchasedAfter = purchasesAfter.reduce((a, p) => a + p.liters, 0);

      // ตำเงิน: Sale.liters ทั้งหมดหลัง check
      const salesAfter = sales.filter((s) => s.fuelTypeId === ft.id && isAfter(new Date(s.date)));
      const soldByCash = salesAfter.reduce((a, s) => a + s.liters, 0);

      // ตัวมิเตอร์: หาวันที่มี MeterPeriod ปิดแล้ว → ใช้ meter
      //              วันที่ไม่มี / ยังเปิดอยู่ → ใช้ Sale.liters แทน (estimate)
      const closedMeterPeriods = meterPeriods.filter(
        (m) => m.fuelTypeId === ft.id && m.liters !== null && m.meterEnd !== null && isAfter(new Date(m.date))
      );

      // วันที่มี closed MeterPeriod
      const meterDays = new Set(closedMeterPeriods.map((m) => toDateKey(new Date(m.date))));

      // ลิตรจากมิเตอร์จริง (วันที่ปิดรอบ)
      const litersByMeter = closedMeterPeriods.reduce((a, m) => a + (m.liters ?? 0), 0);

      // ลิตรจาก Sales วันที่ไม่มีมิเตอร์ปิด (estimate)
      const salesEstimate = salesAfter
        .filter((s) => !meterDays.has(toDateKey(new Date(s.date))))
        .reduce((a, s) => a + s.liters, 0);

      const soldByMeterEstimated = litersByMeter + salesEstimate;
      const meterDaysCount = meterDays.size;
      const estimateDaysCount = new Set(
        salesAfter
          .filter((s) => !meterDays.has(toDateKey(new Date(s.date))))
          .map((s) => toDateKey(new Date(s.date)))
      ).size;

      const systemStock = stocks.find((s) => s.fuelTypeId === ft.id)?.currentLiters ?? 0;
      const stockByCash = checkActual + totalPurchasedAfter - soldByCash;
      const stockByMeter = checkActual + totalPurchasedAfter - soldByMeterEstimated;
      const diffMeterVsCash = stockByMeter - stockByCash;

      return {
        fuelTypeId: ft.id,
        label: ft.label,
        lastCheckDate: checkDate,
        lastCheckActual: checkActual,
        totalPurchasedAfter,
        soldByCash,
        soldByMeter: soldByMeterEstimated,
        systemStock,
        stockByCash,
        stockByMeter,
        diffMeterVsCash,
        meterDaysCount,
        estimateDaysCount,
      };
    });

    return NextResponse.json(result);
  } catch (e) {
    console.error("fuel-stock/compare error:", e);
    return NextResponse.json([], { status: 200 });
  }
}
