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

export type FuelTypeMetadata = {
  id: number;
  name: string;
  label: string;
};

export type FuelSaleGroupRow = {
  fuelTypeId: number;
  paymentMethod: string;
  _sum: {
    totalAmount: number | null;
    liters: number | null;
  };
  _count: {
    id: number;
  };
};

export type ProductSaleGroupRow = {
  paymentMethod: string;
  _sum: {
    totalAmount: number | null;
    quantity: number | null;
  };
  _count: {
    id: number;
  };
};

export type PreviousFuelAggregate = {
  _sum: {
    totalAmount: number | null;
    liters: number | null;
  };
  _count: {
    id: number;
  };
};

export type PreviousProductAggregate = {
  _sum: {
    totalAmount: number | null;
  };
  _count: {
    id: number;
  };
};

export type SalesSummaryAggregateInputs = {
  date: string;
  fuelTypes: FuelTypeMetadata[];
  fuelSalesGroup: FuelSaleGroupRow[];
  productSalesGroup: ProductSaleGroupRow[];
  previousFuel: PreviousFuelAggregate;
  previousProduct: PreviousProductAggregate;
};

export function buildSalesSummaryFromAggregates(input: SalesSummaryAggregateInputs) {
  const fuelTypeMap = new Map<number, FuelTypeMetadata>();
  for (const ft of input.fuelTypes) {
    fuelTypeMap.set(ft.id, ft);
  }

  let fuelRevenue = 0;
  let totalLiters = 0;
  let count = 0;
  const byFuel: Record<string, { label: string; liters: number; revenue: number }> = {};
  const byPayment = { cash: 0, transfer: 0, credit: 0 } as Record<string, number>;
  const fuelByPayment = { cash: 0, transfer: 0, credit: 0 } as Record<string, number>;
  const productByPayment = { cash: 0, transfer: 0, credit: 0 } as Record<string, number>;

  for (const row of input.fuelSalesGroup) {
    const ft = fuelTypeMap.get(row.fuelTypeId);
    if (!ft) {
      throw new Error(`Sales summary aggregate references unknown fuelTypeId: ${row.fuelTypeId}`);
    }

    const rev = row._sum.totalAmount ?? 0;
    const lit = row._sum.liters ?? 0;
    const rowCount = row._count.id ?? 0;

    fuelRevenue += rev;
    totalLiters += lit;
    count += rowCount;

    if (!byFuel[ft.name]) {
      byFuel[ft.name] = { label: ft.label, liters: 0, revenue: 0 };
    }
    byFuel[ft.name].liters += lit;
    byFuel[ft.name].revenue += rev;

    byPayment[row.paymentMethod] = (byPayment[row.paymentMethod] ?? 0) + rev;
    fuelByPayment[row.paymentMethod] = (fuelByPayment[row.paymentMethod] ?? 0) + rev;
  }

  let productRevenue = 0;
  let productCount = 0;
  for (const row of input.productSalesGroup) {
    const rev = row._sum.totalAmount ?? 0;
    const qty = row._sum.quantity ?? 0;

    productRevenue += rev;
    productCount += qty;

    byPayment[row.paymentMethod] = (byPayment[row.paymentMethod] ?? 0) + rev;
    productByPayment[row.paymentMethod] = (productByPayment[row.paymentMethod] ?? 0) + rev;
  }

  const prevFuelRev = input.previousFuel._sum.totalAmount ?? 0;
  const prevProdRev = input.previousProduct._sum.totalAmount ?? 0;
  const previousRevenue = prevFuelRev + prevProdRev;
  const previousLiters = input.previousFuel._sum.liters ?? 0;
  const previousCount = (input.previousFuel._count.id ?? 0) + (input.previousProduct._count.id ?? 0);

  return {
    date: input.date,
    totalRevenue: fuelRevenue + productRevenue,
    previousRevenue,
    previousLiters,
    previousCount,
    fuelRevenue,
    productRevenue,
    totalLiters,
    byFuel,
    byPayment,
    fuelByPayment,
    productByPayment,
    count,
    productCount,
  };
}
