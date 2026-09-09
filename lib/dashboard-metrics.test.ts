import assert from "node:assert/strict";
import test from "node:test";
import { dashboardMetrics } from "./dashboard-metrics";

test("separates fuel and product payments and reports liters by fuel", () => {
  const result = dashboardMetrics({
    fuelByPayment: { cash: 1000, transfer: 200, qr: 50 },
    productByPayment: { cash: 300, transfer: 40, qr: 10 },
    byFuel: {
      benzin95: { label: "เบนซิน 95", liters: 12.5, revenue: 500 },
      diesel: { label: "ดีเซล", liters: 20, revenue: 800 },
    },
  });

  assert.deepEqual(result, {
    fuelCash: 1000,
    fuelTransfer: 250,
    productCash: 300,
    productTransfer: 50,
    benzin95Liters: 12.5,
    dieselLiters: 20,
  });
});
