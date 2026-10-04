import test from "node:test";
import assert from "node:assert/strict";
import { calculateFuelStockCompare, toDateKey } from "./fuel-stock-compare";

test("toDateKey formats Bangkok date correctly", () => {
  // 17:00 UTC on 2026-10-03 is 00:00 Bangkok on 2026-10-04
  const d = new Date("2026-10-03T17:00:00.000Z");
  assert.equal(toDateKey(d), "2026-10-04");
});

test("scenario 1: no StockCheck calculates from all historical events", () => {
  const fuelTypes = [{ id: 1, label: "ดีเซล" }];
  const stocks = [{ fuelTypeId: 1, currentLiters: 1500 }];
  const stockChecks: any[] = [];
  const purchases = [
    { fuelTypeId: 1, date: "2026-09-01T00:00:00.000Z", liters: 2000 },
    { fuelTypeId: 1, date: "2026-09-10T00:00:00.000Z", liters: 1000 },
  ];
  const sales = [
    { fuelTypeId: 1, date: "2026-09-05T00:00:00.000Z", pumpId: 1, liters: 500 },
    { fuelTypeId: 1, date: "2026-09-15T00:00:00.000Z", pumpId: 1, liters: 700 },
  ];
  const meterPeriods = [
    { fuelTypeId: 1, date: "2026-09-05T00:00:00.000Z", pumpId: 1, meterEnd: 1500, liters: 500 },
    // 2026-09-15 has no closed meter period, so sale estimate should be used
  ];

  const result = calculateFuelStockCompare({
    fuelTypes,
    stocks,
    stockChecks,
    purchases,
    sales,
    meterPeriods,
  });

  assert.equal(result.length, 1);
  const row = result[0];
  assert.equal(row.lastCheckDate, null);
  assert.equal(row.lastCheckActual, 0);
  assert.equal(row.totalPurchasedAfter, 3000); // 2000 + 1000
  assert.equal(row.soldByCash, 1200); // 500 + 700
  assert.equal(row.soldByMeter, 1200); // 500 (meter) + 700 (estimate)
  assert.equal(row.stockByCash, 0 + 3000 - 1200); // 1800
  assert.equal(row.stockByMeter, 0 + 3000 - 1200); // 1800
  assert.equal(row.diffMeterVsCash, 0);
  assert.equal(row.meterDaysCount, 1);
  assert.equal(row.estimateDaysCount, 1);
});

test("scenario 2: one fuel type with a StockCheck includes only events strictly after checkDate", () => {
  const checkDate = "2026-09-10T12:00:00.000Z";
  const fuelTypes = [{ id: 1, label: "ดีเซล" }];
  const stocks = [{ fuelTypeId: 1, currentLiters: 1800 }];
  const stockChecks = [{ fuelTypeId: 1, date: checkDate, actualLiters: 2000 }];

  const purchases = [
    { fuelTypeId: 1, date: "2026-09-10T08:00:00.000Z", liters: 1000 }, // before check -> EXCLUDED
    { fuelTypeId: 1, date: "2026-09-10T12:00:00.000Z", liters: 500 },  // equal to check -> EXCLUDED (d > checkDate)
    { fuelTypeId: 1, date: "2026-09-11T00:00:00.000Z", liters: 1500 }, // after check -> INCLUDED
  ];
  const sales = [
    { fuelTypeId: 1, date: "2026-09-09T00:00:00.000Z", pumpId: 1, liters: 400 }, // before check -> EXCLUDED
    { fuelTypeId: 1, date: "2026-09-12T00:00:00.000Z", pumpId: 1, liters: 300 }, // after check -> INCLUDED
  ];
  const meterPeriods = [
    { fuelTypeId: 1, date: "2026-09-12T00:00:00.000Z", pumpId: 1, meterEnd: 1300, liters: 300 },
  ];

  const result = calculateFuelStockCompare({
    fuelTypes,
    stocks,
    stockChecks,
    purchases,
    sales,
    meterPeriods,
  });

  const row = result[0];
  assert.equal(row.lastCheckDate, new Date(checkDate).toISOString());
  assert.equal(row.lastCheckActual, 2000);
  assert.equal(row.totalPurchasedAfter, 1500); // only 1500 after check
  assert.equal(row.soldByCash, 300); // only 300 after check
  assert.equal(row.soldByMeter, 300); // 300 from meter
  assert.equal(row.stockByCash, 2000 + 1500 - 300); // 3200
  assert.equal(row.stockByMeter, 2000 + 1500 - 300); // 3200
  assert.equal(row.diffMeterVsCash, 0);
  assert.equal(row.meterDaysCount, 1);
  assert.equal(row.estimateDaysCount, 0); // pump 1 covered by meter
});

