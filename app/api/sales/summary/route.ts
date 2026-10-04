import { NextRequest, NextResponse } from "next/server";
import { buildSalesSummaryFromAggregates } from "@/lib/sales-summary";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dateStr = searchParams.get("date") ?? new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().split("T")[0];

  const start = new Date(dateStr + "T00:00:00+07:00");
  const end = new Date(dateStr + "T23:59:59.999+07:00");
  const previousStart = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  const previousEnd = new Date(end.getTime() - 24 * 60 * 60 * 1000);

  const [
    fuelTypes,
    fuelSalesGroup,
    productSalesGroup,
    previousFuel,
    previousProduct,
  ] = await Promise.all([
    prisma.fuelType.findMany({
      select: {
        id: true,
        name: true,
        label: true,
      },
    }),
    prisma.sale.groupBy({
      by: ["fuelTypeId", "paymentMethod"],
      where: { date: { gte: start, lte: end } },
      _sum: {
        totalAmount: true,
        liters: true,
      },
      _count: {
        id: true,
      },
    }),
    prisma.productSale.groupBy({
      by: ["paymentMethod"],
      where: { date: { gte: start, lte: end } },
      _sum: {
        totalAmount: true,
        quantity: true,
      },
      _count: {
        id: true,
      },
    }),
    prisma.sale.aggregate({
      where: { date: { gte: previousStart, lte: previousEnd } },
      _sum: {
        totalAmount: true,
        liters: true,
      },
      _count: {
        id: true,
      },
    }),
    prisma.productSale.aggregate({
      where: { date: { gte: previousStart, lte: previousEnd } },
      _sum: {
        totalAmount: true,
      },
      _count: {
        id: true,
      },
    }),
  ]);

  return NextResponse.json(
    buildSalesSummaryFromAggregates({
      date: dateStr,
      fuelTypes,
      fuelSalesGroup,
      productSalesGroup,
      previousFuel,
      previousProduct,
    }),
  );
}
