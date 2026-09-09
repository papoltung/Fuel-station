export function visibleMeterHistory<T>(rows: T[], expanded: boolean) {
  return expanded ? rows : rows.slice(0, 5);
}

export function openMeterPeriods<T extends { meterEnd: number | null }>(rows: T[]) {
  return rows.filter((row) => row.meterEnd === null);
}
