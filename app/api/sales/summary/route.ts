import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dateStr = searchParams.get("date") ?? new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().split("T")[0];

  const start = new Date(dateStr + "T00:00:00+07:00");
  const end = new Date(dateStr + "T23:59:59.999+07:00");
  const previousStart = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  const previousEnd = new Date(end.getTime() - 24 * 60 * 60 * 1000);

  const [sales, productSales, purchases, stockChecks, previousSales, previousProductSales] = await Promise.all([
    prisma.sale.findMany({ where: { date: { gte: start, lte: end } }, include: { fuelType: true } }),
    prisma.productSale.findMany({ where: { date: { gte: start, lte: end } } }),
    prisma.fuelPurchase.findMany({ orderBy: { date: "asc" } }),
    prisma.stockCheck.findMany({ orderBy: { date: "desc" }, distinct: ["fuelTypeId"] }),
    prisma.sale.findMany({ where: { date: { gte: previousStart, lte: previousEnd } }, select: { totalAmount: true, liters: true } }),
    prisma.productSale.findMany({ where: { date: { gte: previousStart, lte: previousEnd } }, select: { totalAmount: true } }),
  ]);

  const earliestCheck =
    stockChecks.length > 0
      ? new Date(Math.min(...stockChecks.map((c) => new Date(c.date).getTime())))
      : undefined;

  const [allSales, meterPeriods] = await Promise.all([
    prisma.sale.findMany({
      where: earliestCheck ? { date: { gte: earliestCheck } } : undefined,
      orderBy: { date: "asc" },
      select: { fuelTypeId: true, pumpId: true, liters: true, date: true },
    }),
    prisma.meterPeriod.findMany({
      where: earliestCheck ? { date: { gte: earliestCheck } } : undefined,
      orderBy: { date: "asc" },
    }),
  ]);

  function toDateKey(d: Date) { return new Date(d.getTime() + 7 * 60 * 60 * 1000).toISOString().split("T")[0]; }

  // FIFO avg cost — exact same logic as stock page ทุนเฉลี่ยในถัง card
  const avgCostByFuelId: Record<number, number> = {};
  const fuelTypeIds = [...new Set(purchases.map((p) => p.fuelTypeId))];
  for (const ftId of fuelTypeIds) {
    const lastCheck = stockChecks.find((c) => c.fuelTypeId === ftId);
    const checkDate = lastCheck?.date ?? null;
    const checkActual = lastCheck?.actualLiters ?? 0;
    const isAfter = (d: Date) => !checkDate || d > checkDate;

    // stockByMeter: mirror compare API exactly
    const purchasesAfter = purchases.filter((p) => p.fuelTypeId === ftId && isAfter(new Date(p.date)));
    const totalPurchasedAfter = purchasesAfter.reduce((a, p) => a + p.liters, 0);
    const closedMeters = meterPeriods.filter(
      (m) => m.fuelTypeId === ftId && m.liters !== null && m.meterEnd !== null && isAfter(new Date(m.date))
    );
    const meterKeys = new Set(closedMeters.map((m) => `${toDateKey(new Date(m.date))}:${m.pumpId ?? "legacy"}`));
    const litersByMeter = closedMeters.reduce((a, m) => a + (m.liters ?? 0), 0);
    const salesEstimate = allSales
      .filter((s) => s.fuelTypeId === ftId && isAfter(new Date(s.date)) && (s.pumpId === null || !meterKeys.has(`${toDateKey(new Date(s.date))}:${s.pumpId}`)))
      .reduce((a, s) => a + s.liters, 0);
    const remaining = Math.max(0, checkActual + totalPurchasedAfter - (litersByMeter + salesEstimate));

    // FIFO cost: use ALL purchases newest-first (same as stock page — not filtered by checkDate)
    const allPurchasesForFuel = purchases
      .filter((p) => p.fuelTypeId === ftId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (remaining > 0) {
      let need = remaining;
      let totalCost = 0;
      for (const p of allPurchasesForFuel) {
        if (need <= 0) break;
        const take = Math.min(need, p.liters);
        totalCost += take * p.costPerLiter;
        need -= take;
      }
      avgCostByFuelId[ftId] = totalCost / remaining;
    } else {
      // remaining = 0: fall back to all-time weighted avg
      const totalL = allPurchasesForFuel.reduce((a, p) => a + p.liters, 0);
      const totalC = allPurchasesForFuel.reduce((a, p) => a + p.totalCost, 0);
      avgCostByFuelId[ftId] = totalL > 0 ? totalC / totalL : 0;
    }
  }

  const fuelRevenue = sales.reduce((s, r) => s + r.totalAmount, 0);
  const totalLiters = sales.reduce((s, r) => s + r.liters, 0);
  const productRevenue = productSales.reduce((s, r) => s + r.totalAmount, 0);
  const productCount = productSales.reduce((s, r) => s + r.quantity, 0);
  const totalRevenue = fuelRevenue + productRevenue;
  const previousRevenue = previousSales.reduce((sum, sale) => sum + sale.totalAmount, 0)
    + previousProductSales.reduce((sum, sale) => sum + sale.totalAmount, 0);
  const previousLiters = previousSales.reduce((sum, sale) => sum + sale.liters, 0);
  const previousCount = previousSales.length + previousProductSales.length;

  const byFuel: Record<string, { label: string; liters: number; revenue: number; cost: number; profit: number; avgCostPerLiter: number }> = {};
  for (const s of sales) {
    const key = s.fuelType.name;
    const avgCost = avgCostByFuelId[s.fuelTypeId] ?? 0;
    if (!byFuel[key]) byFuel[key] = { label: s.fuelType.label, liters: 0, revenue: 0, cost: 0, profit: 0, avgCostPerLiter: avgCost };
    byFuel[key].liters += s.liters;
    byFuel[key].revenue += s.totalAmount;
    byFuel[key].cost += s.liters * avgCost;
    byFuel[key].profit += s.totalAmount - s.liters * avgCost;
  }


  const byPayment = { cash: 0, transfer: 0, credit: 0 } as Record<string, number>;
  const fuelByPayment = { cash: 0, transfer: 0, credit: 0 } as Record<string, number>;
  const productByPayment = { cash: 0, transfer: 0, credit: 0 } as Record<string, number>;
  for (const s of sales) {
    byPayment[s.paymentMethod] = (byPayment[s.paymentMethod] ?? 0) + s.totalAmount;
    fuelByPayment[s.paymentMethod] = (fuelByPayment[s.paymentMethod] ?? 0) + s.totalAmount;
  }
  for (const s of productSales) {
    byPayment[s.paymentMethod] = (byPayment[s.paymentMethod] ?? 0) + s.totalAmount;
    productByPayment[s.paymentMethod] = (productByPayment[s.paymentMethod] ?? 0) + s.totalAmount;
  }

  return NextResponse.json({
    date: dateStr,
    totalRevenue,
    previousRevenue,
    previousLiters,
    previousCount,
    fuelRevenue,
    productRevenue,
    totalLiters,
    byFuel: Object.fromEntries(Object.entries(byFuel).map(([key, value]) => [key, { label: value.label, liters: value.liters, revenue: value.revenue }])),
    byPayment,
    fuelByPayment,
    productByPayment,
    count: sales.length,
    productCount,
  });
}
