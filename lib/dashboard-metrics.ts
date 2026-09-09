type FuelSummary = Record<string, { label: string; liters: number; revenue: number }>;

type DashboardSummaryInput = {
  fuelByPayment?: Record<string, number>;
  productByPayment?: Record<string, number>;
  byFuel?: FuelSummary;
};

function bankTotal(values?: Record<string, number>) {
  return (values?.transfer ?? 0) + (values?.qr ?? 0);
}

export function dashboardMetrics(summary: DashboardSummaryInput) {
  return {
    fuelCash: summary.fuelByPayment?.cash ?? 0,
    fuelTransfer: bankTotal(summary.fuelByPayment),
    productCash: summary.productByPayment?.cash ?? 0,
    productTransfer: bankTotal(summary.productByPayment),
    benzin95Liters: summary.byFuel?.benzin95?.liters ?? 0,
    dieselLiters: summary.byFuel?.diesel?.liters ?? 0,
  };
}
