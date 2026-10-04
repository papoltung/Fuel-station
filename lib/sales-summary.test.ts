import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSalesSummaryFromAggregates,
  calculateSalesSummary,
} from "./sales-summary";

// Expected exact response keys
const EXPECTED_SUMMARY_KEYS = [
  "date",
  "totalRevenue",
  "previousRevenue",
  "previousLiters",
  "previousCount",
  "fuelRevenue",
  "productRevenue",
  "totalLiters",
  "byFuel",
  "byPayment",
  "fuelByPayment",
  "productByPayment",
  "count",
  "productCount",
];

test("A. Empty day: zero totals, empty byFuel, default zero payment methods", () => {
  const summary = calculateSalesSummary("2026-10-04", [], [], [], []);

  assert.deepEqual(Object.keys(summary).sort(), [...EXPECTED_SUMMARY_KEYS].sort());
  assert.equal(summary.date, "2026-10-04");
  assert.equal(summary.totalRevenue, 0);
  assert.equal(summary.previousRevenue, 0);
  assert.equal(summary.previousLiters, 0);
  assert.equal(summary.previousCount, 0);
  assert.equal(summary.fuelRevenue, 0);
  assert.equal(summary.productRevenue, 0);
  assert.equal(summary.totalLiters, 0);
  assert.deepEqual(summary.byFuel, {});
  assert.deepEqual(summary.byPayment, { cash: 0, transfer: 0, credit: 0 });
  assert.deepEqual(summary.fuelByPayment, { cash: 0, transfer: 0, credit: 0 });
  assert.deepEqual(summary.productByPayment, { cash: 0, transfer: 0, credit: 0 });
  assert.equal(summary.count, 0);
  assert.equal(summary.productCount, 0);
});

test("B. Fuel sales only: multiple fuel types with multiple transactions each", () => {
  const summary = calculateSalesSummary(
    "2026-10-04",
    [
      { totalAmount: 300, liters: 10, paymentMethod: "cash", fuelType: { name: "diesel", label: "ดีเซล" } },
      { totalAmount: 450, liters: 15, paymentMethod: "transfer", fuelType: { name: "diesel", label: "ดีเซล" } },
      { totalAmount: 200, liters: 5, paymentMethod: "cash", fuelType: { name: "benzin95", label: "เบนซิน 95" } },
      { totalAmount: 400, liters: 10, paymentMethod: "qr", fuelType: { name: "benzin95", label: "เบนซิน 95" } },
    ],
    [],
    [],
    [],
  );

  assert.equal(summary.count, 4); // 4 Sale records
  assert.equal(summary.productCount, 0);
  assert.equal(summary.fuelRevenue, 1350);
  assert.equal(summary.productRevenue, 0);
  assert.equal(summary.totalRevenue, 1350);
  assert.equal(summary.totalLiters, 40);
  assert.deepEqual(summary.byFuel, {
    diesel: { label: "ดีเซล", liters: 25, revenue: 750 },
    benzin95: { label: "เบนซิน 95", liters: 15, revenue: 600 },
  });
});

test("C. Product sales only: quantity > 1 locks productCount = SUM(quantity) != row count", () => {
  const summary = calculateSalesSummary(
    "2026-10-04",
    [],
    [
      { totalAmount: 200, quantity: 2, paymentMethod: "cash" },
      { totalAmount: 350, quantity: 5, paymentMethod: "transfer" },
    ],
    [],
    [],
  );

  assert.equal(summary.count, 0); // 0 fuel sale records
  // Crucial distinction: productCount is SUM(quantity) = 2 + 5 = 7, NOT rows count (2)
  assert.equal(summary.productCount, 7);
  assert.equal(summary.fuelRevenue, 0);
  assert.equal(summary.productRevenue, 550);
  assert.equal(summary.totalRevenue, 550);
  assert.equal(summary.totalLiters, 0);
  assert.deepEqual(summary.byFuel, {});
  assert.deepEqual(summary.productByPayment, { cash: 200, transfer: 350, credit: 0 });
});

