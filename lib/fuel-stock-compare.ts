export function toDateKey(d: Date | string): string {
  const dateObj = typeof d === "string" ? new Date(d) : d;
  return new Date(dateObj.getTime() + 7 * 60 * 60 * 1000).toISOString().split("T")[0];
}

export type FuelTypeItem = {
  id: number;
  label: string;
};

export type StockItem = {
  fuelTypeId: number;
  currentLiters: number;
};

export type StockCheckItem = {
  fuelTypeId: number;
  date: Date | string;
  actualLiters: number;
};

export type FuelPurchaseItem = {
  fuelTypeId: number;
  date: Date | string;
  liters: number;
};

export type SaleItem = {
  fuelTypeId: number;
  date: Date | string;
  pumpId: number | null;
  liters: number;
};

export type MeterPeriodItem = {
  fuelTypeId: number;
  date: Date | string;
  pumpId: number | null;
  liters: number | null;
  meterEnd: number | null;
};

export type FuelStockCompareResult = {
  fuelTypeId: number;
  label: string;
  lastCheckDate: string | Date | null;
  lastCheckActual: number;
  totalPurchasedAfter: number;
  soldByCash: number;
  soldByMeter: number;
  systemStock: number;
  stockByCash: number;
  stockByMeter: number;
  diffMeterVsCash: number;
  meterDaysCount: number;
  estimateDaysCount: number;
};

export function calculateFuelStockCompare(params: {
  fuelTypes: FuelTypeItem[];
  stocks: StockItem[];
  stockChecks: StockCheckItem[];
  purchases: FuelPurchaseItem[];
  sales: SaleItem[];
  meterPeriods: MeterPeriodItem[];
  purchasedTotalsByFuel?: Record<number, number>;
  soldTotalsByFuel?: Record<number, number>;
}): FuelStockCompareResult[] {
  const { fuelTypes, stocks, stockChecks, purchases, sales, meterPeriods, purchasedTotalsByFuel, soldTotalsByFuel } = params;

  return fuelTypes.map((ft) => {
    const lastCheck = stockChecks.find((c) => c.fuelTypeId === ft.id);
    const checkDate = lastCheck?.date ? new Date(lastCheck.date) : null;
    const checkActual = lastCheck?.actualLiters ?? 0;

    const isAfter = (d: Date | string) => !checkDate || new Date(d).getTime() > checkDate.getTime();

    // Purchases: use pre-aggregated sum if provided, else filter & sum
    const totalPurchasedAfter =
      purchasedTotalsByFuel && purchasedTotalsByFuel[ft.id] !== undefined
        ? purchasedTotalsByFuel[ft.id]
        : purchases
            .filter((p) => p.fuelTypeId === ft.id && isAfter(p.date))
            .reduce((a, p) => a + p.liters, 0);

    // Sales by cash: use pre-aggregated sum if provided, else filter & sum
    const soldByCash =
      soldTotalsByFuel && soldTotalsByFuel[ft.id] !== undefined
        ? soldTotalsByFuel[ft.id]
        : sales
            .filter((s) => s.fuelTypeId === ft.id && isAfter(s.date))
            .reduce((a, s) => a + s.liters, 0);

    // Filter relevant sales for meter estimation
    const salesAfter = sales.filter((s) => s.fuelTypeId === ft.id && isAfter(s.date));

    // Filter closed meter periods after check
    const closedMeterPeriods = meterPeriods.filter(
      (m) => m.fuelTypeId === ft.id && m.liters !== null && m.meterEnd !== null && isAfter(m.date)
    );

    const meterKeys = new Set(
      closedMeterPeriods.map((m) => `${toDateKey(m.date)}:${m.pumpId ?? "legacy"}`)
    );

    // Liters from closed meters
    const litersByMeter = closedMeterPeriods.reduce((a, m) => a + (m.liters ?? 0), 0);

    // Estimate sales for days/pumps where no closed meter period exists
    const salesEstimate = salesAfter
      .filter((s) => s.pumpId === null || !meterKeys.has(`${toDateKey(s.date)}:${s.pumpId}`))
      .reduce((a, s) => a + s.liters, 0);

    const soldByMeterEstimated = litersByMeter + salesEstimate;
    const meterDaysCount = new Set(closedMeterPeriods.map((m) => toDateKey(m.date))).size;
    const estimateDaysCount = new Set(
      salesAfter
        .filter((s) => s.pumpId === null || !meterKeys.has(`${toDateKey(s.date)}:${s.pumpId}`))
        .map((s) => toDateKey(s.date))
    ).size;

    const systemStock = stocks.find((s) => s.fuelTypeId === ft.id)?.currentLiters ?? 0;
    const stockByCash = checkActual + totalPurchasedAfter - soldByCash;
    const stockByMeter = checkActual + totalPurchasedAfter - soldByMeterEstimated;
    const diffMeterVsCash = stockByMeter - stockByCash;

    return {
      fuelTypeId: ft.id,
      label: ft.label,
      lastCheckDate: checkDate ? checkDate.toISOString() : null,
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
}
