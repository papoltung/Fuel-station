import assert from "node:assert/strict";
import test from "node:test";
import {
  parseStockCheckInput,
  STOCK_CHECK_ERROR_CODES,
  type ParsedStockCheckInput,
} from "./stock-check";

// ============================================================================
// OCC Mock Database & Concurrency Simulation for Sprint 2A
// ============================================================================

type MockFuelStock = {
  fuelTypeId: number;
  currentLiters: number;
  version: number;
};

type MockStockCheckRecord = {
  id: number;
  date: Date;
  fuelTypeId: number;
  systemLiters: number;
  actualLiters: number;
  difference: number;
  note: string | null;
};

class MockFuelStationDatabase {
  stocks = new Map<number, MockFuelStock>();
  stockChecks: MockStockCheckRecord[] = [];
  nextCheckId = 1;

  constructor(initialStocks: { fuelTypeId: number; currentLiters: number; version?: number }[]) {
    for (const s of initialStocks) {
      this.stocks.set(s.fuelTypeId, { ...s, version: s.version ?? 1 });
    }
  }

  // --- Proposed Production Implementation: Optimistic Concurrency Control (OCC) ---
  // Invariant: StockCheck requires expectedVersion. If version changed, 409 is returned.
  // Neither Sale nor Purchase is blocked. Frontline sales never fail because of StockCheck.
  async executeOCCStockCheck(
    input: ParsedStockCheckInput,
    options?: { shouldFailTransaction?: boolean }
  ): Promise<{
    status: number;
    body: MockStockCheckRecord | { error: string; code?: string };
  }> {
    // Legacy client guard: require expectedVersion to prevent silent overwrites
    if (input.expectedVersion === null) {
      return {
        status: 409,
        body: {
          error: "ข้อมูลเวอร์ชันสต็อกไม่ถูกต้อง กรุณารีเฟรชหน้าจอเพื่อรับข้อมูลล่าสุด",
          code: STOCK_CHECK_ERROR_CODES.VERSION_REQUIRED,
        },
      };
    }

    const stock = this.stocks.get(input.fuelTypeId);
    if (!stock) {
      return {
        status: 409,
        body: {
          error: "ยังไม่ได้เริ่มต้นสต็อกสำหรับชนิดน้ำมันนี้ กรุณาตั้งค่าสต็อกก่อนทำการวัดถัง",
          code: STOCK_CHECK_ERROR_CODES.FUEL_STOCK_NOT_INITIALIZED,
        },
      };
    }

    // Inside transaction:
    // 1. Version check FIRST
    if (stock.version !== input.expectedVersion) {
      // Version mismatch: Rollback transaction (StockCheck row discarded, stock untouched)
      return {
        status: 409,
        body: {
          error: "สต็อกน้ำมันมีการเปลี่ยนแปลงระหว่างการวัดถัง กรุณาโหลดข้อมูลล่าสุดและยืนยันอีกครั้ง",
          code: STOCK_CHECK_ERROR_CODES.STOCK_CHANGED_DURING_CHECK,
        },
      };
    }

    // 2. Server is the sole authority for system baseline and difference
    const systemLiters = stock.currentLiters;
    const difference = input.actualLiters - systemLiters;

    const check: MockStockCheckRecord = {
      id: this.nextCheckId++,
      date: input.date,
      fuelTypeId: input.fuelTypeId,
      systemLiters,
      actualLiters: input.actualLiters,
      difference,
      note: input.note,
    };

    if (options?.shouldFailTransaction) {
      // Simulate transaction failure rollback
      return { status: 500, body: { error: "จำลองข้อผิดพลาดใน Transaction" } };
    }

    // Conditional update succeeded (count === 1)
    stock.currentLiters = input.actualLiters;
    stock.version++;

    // Commit StockCheck row
    this.stockChecks.push(check);

    return { status: 201, body: check };
  }

  // Mutate stock via sale (increments version)
  async executeSale(fuelTypeId: number, liters: number): Promise<void> {
    const stock = this.stocks.get(fuelTypeId);
    if (!stock) throw new Error("Stock not found");
    stock.currentLiters -= liters;
    stock.version++;
  }

  // Mutate stock via purchase (increments version)
  async executePurchase(fuelTypeId: number, liters: number): Promise<void> {
    const stock = this.stocks.get(fuelTypeId);
    if (!stock) throw new Error("Stock not found");
    stock.currentLiters += liters;
    stock.version++;
  }
}

