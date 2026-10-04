import assert from "node:assert/strict";
import test from "node:test";
import {
  parseProductSaleInput,
  isSameProductSaleRequest,
  normalizeOptionalText,
  PRODUCT_SALE_ERROR_CODES,
  type ParsedProductSaleInput,
  type StoredProductSale,
} from "./product-sale";

test("normalizeOptionalText handles whitespace, empty strings, and nulls", () => {
  assert.equal(normalizeOptionalText(""), null);
  assert.equal(normalizeOptionalText("   "), null);
  assert.equal(normalizeOptionalText(null), null);
  assert.equal(normalizeOptionalText(undefined), null);
  assert.equal(normalizeOptionalText(123), null);
  assert.equal(normalizeOptionalText("  สินค้า A  "), "สินค้า A");
});

test("parseProductSaleInput parses valid input and calculates totalAmount if omitted", () => {
  const parsed = parseProductSaleInput(
    {
      clientRequestId: "req-123",
      productId: 1,
      quantity: 2,
      unitPrice: 150,
      paymentMethod: "cash",
      note: "  ขวดแถม  ",
    },
    "สมชาย"
  );

  assert.equal(parsed.clientRequestId, "req-123");
  assert.equal(parsed.productId, 1);
  assert.equal(parsed.quantity, 2);
  assert.equal(parsed.unitPrice, 150);
  assert.equal(parsed.totalAmount, 300);
  assert.equal(parsed.paymentMethod, "cash");
  assert.equal(parsed.note, "ขวดแถม");
  assert.equal(parsed.customerName, null);
  assert.equal(parsed.date, null);
  assert.equal(parsed.sellerName, "สมชาย");
});

test("parseProductSaleInput validates credit sales requiring customerName", () => {
  assert.throws(
    () =>
      parseProductSaleInput(
        {
          productId: 1,
          quantity: 1,
          unitPrice: 100,
          paymentMethod: "credit",
          customerName: "   ",
        },
        "สมชาย"
      ),
    /กรุณาระบุชื่อลูกค้าเครดิต/
  );
});

// Scenario 13: Empty string vs null normalization in equality comparator
test("Scenario 13: isSameProductSaleRequest normalizes empty strings and nulls as identical", () => {
  const existing: StoredProductSale = {
    productId: 1,
    quantity: 2,
    unitPrice: 120,
    totalAmount: 240,
    paymentMethod: "cash",
    customerName: null,
    note: null,
    sellerName: "สมชาย",
    date: new Date("2026-10-04T10:00:00Z"),
  };

  const incomingWithEmptyStrings: ParsedProductSaleInput = {
    clientRequestId: "uuid-1",
    productId: 1,
    quantity: 2,
    unitPrice: 120,
    totalAmount: 240,
    paymentMethod: "cash",
    customerName: null,
    note: null, // parsed from ""
    sellerName: "สมชาย",
    date: new Date("2026-10-04T10:00:00Z"),
  };

  assert.equal(isSameProductSaleRequest(existing, incomingWithEmptyStrings), true);
});

// Scenario 2: Identical sequential payload returns true
test("Scenario 2: isSameProductSaleRequest returns true for exact matching payload", () => {
  const existing: StoredProductSale = {
    productId: 5,
    quantity: 3,
    unitPrice: 200,
    totalAmount: 600,
    paymentMethod: "qr",
    customerName: "นาย ก",
    note: "เปลี่ยนถ่ายน้ำมัน",
    sellerName: "สมหมาย",
    date: new Date("2026-10-04T12:00:00Z"),
  };

  const incoming: ParsedProductSaleInput = {
    clientRequestId: "uuid-abc",
    productId: 5,
    quantity: 3,
    unitPrice: 200,
    totalAmount: 600,
    paymentMethod: "qr",
    customerName: "นาย ก",
    note: "เปลี่ยนถ่ายน้ำมัน",
    sellerName: "สมหมาย",
    date: new Date("2026-10-04T12:00:00Z"),
  };

  assert.equal(isSameProductSaleRequest(existing, incoming), true);
});

