type ProfitInput = { label: string; revenue: number; quantity: number; unitCost: number | null };

export function estimateProfit(input: ProfitInput[]) {
  const rows = input.map(row => {
    const known = row.unitCost !== null && Number.isFinite(row.unitCost) && row.unitCost > 0;
    const cost = known ? row.quantity * row.unitCost! : null;
    return { ...row, cost, profit: cost === null ? null : row.revenue - cost };
  });
  const revenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const missingCount = rows.filter(row => row.cost === null).length;
  const cost = missingCount ? null : rows.reduce((sum, row) => sum + row.cost!, 0);
  return { rows, revenue, cost, profit: cost === null ? null : revenue - cost, missingCount };
}

export function reportDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const check = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(check.getTime()) || check.toISOString().slice(0, 10) !== value) return null;
  const start = new Date(`${value}T00:00:00+07:00`);
  return { start, end: new Date(start.getTime() + 86400000) };
}
