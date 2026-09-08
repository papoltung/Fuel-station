type SaleSnapshotInput = { id: number; date: Date; sellerName: string; fuelTypeId: number; pumpNo: string; liters: number; pricePerLiter: number; totalAmount: number; paymentMethod: string; customerName: string | null; note: string | null; shiftId?: number | null };

export function saleSnapshot(sale: SaleSnapshotInput) {
  return { id: sale.id, date: sale.date.toISOString(), sellerName: sale.sellerName, fuelTypeId: sale.fuelTypeId, pumpNo: sale.pumpNo, liters: sale.liters, pricePerLiter: sale.pricePerLiter, totalAmount: sale.totalAmount, paymentMethod: sale.paymentMethod, customerName: sale.customerName, note: sale.note, shiftId: sale.shiftId ?? null };
}