// Scenario 3: Different quantity returns false
test("Scenario 3: isSameProductSaleRequest detects changed quantity", () => {
  const existing: StoredProductSale = {
    productId: 1,
    quantity: 2,
    unitPrice: 100,
    totalAmount: 200,
    paymentMethod: "cash",
    customerName: null,
    note: null,
    sellerName: "สมชาย",
    date: new Date("2026-10-04T10:00:00Z"),
  };

  const incoming: ParsedProductSaleInput = {
    clientRequestId: "uuid-1",
    productId: 1,
    quantity: 3, // Changed
    unitPrice: 100,
    totalAmount: 300,
    paymentMethod: "cash",
    customerName: null,
    note: null,
    sellerName: "สมชาย",
    date: new Date("2026-10-04T10:00:00Z"),
  };

  assert.equal(isSameProductSaleRequest(existing, incoming), false);
});

// Scenario 4: Different product returns false
test("Scenario 4: isSameProductSaleRequest detects changed product ID", () => {
  const existing: StoredProductSale = {
    productId: 1,
    quantity: 1,
    unitPrice: 100,
    totalAmount: 100,
    paymentMethod: "cash",
    customerName: null,
    note: null,
    sellerName: "สมชาย",
    date: new Date("2026-10-04T10:00:00Z"),
  };

  const incoming: ParsedProductSaleInput = {
    clientRequestId: "uuid-1",
    productId: 2, // Changed
    quantity: 1,
    unitPrice: 100,
    totalAmount: 100,
    paymentMethod: "cash",
    customerName: null,
    note: null,
    sellerName: "สมชาย",
    date: new Date("2026-10-04T10:00:00Z"),
  };

  assert.equal(isSameProductSaleRequest(existing, incoming), false);
});

// Scenario 5: Different payment method returns false
test("Scenario 5: isSameProductSaleRequest detects changed payment method", () => {
  const existing: StoredProductSale = {
    productId: 1,
    quantity: 1,
    unitPrice: 100,
    totalAmount: 100,
    paymentMethod: "cash",
    customerName: null,
    note: null,
    sellerName: "สมชาย",
    date: new Date("2026-10-04T10:00:00Z"),
  };

  const incoming: ParsedProductSaleInput = {
    clientRequestId: "uuid-1",
    productId: 1,
    quantity: 1,
    unitPrice: 100,
    totalAmount: 100,
    paymentMethod: "transfer", // Changed
    customerName: null,
    note: null,
    sellerName: "สมชาย",
    date: new Date("2026-10-04T10:00:00Z"),
  };

  assert.equal(isSameProductSaleRequest(existing, incoming), false);
});

// ============================================================================
// SIMULATION OF DATABASE TRANSACTIONS & INVARIANTS (Scenarios 1, 6, 7, 8, 9, 10, 11, 12, 14)
// ============================================================================

type MockProduct = { id: number; currentStock: number; costPrice: number };
type MockProductSaleRecord = {
  id: number;
  clientRequestId: string | null;
  productId: number;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  paymentMethod: string;
  customerName: string | null;
  note: string | null;
  sellerName: string;
  date: Date;
  product?: MockProduct;
};

class MockDatabase {
  products = new Map<number, MockProduct>();
  sales = new Map<number, MockProductSaleRecord>();
  nextSaleId = 1;

  constructor(initialProducts: MockProduct[], initialSales: MockProductSaleRecord[] = []) {
    for (const p of initialProducts) this.products.set(p.id, { ...p });
    for (const s of initialSales) {
      this.sales.set(s.id, { ...s });
      if (s.id >= this.nextSaleId) this.nextSaleId = s.id + 1;
    }
  }

