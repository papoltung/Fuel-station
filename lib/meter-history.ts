export function visibleMeterHistory<T>(rows: T[], expanded: boolean) {
  return expanded ? rows : rows.slice(0, 5);
}

export function openMeterPeriods<T extends { meterEnd: number | null }>(rows: T[]) {
  return rows.filter((row) => row.meterEnd === null);
}

export function meterHistoryGroupKey(period: {
  id: number;
  date: string | Date;
  fuelTypeId: number;
  pumpId: number | null;
  shiftId: number | null;
}) {
  const roundKey = period.shiftId === null ? `period-${period.id}` : `shift-${period.shiftId}`;
  return `${new Date(period.date).toDateString()}__${period.fuelTypeId}__${period.pumpId ?? "legacy"}__${roundKey}`;
}