test("D. Previous day only: locks previousCount = Sale rows + ProductSale rows", () => {
  const summary = calculateSalesSummary(
    "2026-10-04",
    [],
    [],
    [
      { totalAmount: 300, liters: 10 },
      { totalAmount: 600, liters: 20 },
    ],
    [
      { totalAmount: 50 },
      { totalAmount: 100 },
      { totalAmount: 150 },
    ],
  );

  assert.equal(summary.count, 0);
  assert.equal(summary.productCount, 0);
  assert.equal(summary.totalRevenue, 0);
  assert.equal(summary.totalLiters, 0);
  // previousRevenue = (300 + 600) + (50 + 100 + 150) = 1200
  assert.equal(summary.previousRevenue, 1200);
  assert.equal(summary.previousLiters, 30);
  // Crucial distinction: previousCount = 2 sale records + 3 product sale records = 5
  assert.equal(summary.previousCount, 5);
});

test("E. Multiple payment methods: cash, transfer, credit, qr breakdown across fuel and products", () => {
  const summary = calculateSalesSummary(
    "2026-10-04",
    [
      { totalAmount: 1000, liters: 30, paymentMethod: "cash", fuelType: { name: "diesel", label: "ดีเซล" } },
      { totalAmount: 500, liters: 15, paymentMethod: "transfer", fuelType: { name: "diesel", label: "ดีเซล" } },
      { totalAmount: 800, liters: 20, paymentMethod: "credit", fuelType: { name: "diesel", label: "ดีเซล" } },
      { totalAmount: 300, liters: 8, paymentMethod: "qr", fuelType: { name: "benzin95", label: "เบนซิน 95" } },
    ],
    [
      { totalAmount: 100, quantity: 1, paymentMethod: "cash" },
      { totalAmount: 200, quantity: 2, paymentMethod: "transfer" },
      { totalAmount: 150, quantity: 1, paymentMethod: "credit" },
    ],
    [],
    [],
  );

  assert.deepEqual(summary.fuelByPayment, {
    cash: 1000,
    transfer: 500,
    credit: 800,
    qr: 300,
  });

  assert.deepEqual(summary.productByPayment, {
    cash: 100,
    transfer: 200,
    credit: 150,
  });

  assert.deepEqual(summary.byPayment, {
    cash: 1100,
    transfer: 700,
    credit: 950,
    qr: 300,
  });
});