test("scenario 3: multiple fuel types with different last StockCheck dates calculate independently", () => {
  const checkDate1 = "2026-09-15T00:00:00.000Z";
  const checkDate2 = "2026-09-20T00:00:00.000Z";

  const fuelTypes = [
    { id: 1, label: "ดีเซล" },
    { id: 2, label: "เบนซิน 95" },
    { id: 3, label: "E20" }, // no check
  ];
  const stocks = [
    { fuelTypeId: 1, currentLiters: 1000 },
    { fuelTypeId: 2, currentLiters: 2000 },
    { fuelTypeId: 3, currentLiters: 500 },
  ];
  const stockChecks = [
    { fuelTypeId: 1, date: checkDate1, actualLiters: 3000 },
    { fuelTypeId: 2, date: checkDate2, actualLiters: 4000 },
  ];

  const purchases = [
    // Diesel (after 09-15)
    { fuelTypeId: 1, date: "2026-09-16T00:00:00.000Z", liters: 1000 },
    // Benzin 95 (09-18 is BEFORE its check 09-20 -> excluded!)
    { fuelTypeId: 2, date: "2026-09-18T00:00:00.000Z", liters: 800 },
    // Benzin 95 (09-21 is AFTER its check -> included!)
    { fuelTypeId: 2, date: "2026-09-21T00:00:00.000Z", liters: 1200 },
    // E20 (no check -> all included)
    { fuelTypeId: 3, date: "2026-09-01T00:00:00.000Z", liters: 500 },
  ];

  const sales = [
    { fuelTypeId: 1, date: "2026-09-17T00:00:00.000Z", pumpId: 1, liters: 600 },
    { fuelTypeId: 2, date: "2026-09-22T00:00:00.000Z", pumpId: 2, liters: 500 },
    { fuelTypeId: 3, date: "2026-09-02T00:00:00.000Z", pumpId: 3, liters: 100 },
  ];

  const result = calculateFuelStockCompare({
    fuelTypes,
    stocks,
    stockChecks,
    purchases,
    sales,
    meterPeriods: [],
  });

  // Diesel
  const d = result.find((r) => r.fuelTypeId === 1)!;
  assert.equal(d.lastCheckActual, 3000);
  assert.equal(d.totalPurchasedAfter, 1000);
  assert.equal(d.soldByCash, 600);
  assert.equal(d.stockByCash, 3000 + 1000 - 600); // 3400

  // Benzin 95
  const b = result.find((r) => r.fuelTypeId === 2)!;
  assert.equal(b.lastCheckActual, 4000);
  assert.equal(b.totalPurchasedAfter, 1200); // 800 was excluded!
  assert.equal(b.soldByCash, 500);
  assert.equal(b.stockByCash, 4000 + 1200 - 500); // 4700

  // E20 (no check)
  const e = result.find((r) => r.fuelTypeId === 3)!;
  assert.equal(e.lastCheckDate, null);
  assert.equal(e.lastCheckActual, 0);
  assert.equal(e.totalPurchasedAfter, 500);
  assert.equal(e.soldByCash, 100);
  assert.equal(e.stockByCash, 0 + 500 - 100); // 400
});

test("scenario 4: meter vs cash discrepancy and estimation logic", () => {
  const fuelTypes = [{ id: 1, label: "ดีเซล" }];
  const stocks = [{ fuelTypeId: 1, currentLiters: 1000 }];
  const stockChecks: any[] = [];

  const purchases = [{ fuelTypeId: 1, date: "2026-10-01T00:00:00.000Z", liters: 5000 }];

  // Day 1 (2026-10-01): closed meter on pump 1 reports 1000 L, but cash sales report 980 L (meter higher by 20 L)
  // Day 2 (2026-10-02): pump 1 has NO meter period, sale reports 500 L (estimate used)
  const sales = [
    { fuelTypeId: 1, date: "2026-10-01T08:00:00.000Z", pumpId: 1, liters: 980 },
    { fuelTypeId: 1, date: "2026-10-02T08:00:00.000Z", pumpId: 1, liters: 500 },
  ];
  const meterPeriods = [
    { fuelTypeId: 1, date: "2026-10-01T08:00:00.000Z", pumpId: 1, meterEnd: 2000, liters: 1000 },
  ];

  const result = calculateFuelStockCompare({
    fuelTypes,
    stocks,
    stockChecks,
    purchases,
    sales,
    meterPeriods,
  });

  const row = result[0];
  assert.equal(row.totalPurchasedAfter, 5000);
  assert.equal(row.soldByCash, 1480); // 980 + 500
  assert.equal(row.soldByMeter, 1500); // 1000 (meter) + 500 (estimate)
  assert.equal(row.stockByCash, 5000 - 1480); // 3520
  assert.equal(row.stockByMeter, 5000 - 1500); // 3500
  assert.equal(row.diffMeterVsCash, -20); // 3500 - 3520 = -20 (stock by meter is 20 L less because meter recorded 20 L more dispensed)
  assert.equal(row.meterDaysCount, 1);
  assert.equal(row.estimateDaysCount, 1);
});

test("scenario 5: pre-aggregated database totals produce identical results", () => {
  const fuelTypes = [{ id: 1, label: "ดีเซล" }];
  const stocks = [{ fuelTypeId: 1, currentLiters: 1500 }];
  const stockChecks = [{ fuelTypeId: 1, date: "2026-09-01T00:00:00.000Z", actualLiters: 1000 }];

  const purchases = [{ fuelTypeId: 1, date: "2026-09-05T00:00:00.000Z", liters: 2500 }];
  const sales = [{ fuelTypeId: 1, date: "2026-09-05T00:00:00.000Z", pumpId: 1, liters: 800 }];

  // Run with in-memory purchases/sales
  const rawResult = calculateFuelStockCompare({
    fuelTypes,
    stocks,
    stockChecks,
    purchases,
    sales,
    meterPeriods: [],
  });

  // Run with pre-aggregated DB totals (purchasedTotalsByFuel & soldTotalsByFuel)
  const dbAggregatedResult = calculateFuelStockCompare({
    fuelTypes,
    stocks,
    stockChecks,
    purchases: [],
    sales, // sales passed for estimation check
    meterPeriods: [],
    purchasedTotalsByFuel: { 1: 2500 },
    soldTotalsByFuel: { 1: 800 },
  });

  assert.deepEqual(dbAggregatedResult, rawResult);
});