// ============================================================================
// Input Validation & Parsing Unit Tests
// ============================================================================

test("parseStockCheckInput parses valid input with expectedVersion", () => {
  const parsed = parseStockCheckInput({
    fuelTypeId: 1,
    actualLiters: 980,
    expectedSystemLiters: 1000,
    expectedVersion: 5,
    note: "  วัดถังเช้า  ",
    date: "2026-10-04T08:00:00Z",
  });

  assert.equal(parsed.fuelTypeId, 1);
  assert.equal(parsed.actualLiters, 980);
  assert.equal(parsed.expectedSystemLiters, 1000);
  assert.equal(parsed.expectedVersion, 5);
  assert.equal(parsed.note, "วัดถังเช้า");
});

test("parseStockCheckInput handles legacy input where expectedVersion is absent", () => {
  const parsed = parseStockCheckInput({
    fuelTypeId: 2,
    actualLiters: 500,
  });

  assert.equal(parsed.fuelTypeId, 2);
  assert.equal(parsed.actualLiters, 500);
  assert.equal(parsed.expectedVersion, null);
});

test("parseStockCheckInput strictly validates expectedVersion rejecting invalid formats", () => {
  const base = { fuelTypeId: 1, actualLiters: 100 };

  // Valid values
  assert.equal(parseStockCheckInput({ ...base, expectedVersion: 0 }).expectedVersion, 0);
  assert.equal(parseStockCheckInput({ ...base, expectedVersion: 5 }).expectedVersion, 5);
  assert.equal(parseStockCheckInput({ ...base, expectedVersion: "5" }).expectedVersion, 5);

  // Invalid values that must throw
  const invalidVersions = [
    5.5,
    "5.5",
    -1,
    "-1",
    "abc",
    "NaN",
    true,
    false,
    {},
    [],
  ];

  for (const v of invalidVersions) {
    assert.throws(
      () => parseStockCheckInput({ ...base, expectedVersion: v }),
      /เวอร์ชันสต็อกไม่ถูกต้อง/,
      `expectedVersion=${JSON.stringify(v)} must throw error`
    );
  }
});

// ============================================================================
// Sprint 2A OCC Tests (Scenarios A through H)
// ============================================================================

// Scenario A: Normal check without concurrent mutation
test("Scenario A: Normal check: 1000 L at V5, actual 980 => stock becomes 980, V6, diff -20", async () => {
  const db = new MockFuelStationDatabase([{ fuelTypeId: 1, currentLiters: 1000, version: 5 }]);
  const input = parseStockCheckInput({
    fuelTypeId: 1,
    actualLiters: 980,
    expectedSystemLiters: 1000,
    expectedVersion: 5,
  });

  const res = await db.executeOCCStockCheck(input);
  assert.equal(res.status, 201);
  assert.equal(db.stockChecks.length, 1);
  assert.equal(db.stockChecks[0].difference, -20);
  assert.equal(db.stocks.get(1)?.currentLiters, 980);
  assert.equal(db.stocks.get(1)?.version, 6);
});

// Scenario B: Sale occurs after snapshot
test("Scenario B: Sale after snapshot: snapshot 1000/V5, Sale -> 950/V6, StockCheck rejects with 409 and preserves sale", async () => {
  const db = new MockFuelStationDatabase([{ fuelTypeId: 1, currentLiters: 1000, version: 5 }]);
  const checkInput = parseStockCheckInput({
    fuelTypeId: 1,
    actualLiters: 980,
    expectedSystemLiters: 1000,
    expectedVersion: 5, // Client snapshot was taken at V5
  });

  // Frontline pump sale occurs: 50 L
  await db.executeSale(1, 50);
  assert.equal(db.stocks.get(1)?.currentLiters, 950);
  assert.equal(db.stocks.get(1)?.version, 6);

  // StockCheck arrives expecting V5:
  const res = await db.executeOCCStockCheck(checkInput);
  assert.equal(res.status, 409);
  assert.equal((res.body as { code?: string }).code, STOCK_CHECK_ERROR_CODES.STOCK_CHANGED_DURING_CHECK);

  // Assert sale is 100% preserved and no StockCheck row was created
  assert.equal(db.stocks.get(1)?.currentLiters, 950, "Sale effect of 50 L is strictly preserved");
  assert.equal(db.stocks.get(1)?.version, 6);
  assert.equal(db.stockChecks.length, 0, "No ghost StockCheck row created on OCC conflict");
});

