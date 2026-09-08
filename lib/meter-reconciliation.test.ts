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
