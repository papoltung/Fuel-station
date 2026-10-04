import test from "node:test";
import assert from "node:assert/strict";
import {
  findLatestPurchaseForSale,
  getUnitCostForSale,
  sortPurchaseCandidates,
  legacyFindPurchaseCost,
  type PurchaseCandidate,
  type SaleTarget,
} from "./report-fuel-cost";

test("A. No prior purchase returns null", () => {
  const sale: SaleTarget = {
    fuelTypeId: 1,
    date: new Date("2026-09-08T10:00:00.000Z"),
  };
  const candidates: PurchaseCandidate[] = [
    { id: 1, fuelTypeId: 2, date: new Date("2026-09-07T10:00:00.000Z"), costPerLiter: 40 },
  ];
  assert.equal(getUnitCostForSale(sale, candidates), null);
  assert.equal(findLatestPurchaseForSale(sale, candidates), null);
});

test("B. One prior purchase returns that purchase cost", () => {
  const sale: SaleTarget = {
    fuelTypeId: 1,
    date: new Date("2026-09-08T10:00:00.000Z"),
  };
  const candidates: PurchaseCandidate[] = [
    { id: 1, fuelTypeId: 1, date: new Date("2026-09-07T10:00:00.000Z"), costPerLiter: 35.5 },
  ];
  assert.equal(getUnitCostForSale(sale, candidates), 35.5);
  assert.equal(findLatestPurchaseForSale(sale, candidates)?.id, 1);
});

test("C. Multiple historical purchases selects latest before sale", () => {
  const sale: SaleTarget = {
    fuelTypeId: 1,
    date: new Date("2026-09-08T10:00:00.000Z"),
  };
  const candidates: PurchaseCandidate[] = [
    { id: 1, fuelTypeId: 1, date: new Date("2026-09-01T00:00:00.000Z"), costPerLiter: 30 },
    { id: 2, fuelTypeId: 1, date: new Date("2026-09-05T00:00:00.000Z"), costPerLiter: 32 },
    { id: 3, fuelTypeId: 1, date: new Date("2026-09-07T00:00:00.000Z"), costPerLiter: 34 },
  ];
  assert.equal(getUnitCostForSale(sale, candidates), 34);
  assert.equal(findLatestPurchaseForSale(sale, candidates)?.id, 3);
});

test("D. Multiple purchases in report day selects latest before each respective sale", () => {
  const morningSale: SaleTarget = {
    fuelTypeId: 1,
    date: new Date("2026-09-08T09:00:00.000Z"),
  };
  const afternoonSale: SaleTarget = {
    fuelTypeId: 1,
    date: new Date("2026-09-08T15:00:00.000Z"),
  };
  const candidates: PurchaseCandidate[] = [
    { id: 1, fuelTypeId: 1, date: new Date("2026-09-07T00:00:00.000Z"), costPerLiter: 30 },
    { id: 2, fuelTypeId: 1, date: new Date("2026-09-08T06:00:00.000Z"), costPerLiter: 32 },
    { id: 3, fuelTypeId: 1, date: new Date("2026-09-08T12:00:00.000Z"), costPerLiter: 33 },
  ];

  // Morning sale matches 06:00 purchase (id: 2)
  assert.equal(getUnitCostForSale(morningSale, candidates), 32);
  assert.equal(findLatestPurchaseForSale(morningSale, candidates)?.id, 2);

  // Afternoon sale matches 12:00 purchase (id: 3)
  assert.equal(getUnitCostForSale(afternoonSale, candidates), 33);
  assert.equal(findLatestPurchaseForSale(afternoonSale, candidates)?.id, 3);
});

test("E. Purchase after sale must not be used", () => {
  const sale: SaleTarget = {
    fuelTypeId: 1,
    date: new Date("2026-09-08T10:00:00.000Z"),
  };
  const candidates: PurchaseCandidate[] = [
    { id: 1, fuelTypeId: 1, date: new Date("2026-09-07T00:00:00.000Z"), costPerLiter: 31 },
    { id: 2, fuelTypeId: 1, date: new Date("2026-09-08T11:00:00.000Z"), costPerLiter: 35 },
  ];
  // 11:00 purchase is after 10:00 sale, so 09-07 purchase must be used
  assert.equal(getUnitCostForSale(sale, candidates), 31);
  assert.equal(findLatestPurchaseForSale(sale, candidates)?.id, 1);
});