// Scenario C: Purchase occurs after snapshot
test("Scenario C: Purchase after snapshot: snapshot 1000/V5, Purchase -> 3000/V6, StockCheck rejects with 409 and preserves delivery", async () => {
  const db = new MockFuelStationDatabase([{ fuelTypeId: 1, currentLiters: 1000, version: 5 }]);
  const checkInput = parseStockCheckInput({
    fuelTypeId: 1,
    actualLiters: 980,
    expectedSystemLiters: 1000,
    expectedVersion: 5,
  });

  // Tanker delivery arrives: 2000 L
  await db.executePurchase(1, 2000);
  assert.equal(db.stocks.get(1)?.currentLiters, 3000);
  assert.equal(db.stocks.get(1)?.version, 6);

  // StockCheck arrives expecting V5:
  const res = await db.executeOCCStockCheck(checkInput);
  assert.equal(res.status, 409);
  assert.equal((res.body as { code?: string }).code, STOCK_CHECK_ERROR_CODES.STOCK_CHANGED_DURING_CHECK);

  // Assert delivery is completely intact:
  assert.equal(db.stocks.get(1)?.currentLiters, 3000, "Tanker delivery is strictly preserved");
  assert.equal(db.stockChecks.length, 0);
});

// Scenario D: Two StockChecks on same snapshot
test("Scenario D: Two StockChecks on same snapshot: exactly one succeeds, second gets 409, exactly 1 row survives", async () => {
  const db = new MockFuelStationDatabase([{ fuelTypeId: 1, currentLiters: 1000, version: 5 }]);

  const inputA = parseStockCheckInput({
    fuelTypeId: 1,
    actualLiters: 980,
    expectedSystemLiters: 1000,
    expectedVersion: 5,
  });
  const inputB = parseStockCheckInput({
    fuelTypeId: 1,
    actualLiters: 975,
    expectedSystemLiters: 1000,
    expectedVersion: 5,
  });

  // Check A commits first:
  const resA = await db.executeOCCStockCheck(inputA);
  assert.equal(resA.status, 201);
  assert.equal(db.stocks.get(1)?.currentLiters, 980);
  assert.equal(db.stocks.get(1)?.version, 6);

  // Check B attempts with stale V5:
  const resB = await db.executeOCCStockCheck(inputB);
  assert.equal(resB.status, 409);
  assert.equal((resB.body as { code?: string }).code, STOCK_CHECK_ERROR_CODES.STOCK_CHANGED_DURING_CHECK);

  assert.equal(db.stockChecks.length, 1, "Exactly one StockCheck row survives");
  assert.equal(db.stocks.get(1)?.currentLiters, 980, "No double-adjustment occurred");
});

// Scenario E: Different fuel types execute completely independently
test("Scenario E: Different fuel types execute independently without cross-fuel OCC conflicts", async () => {
  const db = new MockFuelStationDatabase([
    { fuelTypeId: 1, currentLiters: 1000, version: 5 },
    { fuelTypeId: 2, currentLiters: 2000, version: 10 },
  ]);

  const inputDiesel = parseStockCheckInput({
    fuelTypeId: 1,
    actualLiters: 980,
    expectedSystemLiters: 1000,
    expectedVersion: 5,
  });
  const inputGasohol = parseStockCheckInput({
    fuelTypeId: 2,
    actualLiters: 2010,
    expectedSystemLiters: 2000,
    expectedVersion: 10,
  });

  const [resD, resG] = await Promise.all([
    db.executeOCCStockCheck(inputDiesel),
    db.executeOCCStockCheck(inputGasohol),
  ]);

  assert.equal(resD.status, 201);
  assert.equal(resG.status, 201);
  assert.equal(db.stocks.get(1)?.currentLiters, 980);
  assert.equal(db.stocks.get(1)?.version, 6);
  assert.equal(db.stocks.get(2)?.currentLiters, 2010);
  assert.equal(db.stocks.get(2)?.version, 11);
  assert.equal(db.stockChecks.length, 2);
});