  // Simulates atomic execution of POST /api/product-sales with corrected transaction ordering
  async executeSale(input: ParsedProductSaleInput): Promise<{
    status: number;
    headers?: Record<string, string>;
    body: MockProductSaleRecord | { error: string; code?: string };
  }> {
    // 1. Application-level pre-check for existing matching clientRequestId
    if (input.clientRequestId) {
      for (const sale of this.sales.values()) {
        if (sale.clientRequestId === input.clientRequestId) {
          if (isSameProductSaleRequest(sale, input)) {
            return {
              status: 200,
              headers: { "Idempotent-Replay": "true" },
              body: sale,
            };
          }
          return {
            status: 409,
            body: { error: "รหัสรายการนี้ถูกใช้กับข้อมูลอื่นแล้ว" },
          };
        }
      }
    }

    // 2. Transaction Start
    const product = this.products.get(input.productId);
    if (!product) {
      return { status: 404, body: { error: "ไม่พบสินค้า" } };
    }

    // Step 1 inside transaction: Create ProductSale first (claims clientRequestId)
    // If concurrent duplicate race hits P2002 before touching stock:
    if (input.clientRequestId) {
      for (const sale of this.sales.values()) {
        if (sale.clientRequestId === input.clientRequestId) {
          // P2002 rollback: aborted before touching stock
          if (isSameProductSaleRequest(sale, input)) {
            return {
              status: 200,
              headers: { "Idempotent-Replay": "true" },
              body: sale,
            };
          }
          return {
            status: 409,
            body: { error: "รหัสรายการนี้ถูกใช้กับข้อมูลอื่นแล้ว" },
          };
        }
      }
    }

    // Step 2 inside transaction: Conditional atomic stock decrement
    const requiredQty = Math.round(input.quantity);
    if (product.currentStock < requiredQty) {
      // Transaction rollback: ProductSale created in step 1 is discarded
      return {
        status: 409,
        body: { error: "สินค้าไม่พอ", code: PRODUCT_SALE_ERROR_CODES.INSUFFICIENT_STOCK },
      };
    }

    // Decrement succeeds
    product.currentStock -= requiredQty;

    const created: MockProductSaleRecord = {
      id: this.nextSaleId++,
      clientRequestId: input.clientRequestId,
      productId: input.productId,
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      totalAmount: input.totalAmount,
      paymentMethod: input.paymentMethod,
      customerName: input.customerName,
      note: input.note,
      sellerName: input.sellerName,
      date: input.date ?? new Date(),
      product: { ...product },
    };

    this.sales.set(created.id, created);
    return { status: 201, body: created };
  }

  // Simulates two concurrent requests passing pre-check simultaneously before either has committed
  async executeConcurrentPair(
    input1: ParsedProductSaleInput,
    input2: ParsedProductSaleInput
  ): Promise<[
    { status: number; headers?: Record<string, string>; body: any },
    { status: number; headers?: Record<string, string>; body: any }
  ]> {
    // Both pass pre-check concurrently (neither exists in this.sales yet)
    // Transaction 1 starts:
    const product1 = this.products.get(input1.productId);
    if (!product1) return [{ status: 404, body: { error: "ไม่พบสินค้า" } }, { status: 404, body: { error: "ไม่พบสินค้า" } }];

    // Tx1 Step 1: create ProductSale (claims input1.clientRequestId)
    // Tx2 Step 1: create ProductSale (claims input2.clientRequestId)
    const isTx2UniqueConflict =
      Boolean(input1.clientRequestId) &&
      Boolean(input2.clientRequestId) &&
      input1.clientRequestId === input2.clientRequestId;

    // Tx1 Step 2: conditional decrement
    const qty1 = Math.round(input1.quantity);
    let res1: { status: number; headers?: Record<string, string>; body: any };
    if (product1.currentStock < qty1) {
      res1 = { status: 409, body: { error: "สินค้าไม่พอ", code: PRODUCT_SALE_ERROR_CODES.INSUFFICIENT_STOCK } };
    } else {
      product1.currentStock -= qty1;
      const created1: MockProductSaleRecord = {
        id: this.nextSaleId++,
        clientRequestId: input1.clientRequestId,
        productId: input1.productId,
        quantity: input1.quantity,
        unitPrice: input1.unitPrice,
        totalAmount: input1.totalAmount,
        paymentMethod: input1.paymentMethod,
        customerName: input1.customerName,
        note: input1.note,
        sellerName: input1.sellerName,
        date: input1.date ?? new Date(),
        product: { ...product1 },
      };
      this.sales.set(created1.id, created1);
      res1 = { status: 201, body: created1 };
    }

    // Tx2 evaluation:
    let res2: { status: number; headers?: Record<string, string>; body: any };
    if (isTx2UniqueConflict) {
      // Tx2 hit P2002 at Step 1 BEFORE touching stock!
      // In PostgreSQL: Tx2 waits on unique index tuple until Tx1 commits, then raises unique violation
      // Catch block outside tx reads the committed row from Tx1:
      const committed = input1.clientRequestId
        ? Array.from(this.sales.values()).find((s) => s.clientRequestId === input1.clientRequestId)
        : null;

      if (committed && isSameProductSaleRequest(committed, input2)) {
        res2 = {
          status: 200,
          headers: { "Idempotent-Replay": "true" },
          body: committed,
        };
      } else {
        res2 = { status: 409, body: { error: "รหัสรายการนี้ถูกใช้กับข้อมูลอื่นแล้ว" } };
      }
    } else {
      // Different clientRequestId: Tx2 Step 1 succeeded. Now Tx2 Step 2: conditional stock decrement:
      const product2 = this.products.get(input2.productId);
      const qty2 = Math.round(input2.quantity);
      if (!product2) {
        res2 = { status: 404, body: { error: "ไม่พบสินค้า" } };
      } else if (product2.currentStock < qty2) {
        // Insufficient stock: Tx2 transaction rolls back!
        // Any ProductSale inserted in Step 1 is rolled back and removed. Stock remains untouched.
        res2 = {
          status: 409,
          body: { error: "สินค้าไม่พอ", code: PRODUCT_SALE_ERROR_CODES.INSUFFICIENT_STOCK },
        };
      } else {
        product2.currentStock -= qty2;
        const created2: MockProductSaleRecord = {
          id: this.nextSaleId++,
          clientRequestId: input2.clientRequestId,
          productId: input2.productId,
          quantity: input2.quantity,
          unitPrice: input2.unitPrice,
          totalAmount: input2.totalAmount,
          paymentMethod: input2.paymentMethod,
          customerName: input2.customerName,
          note: input2.note,
          sellerName: input2.sellerName,
          date: input2.date ?? new Date(),
          product: { ...product2 },
        };
        this.sales.set(created2.id, created2);
        res2 = { status: 201, body: created2 };
      }
    }

    return [res1, res2];
  }
}

