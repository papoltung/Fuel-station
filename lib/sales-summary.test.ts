import assert from "node:assert/strict";
import test from "node:test";
import { calculateSalesSummary } from "./sales-summary";

test("calculates current and previous sales totals by fuel and payment", () => {
  const summary = calculateSalesSummary(
    "2026-10-03",
    [
      { totalAmount: 300, liters: 10, paymentMethod: "cash", fuelType: { name: "diesel", label: "ดีเซล" } },
      { totalAmount: 200, liters: 5, paymentMethod: "qr", fuelType: { name: "benzin95", label: "เบนซิน 95" } },
    ],
    [
      { totalAmount: 40, quantity: 2, paymentMethod: "cash" },
      { totalAmount: 60, quantity: 1, paymentMethod: "transfer" },
    ],
    [{ totalAmount: 120, liters: 4 }],
    [{ totalAmount: 20 }],
  );

  assert.deepEqual(summary, {
    date: "2026-10-03",
    totalRevenue: 600,
    previousRevenue: 140,
    previousLiters: 4,
    previousCount: 2,
    fuelRevenue: 500,
    productRevenue: 100,
    totalLiters: 15,
    byFuel: {
      diesel: { label: "ดีเซล", liters: 10, revenue: 300 },
      benzin95: { label: "เบนซิน 95", liters: 5, revenue: 200 },
    },
    byPayment: { cash: 340, transfer: 60, credit: 0, qr: 200 },
    fuelByPayment: { cash: 300, transfer: 0, credit: 0, qr: 200 },
    productByPayment: { cash: 40, transfer: 60, credit: 0 },
    count: 2,
    productCount: 3,
  });
});

test("returns zero totals for an empty day", () => {
  const summary = calculateSalesSummary("2026-10-03", [], [], [], []);
  assert.equal(summary.totalRevenue, 0);
  assert.equal(summary.previousRevenue, 0);
  assert.equal(summary.totalLiters, 0);
  assert.equal(summary.count, 0);
  assert.equal(summary.productCount, 0);
  assert.deepEqual(summary.byFuel, {});
});