// Scenario F: Retry after 409 succeeds cleanly
test("Scenario F: Retry after 409: client refreshes snapshot, reconfirms, and succeeds on updated version", async () => {
  const db = new MockFuelStationDatabase([{ fuelTypeId: 1, currentLiters: 1000, version: 5 }]);

  // 1. Initial attempt fails because sale intervened
  await db.executeSale(1, 50); // DB is now 950, V6
  const staleInput = parseStockCheckInput({
    fuelTypeId: 1,
    actualLiters: 950,
    expectedSystemLiters: 1000,
    expectedVersion: 5,
  });
  const failedRes = await db.executeOCCStockCheck(staleInput);
  assert.equal(failedRes.status, 409);

  // 2. Client refreshes snapshot:
  // Sees system stock = 950, version = 6
  // Owner reconfirms physical dip = 950 (or newly measured)
  const freshInput = parseStockCheckInput({
    fuelTypeId: 1,
    actualLiters: 950,
    expectedSystemLiters: 950,
    expectedVersion: 6,
  });

  const retryRes = await db.executeOCCStockCheck(freshInput);
  assert.equal(retryRes.status, 201);
  assert.equal(db.stocks.get(1)?.currentLiters, 950);
  assert.equal(db.stocks.get(1)?.version, 7);
  assert.equal(db.stockChecks.length, 1);
  assert.equal(db.stockChecks[0].difference, 0);
});

// Scenario G: Legacy client without expectedVersion is rejected safely
test("Scenario G: Legacy client without expectedVersion is rejected with VERSION_REQUIRED (no unsafe overwrite)", async () => {
  const db = new MockFuelStationDatabase([{ fuelTypeId: 1, currentLiters: 1000, version: 5 }]);
  const legacyInput = parseStockCheckInput({
    fuelTypeId: 1,
    actualLiters: 980,
  });

  assert.equal(legacyInput.expectedVersion, null);
  const res = await db.executeOCCStockCheck(legacyInput);
  assert.equal(res.status, 409);
  assert.equal((res.body as { code?: string }).code, STOCK_CHECK_ERROR_CODES.VERSION_REQUIRED);
  assert.equal(db.stocks.get(1)?.currentLiters, 1000, "Stock was NOT overwritten by legacy client");
  assert.equal(db.stockChecks.length, 0);
});

// Scenario H: Transaction failure / rollback
test("Scenario H: Transaction failure rolls back completely without partial state", async () => {
  const db = new MockFuelStationDatabase([{ fuelTypeId: 1, currentLiters: 1000, version: 5 }]);
  const input = parseStockCheckInput({
    fuelTypeId: 1,
    actualLiters: 980,
    expectedSystemLiters: 1000,
    expectedVersion: 5,
  });

  const res = await db.executeOCCStockCheck(input, { shouldFailTransaction: true });
  assert.equal(res.status, 500);
  assert.equal(db.stockChecks.length, 0);
  assert.equal(db.stocks.get(1)?.currentLiters, 1000);
  assert.equal(db.stocks.get(1)?.version, 5);
});

// Scenario I: Uninitialized fuel stock returns FUEL_STOCK_NOT_INITIALIZED and does NOT create a row
test("Scenario I: Uninitialized fuel stock returns FUEL_STOCK_NOT_INITIALIZED", async () => {
  const db = new MockFuelStationDatabase([]); // No stocks initialized
  const input = parseStockCheckInput({
    fuelTypeId: 99,
    actualLiters: 500,
    expectedVersion: 0,
  });

  const res = await db.executeOCCStockCheck(input);
  assert.equal(res.status, 409);
  assert.equal((res.body as { code?: string }).code, STOCK_CHECK_ERROR_CODES.FUEL_STOCK_NOT_INITIALIZED);
  assert.equal(db.stocks.has(99), false, "Did not implicitly create FuelStock");
  assert.equal(db.stockChecks.length, 0);
});

// Scenario J: Server is sole authority for systemLiters and difference regardless of client expectedSystemLiters
test("Scenario J: Server systemLiters is authoritative even if client claims different expectedSystemLiters", async () => {
  const db = new MockFuelStationDatabase([{ fuelTypeId: 1, currentLiters: 1000, version: 5 }]);
  const input = parseStockCheckInput({
    fuelTypeId: 1,
    actualLiters: 980,
    expectedSystemLiters: 1050, // Client claims different baseline
    expectedVersion: 5,
  });

  const res = await db.executeOCCStockCheck(input);
  assert.equal(res.status, 201);
  const created = res.body as MockStockCheckRecord;
  assert.equal(created.systemLiters, 1000, "Server stock is authoritative");
  assert.equal(created.difference, -20, "Difference is actualLiters - server stock (980 - 1000 = -20)");
});