test("F. Multiple fuel types are isolated", () => {
  const dieselSale: SaleTarget = {
    fuelTypeId: 1,
    date: new Date("2026-09-08T10:00:00.000Z"),
  };
  const benzinSale: SaleTarget = {
    fuelTypeId: 2,
    date: new Date("2026-09-08T10:00:00.000Z"),
  };
  const candidates: PurchaseCandidate[] = [
    { id: 1, fuelTypeId: 1, date: new Date("2026-09-07T00:00:00.000Z"), costPerLiter: 32 },
    { id: 2, fuelTypeId: 2, date: new Date("2026-09-07T00:00:00.000Z"), costPerLiter: 41 },
  ];
  assert.equal(getUnitCostForSale(dieselSale, candidates), 32);
  assert.equal(getUnitCostForSale(benzinSale, candidates), 41);
});

test("G. purchase.date === sale.date is eligible", () => {
  const exactTime = new Date("2026-09-08T10:00:00.000Z");
  const sale: SaleTarget = { fuelTypeId: 1, date: exactTime };
  const candidates: PurchaseCandidate[] = [
    { id: 1, fuelTypeId: 1, date: exactTime, costPerLiter: 36 },
  ];
  assert.equal(getUnitCostForSale(sale, candidates), 36);
  assert.equal(findLatestPurchaseForSale(sale, candidates)?.id, 1);
});

test("H. Same purchase timestamp uses highest id as tie-breaker", () => {
  const exactTime = new Date("2026-09-08T00:00:00.000Z");
  const sale: SaleTarget = {
    fuelTypeId: 1,
    date: new Date("2026-09-08T10:00:00.000Z"),
  };
  // id 5 and id 7 have same date, id 7 was created later with different cost
  const candidates: PurchaseCandidate[] = [
    { id: 5, fuelTypeId: 1, date: exactTime, costPerLiter: 37.0 },
    { id: 7, fuelTypeId: 1, date: exactTime, costPerLiter: 37.39 },
  ];
  assert.equal(getUnitCostForSale(sale, candidates), 37.39);
  assert.equal(findLatestPurchaseForSale(sale, candidates)?.id, 7);
});

test("I. Sale at start-of-day boundary", () => {
  const startOfDay = new Date("2026-09-08T00:00:00.000+07:00");
  const sale: SaleTarget = { fuelTypeId: 1, date: startOfDay };
  const candidates: PurchaseCandidate[] = [
    { id: 1, fuelTypeId: 1, date: new Date(startOfDay.getTime() - 1000), costPerLiter: 33 },
    { id: 2, fuelTypeId: 1, date: startOfDay, costPerLiter: 34 },
  ];
  // Exactly at boundary, matches the startOfDay purchase (id: 2)
  assert.equal(getUnitCostForSale(sale, candidates), 34);
  assert.equal(findLatestPurchaseForSale(sale, candidates)?.id, 2);
});

test("J. Purchase immediately before start-of-day serves as baseline", () => {
  const startOfDay = new Date("2026-09-08T00:00:00.000+07:00");
  const priorPurchaseDate = new Date(startOfDay.getTime() - 1);
  const saleLaterInDay: SaleTarget = {
    fuelTypeId: 1,
    date: new Date(startOfDay.getTime() + 3600000),
  };
  const candidates: PurchaseCandidate[] = [
    { id: 10, fuelTypeId: 1, date: priorPurchaseDate, costPerLiter: 35.8 },
  ];
  assert.equal(getUnitCostForSale(saleLaterInDay, candidates), 35.8);
});

test("K. Historical report date does not use future records", () => {
  const historicalSale: SaleTarget = {
    fuelTypeId: 1,
    date: new Date("2026-06-08T12:00:00.000Z"),
  };
  const candidates: PurchaseCandidate[] = [
    { id: 1, fuelTypeId: 1, date: new Date("2026-06-07T00:00:00.000Z"), costPerLiter: 38 },
    { id: 2, fuelTypeId: 1, date: new Date("2026-06-08T00:00:00.000Z"), costPerLiter: 38.5 },
    { id: 3, fuelTypeId: 1, date: new Date("2026-09-08T00:00:00.000Z"), costPerLiter: 37 }, // far future
  ];
  assert.equal(getUnitCostForSale(historicalSale, candidates), 38.5);
  assert.equal(findLatestPurchaseForSale(historicalSale, candidates)?.id, 2);
});