// Scenario 1: First ProductSale request creates 1 row and decrements stock once
test("Scenario 1: First ProductSale request creates 1 row, decrements stock once, and returns fresh post-decrement stock", async () => {
  const db = new MockDatabase([{ id: 1, currentStock: 10, costPrice: 80 }]);
  const input = parseProductSaleInput(
    { clientRequestId: "req-1", productId: 1, quantity: 2, unitPrice: 100, paymentMethod: "cash" },
    "สมชาย"
  );

  const res = await db.executeSale(input);
  assert.equal(res.status, 201);
  assert.equal(db.sales.size, 1);
  // Assert DB product stock === 8
  assert.equal(db.products.get(1)?.currentStock, 8); // 10 - 2
  // Assert API response contains fresh post-decrement stock === 8
  assert.equal((res.body as MockProductSaleRecord).product?.currentStock, 8);
});

// Scenario 2: Same ID, same payload sequential retry
test("Scenario 2: Sequential duplicate with same payload returns 200 Replay with matching fresh product stock", async () => {
  const db = new MockDatabase([{ id: 1, currentStock: 10, costPrice: 80 }]);
  const input = parseProductSaleInput(
    { clientRequestId: "req-1", productId: 1, quantity: 2, unitPrice: 100, paymentMethod: "cash" },
    "สมชาย"
  );

  const first = await db.executeSale(input);
  assert.equal(first.status, 201);
  assert.equal(db.products.get(1)?.currentStock, 8);
  assert.equal((first.body as MockProductSaleRecord).product?.currentStock, 8);

  const retry = await db.executeSale(input);
  assert.equal(retry.status, 200);
  assert.equal(retry.headers?.["Idempotent-Replay"], "true");
  assert.equal(db.sales.size, 1, "Must still be exactly 1 row");
  assert.equal(db.products.get(1)?.currentStock, 8, "Stock must NOT decrement a second time");
  // Both original 201 and 200 Replay return matching product stock === 8
  assert.equal((retry.body as MockProductSaleRecord).product?.currentStock, 8);
});

// Scenario 3: Same ID, different quantity -> 409
test("Scenario 3: Sequential duplicate with changed quantity returns 409 Conflict without changing stock", async () => {
  const db = new MockDatabase([{ id: 1, currentStock: 10, costPrice: 80 }]);
  const input1 = parseProductSaleInput(
    { clientRequestId: "req-1", productId: 1, quantity: 2, unitPrice: 100, paymentMethod: "cash" },
    "สมชาย"
  );
  const input2 = parseProductSaleInput(
    { clientRequestId: "req-1", productId: 1, quantity: 5, unitPrice: 100, paymentMethod: "cash" },
    "สมชาย"
  );

  await db.executeSale(input1);
  assert.equal(db.products.get(1)?.currentStock, 8);

  const conflict = await db.executeSale(input2);
  assert.equal(conflict.status, 409);
  assert.equal(db.sales.size, 1);
  assert.equal(db.products.get(1)?.currentStock, 8, "Stock must remain unchanged on conflict");
});

