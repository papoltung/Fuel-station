export type SummarySale = {
  totalAmount: number;
  liters: number;
  paymentMethod: string;
  fuelType: { name: string; label: string };
};

export type SummaryProductSale = {
  totalAmount: number;
  quantity: number;
  paymentMethod: string;
};

export type PreviousFuelSale = Pick<SummarySale, "totalAmount" | "liters">;
export type PreviousProductSale = Pick<SummaryProductSale, "totalAmount">;

export function calculateSalesSummary(
  date: string,
  sales: SummarySale[],
  productSales: SummaryProductSale[],
  previousSales: PreviousFuelSale[],
  previousProductSales: PreviousProductSale[],
) {
  const fuelRevenue = sales.reduce((sum, sale) => sum + sale.totalAmount, 0);
  const totalLiters = sales.reduce((sum, sale) => sum + sale.liters, 0);
  const productRevenue = productSales.reduce((sum, sale) => sum + sale.totalAmount, 0);
  const productCount = productSales.reduce((sum, sale) => sum + sale.quantity, 0);
  const previousRevenue = previousSales.reduce((sum, sale) => sum + sale.totalAmount, 0)
    + previousProductSales.reduce((sum, sale) => sum + sale.totalAmount, 0);
  const previousLiters = previousSales.reduce((sum, sale) => sum + sale.liters, 0);

  const byFuel: Record<string, { label: string; liters: number; revenue: number }> = {};
  for (const sale of sales) {
    const key = sale.fuelType.name;
    if (!byFuel[key]) byFuel[key] = { label: sale.fuelType.label, liters: 0, revenue: 0 };
    byFuel[key].liters += sale.liters;
    byFuel[key].revenue += sale.totalAmount;
  }

  const byPayment = { cash: 0, transfer: 0, credit: 0 } as Record<string, number>;
  const fuelByPayment = { cash: 0, transfer: 0, credit: 0 } as Record<string, number>;
  const productByPayment = { cash: 0, transfer: 0, credit: 0 } as Record<string, number>;
  for (const sale of sales) {
    byPayment[sale.paymentMethod] = (byPayment[sale.paymentMethod] ?? 0) + sale.totalAmount;
    fuelByPayment[sale.paymentMethod] = (fuelByPayment[sale.paymentMethod] ?? 0) + sale.totalAmount;
  }
  for (const sale of productSales) {
    byPayment[sale.paymentMethod] = (byPayment[sale.paymentMethod] ?? 0) + sale.totalAmount;
    productByPayment[sale.paymentMethod] = (productByPayment[sale.paymentMethod] ?? 0) + sale.totalAmount;
  }

  return {
    date,
    totalRevenue: fuelRevenue + productRevenue,
    previousRevenue,
    previousLiters,
    previousCount: previousSales.length + previousProductSales.length,
    fuelRevenue,
    productRevenue,
    totalLiters,
    byFuel,
    byPayment,
    fuelByPayment,
    productByPayment,
    count: sales.length,
    productCount,
  };
}
