import test from "node:test";
import assert from "node:assert/strict";
import { estimateProfit, reportDay } from "./profit";

test("profit subtracts known costs and preserves losses", () => {
  const result = estimateProfit([{ label: "95", revenue: 100, quantity: 4, unitCost: 30 }]);
  assert.equal(result.profit, -20);
  assert.equal(result.cost, 120);
});
test("missing cost never becomes zero cost or inflated profit", () => {
  const result = estimateProfit([{ label: "95", revenue: 100, quantity: 2, unitCost: null }]);
  assert.equal(result.profit, null);
  assert.equal(result.cost, null);
  assert.equal(result.missingCount, 1);
});
test("mixed complete and incomplete rows keep total profit unknown", () => {
  const result = estimateProfit([
    { label: "95", revenue: 100, quantity: 2, unitCost: 30 },
    { label: "สินค้า", revenue: 50, quantity: 1, unitCost: 0 },
  ]);
  assert.equal(result.revenue, 150);
  assert.equal(result.profit, null);
  assert.equal(result.rows[0].profit, 40);
});
test("empty report is zero, valid dates use Bangkok boundaries", () => {
  assert.equal(estimateProfit([]).profit, 0);
  assert.equal(reportDay("2026-09-08")?.start.toISOString(), "2026-09-07T17:00:00.000Z");
  assert.equal(reportDay("2026-02-30"), null);
  assert.equal(reportDay("bad"), null);
});
