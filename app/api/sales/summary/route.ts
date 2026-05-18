import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dateStr = searchParams.get("date") ?? new Date().toISOString().split("T")[0];

  const start = new Date(dateStr);
  start.setHours(0, 0, 0, 0);
  const end = new Date(dateStr);
  end.setHours(23, 59, 59, 999);

  const [sales, productSales, purchases] = await Promise.all([
    prisma.sale.findMany({ where: { date: { gte: start, lte: end } }, include: { fuelType: true } }),
    prisma.productSale.findMany({ where: { date: { gte: start, lte: end } } }),
    prisma.fuelPurchase.findMany({ include: { fuelType: true } }),
  ]);

  // weighted avg cost per liter per fuel type
  const avgCostByFuelId: Record<number, number> = {};
  const purchasesByFuel: Record<number, { totalLiters: number; totalCost: number }> = {};
  for (const p of purchases) {
    if (!purchasesByFuel[p.fuelTypeId]) purchasesByFuel[p.fuelTypeId] = { totalLiters: 0, totalCost: 0 };
    purchasesByFuel[p.fuelTypeId].totalLiters += p.liters;
    purchasesByFuel[p.fuelTypeId].totalCost += p.totalCost;
  }
  for (const [id, d] of Object.entries(purchasesByFuel)) {
    avgCostByFuelId[Number(id)] = d.totalLiters > 0 ? d.totalCost / d.totalLiters : 0;
  }

  const fuelRevenue = sales.reduce((s, r) => s + r.totalAmount, 0);
  const totalLiters = sales.reduce((s, r) => s + r.liters, 0);
  const productRevenue = productSales.reduce((s, r) => s + r.totalAmount, 0);
  const productCount = productSales.reduce((s, r) => s + r.quantity, 0);
  const totalRevenue = fuelRevenue + productRevenue;

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

  const fuelCost = Object.values(byFuel).reduce((a, f) => a + f.cost, 0);
  const totalCost = fuelCost;
  const totalProfit = totalRevenue - totalCost;

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
    fuelRevenue,
    productRevenue,
    totalLiters,
    totalCost,
    totalProfit,
    byFuel,
    byPayment,
    fuelByPayment,
    productByPayment,
    count: sales.length,
    productCount,
  });
}
