import { NextRequest, NextResponse } from "next/server";
import { calculateSalesSummary } from "@/lib/sales-summary";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dateStr = searchParams.get("date") ?? new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().split("T")[0];

  const start = new Date(dateStr + "T00:00:00+07:00");
  const end = new Date(dateStr + "T23:59:59.999+07:00");
  const previousStart = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  const previousEnd = new Date(end.getTime() - 24 * 60 * 60 * 1000);

  // Only fetch fields used by the response. Historical stock-cost calculations
  // were removed: their results were computed but never returned or consumed.
  const [sales, productSales, previousSales, previousProductSales] = await Promise.all([
    prisma.sale.findMany({
      where: { date: { gte: start, lte: end } },
      select: {
        totalAmount: true,
        liters: true,
        paymentMethod: true,
        fuelType: { select: { name: true, label: true } },
      },
    }),
    prisma.productSale.findMany({
      where: { date: { gte: start, lte: end } },
      select: { totalAmount: true, quantity: true, paymentMethod: true },
    }),
    prisma.sale.findMany({
      where: { date: { gte: previousStart, lte: previousEnd } },
      select: { totalAmount: true, liters: true },
    }),
    prisma.productSale.findMany({
      where: { date: { gte: previousStart, lte: previousEnd } },
      select: { totalAmount: true },
    }),
  ]);

  return NextResponse.json(
    calculateSalesSummary(dateStr, sales, productSales, previousSales, previousProductSales),
  );
}
