export type SaleContext = {
  authUserId: string;
  shiftId: number;
};

export function resolveCachedSaleContext(
  cached: unknown,
  currentAuthUserId?: string | null,
): SaleContext | null {
  if (!cached || typeof cached !== "object") return null;
  const value = cached as Partial<SaleContext>;
  if (typeof value.authUserId !== "string" || !value.authUserId || typeof value.shiftId !== "number" || !Number.isInteger(value.shiftId) || value.shiftId <= 0) return null;
  if (currentAuthUserId !== undefined && value.authUserId !== currentAuthUserId) return null;
  return { authUserId: value.authUserId, shiftId: value.shiftId };
}
