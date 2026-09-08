export function reconcileMeter(
  sales: { liters: number; totalAmount: number }[],
  periods: { meterStart: number; meterEnd: number | null; pricePerLiter: number }[],
) {
  const saleLiters = sales.reduce((sum, row) => sum + row.liters, 0);
  const saleRevenue = sales.reduce((sum, row) => sum + row.totalAmount, 0);
  const complete = periods.length > 0 && periods.every(row => row.meterEnd !== null && Number.isFinite(row.meterEnd) && row.meterEnd >= row.meterStart && row.pricePerLiter > 0);
  const meterLiters = complete ? periods.reduce((sum, row) => sum + row.meterEnd! - row.meterStart, 0) : null;
  const meterRevenue = complete ? periods.reduce((sum, row) => sum + (row.meterEnd! - row.meterStart) * row.pricePerLiter, 0) : null;
  return { saleLiters, saleRevenue, meterLiters, meterRevenue,
    literDifference: meterLiters === null ? null : saleLiters - meterLiters,
    moneyDifference: meterRevenue === null ? null : saleRevenue - meterRevenue };
}
