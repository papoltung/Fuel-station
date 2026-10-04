import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateFuelStockCompare } from "@/lib/fuel-stock-compare";
import { requireRole } from "@/lib/authz";

export async function GET() {
  const auth = await requireRole(["owner"]);
  if (!auth.ok) return auth.response;

  try {
    const [fuelTypes, stocks, stockChecks] = await Promise.all([
      prisma.fuelType.findMany({ select: { id: true, label: true } }),
      prisma.fuelStock.findMany({ select: { fuelTypeId: true, currentLiters: true } }),
      prisma.stockCheck.findMany({
        orderBy: { date: "desc" },
        distinct: ["fuelTypeId"],
        select: { fuelTypeId: true, date: true, actualLiters: true },
      }),
    ]);

    if (fuelTypes.length === 0) {
      return NextResponse.json([]);
    }

    // Build per-fuel boundaries: if a StockCheck exists for that fuel, only query transactions strictly after it.
    // If no StockCheck exists, query transactions for that fuel type from inception without global contamination.
    const fuelFilters = fuelTypes.map((ft) => {
      const check = stockChecks.find((c) => c.fuelTypeId === ft.id);
      return check
        ? { fuelTypeId: ft.id, date: { gt: check.date } }
        : { fuelTypeId: ft.id };
    });

    const whereClause = { OR: fuelFilters };

    const [purchasesGrouped, salesGrouped, meterPeriods, sales] = await Promise.all([
      // Database-side aggregation for FuelPurchase
      prisma.fuelPurchase.groupBy({
        by: ["fuelTypeId"],
        where: whereClause,
        _sum: { liters: true },
      }),
      // Database-side aggregation for Sale totals (soldByCash)
      prisma.sale.groupBy({
        by: ["fuelTypeId"],
        where: whereClause,
        _sum: { liters: true },
      }),
      // Only closed meter periods with compact scalar fields needed for meter coverage matching
      prisma.meterPeriod.findMany({
        where: {
          ...whereClause,
          meterEnd: { not: null },
          liters: { not: null },
        },
        select: {
          fuelTypeId: true,
          date: true,
          pumpId: true,
          liters: true,
          meterEnd: true,
        },
        orderBy: { date: "asc" },
      }),
      // Compact scalar fields needed for uncovered day/pump sales estimation
      prisma.sale.findMany({
        where: whereClause,
        select: {
          fuelTypeId: true,
          date: true,
          pumpId: true,
          liters: true,
        },
        orderBy: { date: "asc" },
      }),
    ]);

    const purchasedTotalsByFuel: Record<number, number> = {};
    for (const p of purchasesGrouped) {
      purchasedTotalsByFuel[p.fuelTypeId] = p._sum.liters ?? 0;
    }

    const soldTotalsByFuel: Record<number, number> = {};
    for (const s of salesGrouped) {
      soldTotalsByFuel[s.fuelTypeId] = s._sum.liters ?? 0;
    }

    const result = calculateFuelStockCompare({
      fuelTypes,
      stocks,
      stockChecks,
      purchases: [],
      sales,
      meterPeriods,
      purchasedTotalsByFuel,
      soldTotalsByFuel,
    });

    return NextResponse.json(result);
  } catch (e) {
    console.error("fuel-stock/compare error:", e);
    return NextResponse.json({ error: "internal server error" }, { status: 500 });
  }
}