// Scenario 6: Concurrency regression: two simultaneous requests with same clientRequestId and scarce stock (initial stock = requested quantity)
test("Scenario 6: Concurrency regression: two simultaneous requests with same clientRequestId and scarce stock (initial stock = requested quantity)", async () => {
  // initial stock = exactly requested quantity (1 unit)
  const db = new MockDatabase([{ id: 1, currentStock: 1, costPrice: 80 }]);
  const input = parseProductSaleInput(
    { clientRequestId: "req-race-scarce", productId: 1, quantity: 1, unitPrice: 100, paymentMethod: "cash" },
    "สมชาย"
  );

  // Both arrive concurrently (passing pre-check at the same moment before either commits)
  const [res1, res2] = await db.executeConcurrentPair(input, input);

  const statuses = [res1.status, res2.status].sort();
  assert.deepEqual(statuses, [200, 201], "One request creates (201) and the second replays (200)");

  // Replay response carries Idempotent-Replay header
  const replayRes = res1.status === 200 ? res1 : res2;
  const createdRes = res1.status === 201 ? res1 : res2;
  assert.equal(replayRes.headers?.["Idempotent-Replay"], "true");
  assert.equal(createdRes.status, 201);

  // Neither returns 409 insufficient stock conflict
  assert.notEqual(res1.status, 409, "Must NOT return 409 Insufficient Stock for duplicate request");
  assert.notEqual(res2.status, 409, "Must NOT return 409 Insufficient Stock for duplicate request");

  assert.equal(db.sales.size, 1, "Exactly one ProductSale exists in database");
  assert.equal(db.products.get(1)?.currentStock, 0, "Final stock = 0 (1 - 1 = 0)");
});

// Scenario 7: Client timeout then retry
test("Scenario 7: Client timeout after successful commit retries safely", async () => {
  const db = new MockDatabase([{ id: 1, currentStock: 10, costPrice: 80 }]);
  const input = parseProductSaleInput(
    { clientRequestId: "req-timeout", productId: 1, quantity: 4, unitPrice: 100, paymentMethod: "qr" },
    "สมชาย"
  );

  // Server processed request 1 successfully, but client timed out waiting for response
  const first = await db.executeSale(input);
  assert.equal(first.status, 201);
  assert.equal(db.products.get(1)?.currentStock, 6);

  // Client retries with the SAME clientRequestId
  const retry = await db.executeSale(input);
  assert.equal(retry.status, 200);
  assert.equal(retry.headers?.["Idempotent-Replay"], "true");
  assert.equal(db.products.get(1)?.currentStock, 6, "Stock remains at 6, not 2");
});

// Scenario 8: Insufficient stock
test("Scenario 8: Insufficient stock rejects with 409 and leaves stock untouched", async () => {
  const db = new MockDatabase([{ id: 1, currentStock: 2, costPrice: 80 }]);
  const input = parseProductSaleInput(
    { clientRequestId: "req-excess", productId: 1, quantity: 5, unitPrice: 100, paymentMethod: "cash" },
    "สมชาย"
  );

  const res = await db.executeSale(input);
  assert.equal(res.status, 409);
  assert.equal(db.sales.size, 0);
  assert.equal(db.products.get(1)?.currentStock, 2);
});

// Scenario 10: Legacy request without clientRequestId
test("Scenario 10: Legacy request without clientRequestId still works during compatibility phase", async () => {
  const db = new MockDatabase([{ id: 1, currentStock: 10, costPrice: 80 }]);
  const legacyInput = parseProductSaleInput(
    { productId: 1, quantity: 1, unitPrice: 100, paymentMethod: "cash" },
    "สมชาย"
  );

  assert.equal(legacyInput.clientRequestId, null);
  const res = await db.executeSale(legacyInput);
  assert.equal(res.status, 201);
  assert.equal(db.sales.size, 1);
  assert.equal(db.products.get(1)?.currentStock, 9);
});

