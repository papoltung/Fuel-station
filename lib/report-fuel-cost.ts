import { prisma } from "@/lib/prisma";

export interface PurchaseCandidate {
  id: number;
  fuelTypeId: number;
  date: Date;
  costPerLiter: number;
}

export interface SaleTarget {
  id?: number;
  fuelTypeId: number;
  date: Date;
}

/**
 * Finds the latest purchase on or before sale.date for the given fuelTypeId.
 *
 * Selection priority:
 * 1. greatest purchase.date (where purchase.date <= sale.date)
 * 2. greatest purchase.id (tie-breaker for identical timestamps)
 *
 * Returns the matched PurchaseCandidate or null if no eligible purchase exists.
 */
export function findLatestPurchaseForSale(
  sale: SaleTarget,
  candidates: PurchaseCandidate[]
): PurchaseCandidate | null {
  let best: PurchaseCandidate | null = null;

  for (const purchase of candidates) {
    if (purchase.fuelTypeId !== sale.fuelTypeId) continue;
    if (purchase.date.getTime() > sale.date.getTime()) continue;

    if (!best) {
      best = purchase;
      continue;
    }

    const pTime = purchase.date.getTime();
    const bestTime = best.date.getTime();

    if (pTime > bestTime) {
      best = purchase;
    } else if (pTime === bestTime && purchase.id > best.id) {
      best = purchase;
    }
  }

  return best;
}

/**
 * Assigns unitCost (costPerLiter) to a sale based on candidate purchases.
 * Returns costPerLiter or null if no eligible purchase exists.
 */
export function getUnitCostForSale(
  sale: SaleTarget,
  candidates: PurchaseCandidate[]
): number | null {
  const match = findLatestPurchaseForSale(sale, candidates);
  return match?.costPerLiter ?? null;
}

/**
 * Sorts purchase candidates in canonical selection order:
 * Primary: date DESC
 * Tie-breaker: id DESC
 */
export function sortPurchaseCandidates(candidates: PurchaseCandidate[]): PurchaseCandidate[] {
  return [...candidates].sort((a, b) => {
    const diff = b.date.getTime() - a.date.getTime();
    if (diff !== 0) return diff;
    return b.id - a.id;
  });
}

/**
 * Fetches at most ONE latest FuelPurchase before start for each specified fuelTypeId.
 * Uses Prisma findFirst with [date DESC, id DESC] to guarantee tie-breaker preservation.
 *
 * Scaling: Transfers at most fuelTypeIds.length rows, completely independent of
 * total historical purchases count M.
 */
export async function fetchPriorBaselines(
  start: Date,
  fuelTypeIds: number[]
): Promise<PurchaseCandidate[]> {
  if (fuelTypeIds.length === 0) return [];

  const results = await Promise.all(
    fuelTypeIds.map(fuelTypeId =>
      prisma.fuelPurchase.findFirst({
        where: {
          fuelTypeId,
          date: { lt: start },
        },
        orderBy: [{ date: "desc" }, { id: "desc" }],
        select: { id: true, fuelTypeId: true, date: true, costPerLiter: true },
      })
    )
  );

  return results.filter((p): p is PurchaseCandidate => p !== null);
}

/**
 * Reference implementation representing the legacy full-history lookup
 * as used originally in app/reports/page.tsx:
 * purchases.find(p => p.fuelTypeId === sale.fuelTypeId && p.date <= sale.date)?.costPerLiter ?? null
 * (assumes purchases is sorted by [date DESC, id DESC])
 */
export function legacyFindPurchaseCost(
  sale: SaleTarget,
  sortedHistoricalPurchases: PurchaseCandidate[]
): number | null {
  const match = sortedHistoricalPurchases.find(
    p => p.fuelTypeId === sale.fuelTypeId && p.date.getTime() <= sale.date.getTime()
  );
  return match?.costPerLiter ?? null;
}