test("F. Mixed fuel + product sales: exact response contract and relation between totals", () => {
  const summary = calculateSalesSummary(
    "2026-10-04",
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
    date: "2026-10-04",
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

  assert.equal(summary.totalRevenue, summary.fuelRevenue + summary.productRevenue);
});

test("G. Multiple transactions with same fuel type collapse cleanly into one byFuel entry", () => {
  const summary = calculateSalesSummary(
    "2026-10-04",
    [
      { totalAmount: 100, liters: 3.5, paymentMethod: "cash", fuelType: { name: "diesel", label: "ดีเซล" } },
      { totalAmount: 200, liters: 7.0, paymentMethod: "cash", fuelType: { name: "diesel", label: "ดีเซล" } },
      { totalAmount: 300, liters: 10.5, paymentMethod: "transfer", fuelType: { name: "diesel", label: "ดีเซล" } },
    ],
    [],
    [],
    [],
  );

  assert.equal(Object.keys(summary.byFuel).length, 1);
  assert.deepEqual(summary.byFuel.diesel, {
    label: "ดีเซล",
    liters: 21,
    revenue: 600,
  });
  assert.equal(summary.count, 3);
  assert.equal(summary.totalLiters, 21);
  assert.equal(summary.fuelRevenue, 600);
});

test("H. Unknown or custom payment method is preserved in byPayment and fuelByPayment", () => {
  const summary = calculateSalesSummary(
    "2026-10-04",
    [
      { totalAmount: 500, liters: 15, paymentMethod: "voucher", fuelType: { name: "diesel", label: "ดีเซล" } },
    ],
    [
      { totalAmount: 80, quantity: 1, paymentMethod: "voucher" },
    ],
    [],
    [],
  );

  assert.equal(summary.fuelByPayment.voucher, 500);
  assert.equal(summary.productByPayment.voucher, 80);
  assert.equal(summary.byPayment.voucher, 580);
  // Default keys still initialized to 0
  assert.equal(summary.byPayment.cash, 0);
  assert.equal(summary.byPayment.transfer, 0);
  assert.equal(summary.byPayment.credit, 0);
});

// ============================================================================
// Parity Tests: calculateSalesSummary (Raw) vs buildSalesSummaryFromAggregates (DB)
// ============================================================================

const TEST_FUEL_TYPES = [
  { id: 1, name: "diesel", label: "ดีเซล" },
  { id: 2, name: "benzin95", label: "เบนซิน 95" },
  { id: 3, name: "e20", label: "E20" },
];

function assertSalesSummaryParity(
  actual: ReturnType<typeof buildSalesSummaryFromAggregates>,
  expected: ReturnType<typeof calculateSalesSummary>,
) {
  // 1. Exact equality on discrete scalar values & counts
  assert.equal(actual.date, expected.date);
  assert.equal(actual.count, expected.count, `count mismatch: actual=${actual.count}, expected=${expected.count}`);
  assert.equal(
    actual.productCount,
    expected.productCount,
    `productCount mismatch: actual=${actual.productCount}, expected=${expected.productCount}`,
  );
  assert.equal(
    actual.previousCount,
    expected.previousCount,
    `previousCount mismatch: actual=${actual.previousCount}, expected=${expected.previousCount}`,
  );

  // 2. Exact equality on object keys & structure
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
  assert.deepEqual(Object.keys(actual.byFuel).sort(), Object.keys(expected.byFuel).sort());
  assert.deepEqual(Object.keys(actual.byPayment).sort(), Object.keys(expected.byPayment).sort());
  assert.deepEqual(Object.keys(actual.fuelByPayment).sort(), Object.keys(expected.fuelByPayment).sort());
  assert.deepEqual(Object.keys(actual.productByPayment).sort(), Object.keys(expected.productByPayment).sort());

  // 3. Floating point tolerance for aggregate monetary and volume numbers
  assert.ok(
    Math.abs(actual.totalRevenue - expected.totalRevenue) < 1e-9,
    `totalRevenue mismatch: actual=${actual.totalRevenue}, expected=${expected.totalRevenue}`,
  );
  assert.ok(
    Math.abs(actual.fuelRevenue - expected.fuelRevenue) < 1e-9,
    `fuelRevenue mismatch: actual=${actual.fuelRevenue}, expected=${expected.fuelRevenue}`,
  );
  assert.ok(
    Math.abs(actual.productRevenue - expected.productRevenue) < 1e-9,
    `productRevenue mismatch: actual=${actual.productRevenue}, expected=${expected.productRevenue}`,
  );
  assert.ok(
    Math.abs(actual.totalLiters - expected.totalLiters) < 1e-9,
    `totalLiters mismatch: actual=${actual.totalLiters}, expected=${expected.totalLiters}`,
  );
  assert.ok(
    Math.abs(actual.previousRevenue - expected.previousRevenue) < 1e-9,
    `previousRevenue mismatch: actual=${actual.previousRevenue}, expected=${expected.previousRevenue}`,
  );
  assert.ok(
    Math.abs(actual.previousLiters - expected.previousLiters) < 1e-9,
    `previousLiters mismatch: actual=${actual.previousLiters}, expected=${expected.previousLiters}`,
  );

  for (const fuelKey of Object.keys(expected.byFuel)) {
    assert.equal(actual.byFuel[fuelKey].label, expected.byFuel[fuelKey].label);
    assert.ok(
      Math.abs(actual.byFuel[fuelKey].liters - expected.byFuel[fuelKey].liters) < 1e-9,
      `byFuel.${fuelKey}.liters mismatch`,
    );
    assert.ok(
      Math.abs(actual.byFuel[fuelKey].revenue - expected.byFuel[fuelKey].revenue) < 1e-9,
      `byFuel.${fuelKey}.revenue mismatch`,
    );
  }

  for (const p of Object.keys(expected.byPayment)) {
    assert.ok(Math.abs(actual.byPayment[p] - expected.byPayment[p]) < 1e-9, `byPayment.${p} mismatch`);
  }
  for (const p of Object.keys(expected.fuelByPayment)) {
    assert.ok(Math.abs(actual.fuelByPayment[p] - expected.fuelByPayment[p]) < 1e-9, `fuelByPayment.${p} mismatch`);
  }
  for (const p of Object.keys(expected.productByPayment)) {
    assert.ok(Math.abs(actual.productByPayment[p] - expected.productByPayment[p]) < 1e-9, `productByPayment.${p} mismatch`);
  }
}

test("Parity A: Empty day matches calculateSalesSummary", () => {
  const expected = calculateSalesSummary("2026-10-04", [], [], [], []);
  const actual = buildSalesSummaryFromAggregates({
    date: "2026-10-04",
    fuelTypes: TEST_FUEL_TYPES,
    fuelSalesGroup: [],
    productSalesGroup: [],
    previousFuel: { _sum: { totalAmount: null, liters: null }, _count: { id: 0 } },
    previousProduct: { _sum: { totalAmount: null }, _count: { id: 0 } },
  });

  assertSalesSummaryParity(actual, expected);
});

test("Parity B: Fuel sales only with multiple fuels and multiple transactions", () => {
  const rawSales = [
    { totalAmount: 300, liters: 10, paymentMethod: "cash", fuelType: { name: "diesel", label: "ดีเซล" } },
    { totalAmount: 450, liters: 15, paymentMethod: "transfer", fuelType: { name: "diesel", label: "ดีเซล" } },
    { totalAmount: 200, liters: 5, paymentMethod: "cash", fuelType: { name: "benzin95", label: "เบนซิน 95" } },
    { totalAmount: 400, liters: 10, paymentMethod: "qr", fuelType: { name: "benzin95", label: "เบนซิน 95" } },
  ];
  const expected = calculateSalesSummary("2026-10-04", rawSales, [], [], []);

  const actual = buildSalesSummaryFromAggregates({
    date: "2026-10-04",
    fuelTypes: TEST_FUEL_TYPES,
    fuelSalesGroup: [
      { fuelTypeId: 1, paymentMethod: "cash", _sum: { totalAmount: 300, liters: 10 }, _count: { id: 1 } },
      { fuelTypeId: 1, paymentMethod: "transfer", _sum: { totalAmount: 450, liters: 15 }, _count: { id: 1 } },
      { fuelTypeId: 2, paymentMethod: "cash", _sum: { totalAmount: 200, liters: 5 }, _count: { id: 1 } },
      { fuelTypeId: 2, paymentMethod: "qr", _sum: { totalAmount: 400, liters: 10 }, _count: { id: 1 } },
    ],
    productSalesGroup: [],
    previousFuel: { _sum: { totalAmount: null, liters: null }, _count: { id: 0 } },
    previousProduct: { _sum: { totalAmount: null }, _count: { id: 0 } },
  });

  assertSalesSummaryParity(actual, expected);
});

test("Parity C: Product sales only with quantity > 1 (verifies productCount = SUM(quantity))", () => {
  const rawProducts = [
    { totalAmount: 200, quantity: 2, paymentMethod: "cash" },
    { totalAmount: 350, quantity: 5, paymentMethod: "transfer" },
  ];
  const expected = calculateSalesSummary("2026-10-04", [], rawProducts, [], []);

  const actual = buildSalesSummaryFromAggregates({
    date: "2026-10-04",
    fuelTypes: TEST_FUEL_TYPES,
    fuelSalesGroup: [],
    productSalesGroup: [
      { paymentMethod: "cash", _sum: { totalAmount: 200, quantity: 2 }, _count: { id: 1 } },
      { paymentMethod: "transfer", _sum: { totalAmount: 350, quantity: 5 }, _count: { id: 1 } },
    ],
    previousFuel: { _sum: { totalAmount: null, liters: null }, _count: { id: 0 } },
    previousProduct: { _sum: { totalAmount: null }, _count: { id: 0 } },
  });

  assertSalesSummaryParity(actual, expected);
});

test("Parity D: Previous day only (verifies previousCount = Sale rows + Product rows)", () => {
  const prevSales = [
    { totalAmount: 300, liters: 10 },
    { totalAmount: 600, liters: 20 },
  ];
  const prevProducts = [
    { totalAmount: 50 },
    { totalAmount: 100 },
    { totalAmount: 150 },
  ];
  const expected = calculateSalesSummary("2026-10-04", [], [], prevSales, prevProducts);

  const actual = buildSalesSummaryFromAggregates({
    date: "2026-10-04",
    fuelTypes: TEST_FUEL_TYPES,
    fuelSalesGroup: [],
    productSalesGroup: [],
    previousFuel: { _sum: { totalAmount: 900, liters: 30 }, _count: { id: 2 } },
    previousProduct: { _sum: { totalAmount: 300 }, _count: { id: 3 } },
  });

  assertSalesSummaryParity(actual, expected);
});

test("Parity E: Multiple payment methods breakdown (cash, transfer, credit, qr)", () => {
  const rawSales = [
    { totalAmount: 1000, liters: 30, paymentMethod: "cash", fuelType: { name: "diesel", label: "ดีเซล" } },
    { totalAmount: 500, liters: 15, paymentMethod: "transfer", fuelType: { name: "diesel", label: "ดีเซล" } },
    { totalAmount: 800, liters: 20, paymentMethod: "credit", fuelType: { name: "diesel", label: "ดีเซล" } },
    { totalAmount: 300, liters: 8, paymentMethod: "qr", fuelType: { name: "benzin95", label: "เบนซิน 95" } },
  ];
  const rawProducts = [
    { totalAmount: 100, quantity: 1, paymentMethod: "cash" },
    { totalAmount: 200, quantity: 2, paymentMethod: "transfer" },
    { totalAmount: 150, quantity: 1, paymentMethod: "credit" },
  ];
  const expected = calculateSalesSummary("2026-10-04", rawSales, rawProducts, [], []);

  const actual = buildSalesSummaryFromAggregates({
    date: "2026-10-04",
    fuelTypes: TEST_FUEL_TYPES,
    fuelSalesGroup: [
      { fuelTypeId: 1, paymentMethod: "cash", _sum: { totalAmount: 1000, liters: 30 }, _count: { id: 1 } },
      { fuelTypeId: 1, paymentMethod: "transfer", _sum: { totalAmount: 500, liters: 15 }, _count: { id: 1 } },
      { fuelTypeId: 1, paymentMethod: "credit", _sum: { totalAmount: 800, liters: 20 }, _count: { id: 1 } },
      { fuelTypeId: 2, paymentMethod: "qr", _sum: { totalAmount: 300, liters: 8 }, _count: { id: 1 } },
    ],
    productSalesGroup: [
      { paymentMethod: "cash", _sum: { totalAmount: 100, quantity: 1 }, _count: { id: 1 } },
      { paymentMethod: "transfer", _sum: { totalAmount: 200, quantity: 2 }, _count: { id: 1 } },
      { paymentMethod: "credit", _sum: { totalAmount: 150, quantity: 1 }, _count: { id: 1 } },
    ],
    previousFuel: { _sum: { totalAmount: null, liters: null }, _count: { id: 0 } },
    previousProduct: { _sum: { totalAmount: null }, _count: { id: 0 } },
  });

  assertSalesSummaryParity(actual, expected);
});

test("Parity F: Mixed fuel + product sales full check", () => {
  const rawSales = [
    { totalAmount: 300, liters: 10, paymentMethod: "cash", fuelType: { name: "diesel", label: "ดีเซล" } },
    { totalAmount: 200, liters: 5, paymentMethod: "qr", fuelType: { name: "benzin95", label: "เบนซิน 95" } },
  ];
  const rawProducts = [
    { totalAmount: 40, quantity: 2, paymentMethod: "cash" },
    { totalAmount: 60, quantity: 1, paymentMethod: "transfer" },
  ];
  const prevSales = [{ totalAmount: 120, liters: 4 }];
  const prevProducts = [{ totalAmount: 20 }];
  const expected = calculateSalesSummary("2026-10-04", rawSales, rawProducts, prevSales, prevProducts);

  const actual = buildSalesSummaryFromAggregates({
    date: "2026-10-04",
    fuelTypes: TEST_FUEL_TYPES,
    fuelSalesGroup: [
      { fuelTypeId: 1, paymentMethod: "cash", _sum: { totalAmount: 300, liters: 10 }, _count: { id: 1 } },
      { fuelTypeId: 2, paymentMethod: "qr", _sum: { totalAmount: 200, liters: 5 }, _count: { id: 1 } },
    ],
    productSalesGroup: [
      { paymentMethod: "cash", _sum: { totalAmount: 40, quantity: 2 }, _count: { id: 1 } },
      { paymentMethod: "transfer", _sum: { totalAmount: 60, quantity: 1 }, _count: { id: 1 } },
    ],
    previousFuel: { _sum: { totalAmount: 120, liters: 4 }, _count: { id: 1 } },
    previousProduct: { _sum: { totalAmount: 20 }, _count: { id: 1 } },
  });

  assertSalesSummaryParity(actual, expected);
});

test("Parity G: Multiple payment rows for same fuelType collapse cleanly into byFuel", () => {
  const rawSales = [
    { totalAmount: 100, liters: 3.5, paymentMethod: "cash", fuelType: { name: "diesel", label: "ดีเซล" } },
    { totalAmount: 200, liters: 7.0, paymentMethod: "cash", fuelType: { name: "diesel", label: "ดีเซล" } },
    { totalAmount: 300, liters: 10.5, paymentMethod: "transfer", fuelType: { name: "diesel", label: "ดีเซล" } },
  ];
  const expected = calculateSalesSummary("2026-10-04", rawSales, [], [], []);

  // In DB groupBy(["fuelTypeId", "paymentMethod"]), cash rows (100+200) collapse into 1 row, transfer into 1 row
  const actual = buildSalesSummaryFromAggregates({
    date: "2026-10-04",
    fuelTypes: TEST_FUEL_TYPES,
    fuelSalesGroup: [
      { fuelTypeId: 1, paymentMethod: "cash", _sum: { totalAmount: 300, liters: 10.5 }, _count: { id: 2 } },
      { fuelTypeId: 1, paymentMethod: "transfer", _sum: { totalAmount: 300, liters: 10.5 }, _count: { id: 1 } },
    ],
    productSalesGroup: [],
    previousFuel: { _sum: { totalAmount: null, liters: null }, _count: { id: 0 } },
    previousProduct: { _sum: { totalAmount: null }, _count: { id: 0 } },
  });

  assertSalesSummaryParity(actual, expected);
  // Specifically verify that byFuel.diesel has total of both rows
  assert.equal(actual.byFuel.diesel.liters, 21);
  assert.equal(actual.byFuel.diesel.revenue, 600);
});

test("Parity H: Unknown/custom payment method (voucher)", () => {
  const rawSales = [
    { totalAmount: 500, liters: 15, paymentMethod: "voucher", fuelType: { name: "diesel", label: "ดีเซล" } },
  ];
  const rawProducts = [
    { totalAmount: 80, quantity: 1, paymentMethod: "voucher" },
  ];
  const expected = calculateSalesSummary("2026-10-04", rawSales, rawProducts, [], []);

  const actual = buildSalesSummaryFromAggregates({
    date: "2026-10-04",
    fuelTypes: TEST_FUEL_TYPES,
    fuelSalesGroup: [
      { fuelTypeId: 1, paymentMethod: "voucher", _sum: { totalAmount: 500, liters: 15 }, _count: { id: 1 } },
    ],
    productSalesGroup: [
      { paymentMethod: "voucher", _sum: { totalAmount: 80, quantity: 1 }, _count: { id: 1 } },
    ],
    previousFuel: { _sum: { totalAmount: null, liters: null }, _count: { id: 0 } },
    previousProduct: { _sum: { totalAmount: null }, _count: { id: 0 } },
  });

  assertSalesSummaryParity(actual, expected);
});

test("Security & integrity: throws explicit error when fuelTypeId is not in metadata map", () => {
  assert.throws(
    () => {
      buildSalesSummaryFromAggregates({
        date: "2026-10-04",
        fuelTypes: [{ id: 1, name: "diesel", label: "ดีเซล" }],
        fuelSalesGroup: [
          // FuelTypeId 999 does not exist in fuelTypes!
          { fuelTypeId: 999, paymentMethod: "cash", _sum: { totalAmount: 500, liters: 10 }, _count: { id: 1 } },
        ],
        productSalesGroup: [],
        previousFuel: { _sum: { totalAmount: null, liters: null }, _count: { id: 0 } },
        previousProduct: { _sum: { totalAmount: null }, _count: { id: 0 } },
      });
    },
    /unknown fuelTypeId: 999/,
  );
});

test("Null safety: null sums in DB aggregates normalize to 0 without NaN", () => {
  const actual = buildSalesSummaryFromAggregates({
    date: "2026-10-04",
    fuelTypes: TEST_FUEL_TYPES,
    fuelSalesGroup: [
      { fuelTypeId: 1, paymentMethod: "cash", _sum: { totalAmount: null, liters: null }, _count: { id: 0 } },
    ],
    productSalesGroup: [
      { paymentMethod: "cash", _sum: { totalAmount: null, quantity: null }, _count: { id: 0 } },
    ],
    previousFuel: { _sum: { totalAmount: null, liters: null }, _count: { id: 0 } },
    previousProduct: { _sum: { totalAmount: null }, _count: { id: 0 } },
  });

  assert.equal(actual.totalRevenue, 0);
  assert.equal(actual.fuelRevenue, 0);
  assert.equal(actual.productRevenue, 0);
  assert.equal(actual.totalLiters, 0);
  assert.equal(actual.count, 0);
  assert.equal(actual.productCount, 0);
  assert.equal(actual.previousRevenue, 0);
  assert.equal(actual.previousLiters, 0);
  assert.equal(actual.previousCount, 0);
});