test("L. Future-dated purchase excluded when viewing current report", () => {
  const sale: SaleTarget = {
    fuelTypeId: 1,
    date: new Date("2026-09-08T10:00:00.000Z"),
  };
  const candidates: PurchaseCandidate[] = [
    { id: 1, fuelTypeId: 1, date: new Date("2026-09-08T00:00:00.000Z"), costPerLiter: 37 },
    { id: 2, fuelTypeId: 1, date: new Date("2026-09-09T00:00:00.000Z"), costPerLiter: 39 }, // tomorrow
  ];
  assert.equal(getUnitCostForSale(sale, candidates), 37);
  assert.equal(findLatestPurchaseForSale(sale, candidates)?.id, 1);
});

test("Parity: Bounded candidate set yields identical results to full-history scan", () => {
  const rangeStart = new Date("2026-09-08T00:00:00.000+07:00");
  const rangeEnd = new Date("2026-09-08T23:59:59.999+07:00");

  const fullHistory: PurchaseCandidate[] = [
    { id: 1, fuelTypeId: 1, date: new Date("2026-06-01T00:00:00.000Z"), costPerLiter: 30 },
    { id: 2, fuelTypeId: 1, date: new Date("2026-07-01T00:00:00.000Z"), costPerLiter: 32 },
    { id: 3, fuelTypeId: 1, date: new Date("2026-09-01T00:00:00.000Z"), costPerLiter: 34 }, // latest prior baseline for fuel 1
    { id: 4, fuelTypeId: 2, date: new Date("2026-08-15T00:00:00.000Z"), costPerLiter: 40 }, // latest prior baseline for fuel 2
    { id: 5, fuelTypeId: 1, date: new Date("2026-09-08T08:00:00.000+07:00"), costPerLiter: 36 }, // same-day
    { id: 6, fuelTypeId: 1, date: new Date("2026-09-08T14:00:00.000+07:00"), costPerLiter: 37 }, // same-day
    { id: 7, fuelTypeId: 1, date: new Date("2026-09-09T00:00:00.000Z"), costPerLiter: 38 }, // outside range (future)
  ];

  const sortedFullHistory = sortPurchaseCandidates(fullHistory);

  // Bounded set: same-day purchases (id 5, 6) + latest prior baseline for fuel 1 (id 3) and fuel 2 (id 4)
  const boundedCandidates: PurchaseCandidate[] = sortPurchaseCandidates([
    { id: 5, fuelTypeId: 1, date: new Date("2026-09-08T08:00:00.000+07:00"), costPerLiter: 36 },
    { id: 6, fuelTypeId: 1, date: new Date("2026-09-08T14:00:00.000+07:00"), costPerLiter: 37 },
    { id: 3, fuelTypeId: 1, date: new Date("2026-09-01T00:00:00.000Z"), costPerLiter: 34 },
    { id: 4, fuelTypeId: 2, date: new Date("2026-08-15T00:00:00.000Z"), costPerLiter: 40 },
  ]);

  const testSales: SaleTarget[] = [
    // 1. Early morning before same-day purchase (matches prior baseline id 3)
    { id: 101, fuelTypeId: 1, date: new Date("2026-09-08T06:00:00.000+07:00") },
    // 2. Midday between two same-day purchases (matches id 5)
    { id: 102, fuelTypeId: 1, date: new Date("2026-09-08T10:00:00.000+07:00") },
    // 3. Evening after all same-day purchases (matches id 6)
    { id: 103, fuelTypeId: 1, date: new Date("2026-09-08T18:00:00.000+07:00") },
    // 4. Fuel 2 sale with no same-day purchases (matches prior baseline id 4)
    { id: 104, fuelTypeId: 2, date: new Date("2026-09-08T12:00:00.000+07:00") },
    // 5. Fuel 3 sale with no purchases at all
    { id: 105, fuelTypeId: 3, date: new Date("2026-09-08T12:00:00.000+07:00") },
  ];

  for (const sale of testSales) {
    const legacyCost = legacyFindPurchaseCost(sale, sortedFullHistory);
    const boundedCost = getUnitCostForSale(sale, boundedCandidates);
    assert.equal(
      boundedCost,
      legacyCost,
      `Sale ${sale.id} mismatch: bounded=${boundedCost}, legacy=${legacyCost}`
    );
  }
});
