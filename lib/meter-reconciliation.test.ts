import test from "node:test";
import assert from "node:assert/strict";
import { reconcileMeter } from "./meter-reconciliation";

test("keeps fractional liters instead of rounding each sale", () => {
  const result = reconcileMeter([{ liters: 1.005, totalAmount: 40.2 }, { liters: 1.005, totalAmount: 40.2 }], [{ meterStart: 0, meterEnd: 2, pricePerLiter: 40 }]);
  assert.ok(Math.abs(result.literDifference! - 0.01) < 1e-10);
  assert.ok(Math.abs(result.moneyDifference! - 0.4) < 1e-10);
});
test("open or absent meter readings cannot report a surplus", () => {
  assert.equal(reconcileMeter([{ liters: 2, totalAmount: 80 }], []).moneyDifference, null);
  assert.equal(reconcileMeter([], [{ meterStart: 0, meterEnd: null, pricePerLiter: 40 }]).moneyDifference, null);
});
test("uses each meter period price and detects shortfall", () => {
  assert.equal(reconcileMeter([{ liters: 2, totalAmount: 70 }], [
    { meterStart: 0, meterEnd: 1, pricePerLiter: 40 },
    { meterStart: 1, meterEnd: 2, pricePerLiter: 45 },
  ]).moneyDifference, -15);
});

test("aggregates multiple closed meter periods on the same pump and date to equal sum of both periods", () => {
  // Two closed periods on the same pump and fuel type on the same day:
  // Period 1: 1000 -> 1150 (150 L @ 35 THB = 5,250 THB)
  // Period 2: 1150 -> 1350 (200 L @ 35 THB = 7,000 THB)
  const periods = [
    { meterStart: 1000, meterEnd: 1150, pricePerLiter: 35 },
    { meterStart: 1150, meterEnd: 1350, pricePerLiter: 35 },
  ];
  // Sales on the same pump and fuel type: 150 L + 200 L = 350 L
  const sales = [
    { liters: 150, totalAmount: 5250 },
    { liters: 200, totalAmount: 7000 },
  ];
  const result = reconcileMeter(sales, periods);

  assert.equal(result.saleLiters, 350);
  assert.equal(result.saleRevenue, 12250);
  assert.equal(result.meterLiters, 350); // 150 + 200
  assert.equal(result.meterRevenue, 12250); // 5250 + 7000
  assert.equal(result.literDifference, 0);
  assert.equal(result.moneyDifference, 0);
});