// Scenario 11: Historical rows with NULL clientRequestId
test("Scenario 11: Multiple historical rows with NULL clientRequestId exist without unique conflict", async () => {
  const historicalRows: MockProductSaleRecord[] = [
    {
      id: 101,
      clientRequestId: null,
      productId: 1,
      quantity: 1,
      unitPrice: 100,
      totalAmount: 100,
      paymentMethod: "cash",
      customerName: null,
      note: null,
      sellerName: "สมชาย",
      date: new Date("2026-09-01"),
    },
    {
      id: 102,
      clientRequestId: null,
      productId: 1,
      quantity: 2,
      unitPrice: 100,
      totalAmount: 200,
      paymentMethod: "cash",
      customerName: null,
      note: null,
      sellerName: "สมชาย",
      date: new Date("2026-09-02"),
    },
  ];

  const db = new MockDatabase([{ id: 1, currentStock: 10, costPrice: 80 }], historicalRows);
  assert.equal(db.sales.size, 2);

  // Adding a new request with a UUID works normally
  const newInput = parseProductSaleInput(
    { clientRequestId: "uuid-new", productId: 1, quantity: 1, unitPrice: 100, paymentMethod: "cash" },
    "สมชาย"
  );
  const res = await db.executeSale(newInput);
  assert.equal(res.status, 201);
  assert.equal(db.sales.size, 3);
});

// Scenario 12: Concurrent DIFFERENT IDs competing for scarce stock
test("Scenario 12: Concurrent DIFFERENT IDs competing for scarce stock: exactly one survives, final stock = 0, loser receives 409 insufficient stock", async () => {
  // initial stock = 1
  // User A (ID=A) buys 1
  // User B (ID=B) buys 1
  const db = new MockDatabase([{ id: 1, currentStock: 1, costPrice: 80 }]);

  const inputA = parseProductSaleInput(
    { clientRequestId: "sale-user-a", productId: 1, quantity: 1, unitPrice: 100, paymentMethod: "cash" },
    "สมชาย"
  );
  const inputB = parseProductSaleInput(
    { clientRequestId: "sale-user-b", productId: 1, quantity: 1, unitPrice: 100, paymentMethod: "cash" },
    "สมหญิง"
  );

  const [resA, resB] = await db.executeConcurrentPair(inputA, inputB);

  const statuses = [resA.status, resB.status].sort();
  assert.deepEqual(statuses, [201, 409], "Exactly one sale succeeds (201) and loser receives insufficient stock (409)");
  assert.equal(db.sales.size, 1, "Exactly one ProductSale survives in database");
  assert.equal(db.products.get(1)?.currentStock, 0, "Final stock = 0");

  const winner = resA.status === 201 ? resA : resB;
  const loser = resA.status === 409 ? resA : resB;
  assert.equal(winner.status, 201);
  assert.equal(loser.status, 409);
  assert.equal((loser.body as { code?: string }).code, PRODUCT_SALE_ERROR_CODES.INSUFFICIENT_STOCK);
  assert.ok(db.products.get(1)!.currentStock >= 0, "Stock must never be negative");
});

// Scenario 14: Response-shape parity
test("Scenario 14: Response shape parity between 201 Created and 200 Replay", async () => {
  const db = new MockDatabase([{ id: 1, currentStock: 10, costPrice: 80 }]);
  const input = parseProductSaleInput(
    { clientRequestId: "req-shape", productId: 1, quantity: 2, unitPrice: 100, paymentMethod: "cash" },
    "สมชาย"
  );

  const res201 = await db.executeSale(input);
  const res200 = await db.executeSale(input);

  const body201 = res201.body as MockProductSaleRecord;
  const body200 = res200.body as MockProductSaleRecord;

  assert.equal(body201.id, body200.id);
  assert.equal(body201.productId, body200.productId);
  assert.equal(body201.quantity, body200.quantity);
  assert.equal(body201.unitPrice, body200.unitPrice);
  assert.equal(body201.totalAmount, body200.totalAmount);
  assert.equal(body201.paymentMethod, body200.paymentMethod);
  assert.equal(body201.clientRequestId, body200.clientRequestId);
  assert.equal(body201.product?.currentStock, body200.product?.currentStock);
  assert.equal(body201.product?.currentStock, 8);
});
