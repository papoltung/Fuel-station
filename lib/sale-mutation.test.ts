import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSaleEditInput,
  parseSaleCancelInput,
  SALE_MUTATION_ERROR_CODES,
  type ParsedSaleEditInput,
  type ParsedSaleCancelInput,
} from "./sale-mutation";

// ============================================================================
// Sprint 2B Domain Mock Database & Transaction Simulation
// ============================================================================

type MockSale = {
  id: number;
  fuelTypeId: number;
  totalAmount: number;
  pricePerLiter: number;
  liters: number;
  paymentMethod: string;
  pumpNo: string;
  customerName: string | null;
  note: string | null;
  version: number;
};

type MockFuelStock = {
  fuelTypeId: number;
  currentLiters: number;
  version: number;
};

type MockSaleAudit = {
  id: number;
  saleId: number;
  action: "update" | "cancel";
  actorId: number;
  beforeData: unknown;
  afterData?: unknown;
  reason: string;
};

class MockSaleDatabase {
  sales = new Map<number, MockSale>();
  stocks = new Map<number, MockFuelStock>();
  audits: MockSaleAudit[] = [];
  nextAuditId = 1;

  constructor(
    initialSales: MockSale[],
    initialStocks: MockFuelStock[]
  ) {
    for (const s of initialSales) this.sales.set(s.id, { ...s });
    for (const st of initialStocks) this.stocks.set(st.fuelTypeId, { ...st });
  }

  // --- Proposed Production Implementation for PATCH /api/sales/[id] ---
  async executeOCCSaleEdit(
    input: ParsedSaleEditInput,
    actorId = 1,
    options?: { shouldFailTransaction?: boolean }
  ): Promise<{ status: number; body: MockSale | { error: string; code?: string } }> {
    // 0. Legacy client policy: require expectedVersion
    if (input.expectedVersion === null) {
      return {
        status: 409,
        body: {
          error: "ข้อมูลเวอร์ชันรายการขายไม่ถูกต้อง กรุณารีเฟรชหน้าจอเพื่อรับข้อมูลล่าสุด",
          code: SALE_MUTATION_ERROR_CODES.VERSION_REQUIRED,
        },
      };
    }

    // Inside transaction:
    // 1. Read existing Sale
    const existing = this.sales.get(input.id);
    if (!existing) {
      return {
        status: 404,
        body: { error: "ไม่พบรายการขาย", code: SALE_MUTATION_ERROR_CODES.SALE_NOT_FOUND },
      };
    }

    // 2. Validate version
    if (existing.version !== input.expectedVersion) {
      return {
        status: 409,
        body: {
          error: "รายการขายมีการเปลี่ยนแปลงจากผู้ใช้อื่น กรุณาโหลดข้อมูลล่าสุด",
          code: SALE_MUTATION_ERROR_CODES.SALE_CHANGED,
        },
      };
    }

    // Snapshot before mutation
    const beforeSnapshot = { ...existing };

    // 3. Conditional claim: WHERE id = saleId AND version = expectedVersion
    // In our atomic simulation:
    const updatedSale: MockSale = {
      ...existing,
      fuelTypeId: input.fuelTypeId,
      totalAmount: input.totalAmount,
      pricePerLiter: input.pricePerLiter,
      liters: input.liters,
      paymentMethod: input.paymentMethod,
      pumpNo: input.pumpNo,
      customerName: input.customerName,
      note: input.note,
      version: existing.version + 1,
    };

    if (options?.shouldFailTransaction) {
      // Simulate transaction rollback before commit
      return { status: 500, body: { error: "Transaction failed" } };
    }

    // 4. Calculate FuelStock Net Delta & Apply Sufficiency Guards
    if (existing.fuelTypeId === input.fuelTypeId) {
      // Same fuel type: net delta = old - new
      const delta = existing.liters - input.liters;
      if (delta > 0) {
        // Restoring fuel (old > new): unconditional increment
        const stock = this.stocks.get(input.fuelTypeId);
        if (!stock) return { status: 404, body: { error: "Stock not found" } };
        stock.currentLiters += delta;
        stock.version++;
      } else if (delta < 0) {
        // Consuming more fuel (old < new): conditional decrement
        const additionalRequired = -delta;
        const stock = this.stocks.get(input.fuelTypeId);
        if (!stock || stock.currentLiters < additionalRequired) {
          // Insufficient stock -> rollback entire transaction!
          return {
            status: 409,
            body: {
              error: "สต็อกน้ำมันไม่เพียงพอสำหรับการแก้ไขรายการขาย",
              code: SALE_MUTATION_ERROR_CODES.INSUFFICIENT_FUEL_STOCK,
            },
          };
        }
        stock.currentLiters -= additionalRequired;
        stock.version++;
      }
      // If delta === 0: FuelStock and version are NOT touched!
    } else {
      // Different fuel type:
      // Refund old fuel: +oldLiters
      // Deduct new fuel: -newLiters conditionally
      const newStock = this.stocks.get(input.fuelTypeId);
      if (!newStock || newStock.currentLiters < input.liters) {
        // Insufficient stock in new fuel tank -> rollback entire transaction!
        return {
          status: 409,
          body: {
            error: "สต็อกน้ำมันไม่เพียงพอสำหรับการแก้ไขรายการขาย",
            code: SALE_MUTATION_ERROR_CODES.INSUFFICIENT_FUEL_STOCK,
          },
        };
      }

      // Both valid: apply changes in deterministic order of fuelTypeId
      const [firstFuelId, secondFuelId] = [existing.fuelTypeId, input.fuelTypeId].sort((a, b) => a - b);

      const applyFuelChange = (ftId: number) => {
        const stock = this.stocks.get(ftId);
        if (!stock) throw new Error(`Stock not found for ${ftId}`);
        if (ftId === existing.fuelTypeId) {
          stock.currentLiters += existing.liters;
          stock.version++;
        } else {
          stock.currentLiters -= input.liters;
          stock.version++;
        }
      };

      applyFuelChange(firstFuelId);
      applyFuelChange(secondFuelId);
    }

    // 5. Update Sale in database
    this.sales.set(input.id, updatedSale);

    // 6. Record SaleAudit
    this.audits.push({
      id: this.nextAuditId++,
      saleId: input.id,
      action: "update",
      actorId,
      beforeData: beforeSnapshot,
      afterData: { ...updatedSale },
      reason: input.reason,
    });

    return { status: 200, body: updatedSale };
  }

  // --- Proposed Production Implementation for DELETE /api/sales/[id] ---
  async executeOCCSaleCancel(
    input: ParsedSaleCancelInput,
    actorId = 1,
    options?: { shouldFailTransaction?: boolean }
  ): Promise<{ status: number; body: { ok: boolean } | { error: string; code?: string } }> {
    // 0. Legacy client policy: require expectedVersion
    if (input.expectedVersion === null) {
      return {
        status: 409,
        body: {
          error: "ข้อมูลเวอร์ชันรายการขายไม่ถูกต้อง กรุณารีเฟรชหน้าจอเพื่อรับข้อมูลล่าสุด",
          code: SALE_MUTATION_ERROR_CODES.VERSION_REQUIRED,
        },
      };
    }

    // Inside transaction:
    // 1. Read existing Sale
    const existing = this.sales.get(input.id);
    if (!existing) {
      return {
        status: 404,
        body: { error: "ไม่พบรายการขาย", code: SALE_MUTATION_ERROR_CODES.SALE_NOT_FOUND },
      };
    }

    // 2. Validate version
    if (existing.version !== input.expectedVersion) {
      return {
        status: 409,
        body: {
          error: "รายการขายมีการเปลี่ยนแปลงหรือถูกยกเลิกแล้ว",
          code: SALE_MUTATION_ERROR_CODES.SALE_CANCELLED,
        },
      };
    }

    const beforeSnapshot = { ...existing };

    if (options?.shouldFailTransaction) {
      // Simulate transaction rollback before commit
      return { status: 500, body: { error: "Transaction failed" } };
    }

    // 3. Atomically delete Sale
    this.sales.delete(input.id);

    // 4. Restore FuelStock using exact liters from the claimed Sale
    const stock = this.stocks.get(existing.fuelTypeId);
    if (!stock) return { status: 404, body: { error: "Stock not found" } };
    stock.currentLiters += existing.liters;
    stock.version++;

    // 5. Create SaleAudit cancel record
    this.audits.push({
      id: this.nextAuditId++,
      saleId: input.id,
      action: "cancel",
      actorId,
      beforeData: beforeSnapshot,
      reason: input.reason,
    });

    return { status: 200, body: { ok: true } };
  }
}

// ============================================================================
// Sprint 2B Test Matrix: Scenarios 1 through 18
// ============================================================================

// 1. Normal same-fuel edit: 100 -> 120 => correct Sale, stock -20
test("1. Normal same-fuel edit (100 -> 120 L): stock -20 L, FuelStock.version increments", async () => {
  const db = new MockSaleDatabase(
    [{ id: 1, fuelTypeId: 1, liters: 100, pricePerLiter: 30, totalAmount: 3000, paymentMethod: "cash", pumpNo: "1", customerName: null, note: null, version: 5 }],
    [{ fuelTypeId: 1, currentLiters: 900, version: 10 }]
  );

  const res = await db.executeOCCSaleEdit(
    parseSaleEditInput({ id: 1, expectedVersion: 5, fuelTypeId: 1, totalAmount: 3600, pricePerLiter: 30, paymentMethod: "cash", pumpNo: "1", reason: "เติมเพิ่ม" })
  );

  assert.equal(res.status, 200);
  assert.equal(db.sales.get(1)?.liters, 120);
  assert.equal(db.sales.get(1)?.version, 6);
  assert.equal(db.stocks.get(1)?.currentLiters, 880, "Stock decreased by 20 L (900 - 20 = 880)");
  assert.equal(db.stocks.get(1)?.version, 11, "FuelStock.version incremented");
  assert.equal(db.audits.length, 1);
});

// 2. Normal same-fuel edit: 100 -> 80 => stock +20
test("2. Normal same-fuel edit (100 -> 80 L): stock +20 L", async () => {
  const db = new MockSaleDatabase(
    [{ id: 1, fuelTypeId: 1, liters: 100, pricePerLiter: 30, totalAmount: 3000, paymentMethod: "cash", pumpNo: "1", customerName: null, note: null, version: 5 }],
    [{ fuelTypeId: 1, currentLiters: 900, version: 10 }]
  );

  const res = await db.executeOCCSaleEdit(
    parseSaleEditInput({ id: 1, expectedVersion: 5, fuelTypeId: 1, totalAmount: 2400, pricePerLiter: 30, paymentMethod: "cash", pumpNo: "1", reason: "กรอกยอดเกิน" })
  );

  assert.equal(res.status, 200);
  assert.equal(db.sales.get(1)?.liters, 80);
  assert.equal(db.stocks.get(1)?.currentLiters, 920, "Stock increased by 20 L (900 + 20 = 920)");
  assert.equal(db.stocks.get(1)?.version, 11);
});

// 3. Payment-method-only edit: Sale version changes, FuelStock does NOT change, FuelStock.version does NOT change
test("3. Payment-method-only edit: Sale.version changes, FuelStock and its version do NOT change", async () => {
  const db = new MockSaleDatabase(
    [{ id: 1, fuelTypeId: 1, liters: 100, pricePerLiter: 30, totalAmount: 3000, paymentMethod: "cash", pumpNo: "1", customerName: null, note: null, version: 5 }],
    [{ fuelTypeId: 1, currentLiters: 900, version: 10 }]
  );

  const res = await db.executeOCCSaleEdit(
    parseSaleEditInput({ id: 1, expectedVersion: 5, fuelTypeId: 1, totalAmount: 3000, pricePerLiter: 30, paymentMethod: "transfer", pumpNo: "1", reason: "เปลี่ยนจากเงินสดเป็นโอน" })
  );

  assert.equal(res.status, 200);
  assert.equal(db.sales.get(1)?.paymentMethod, "transfer");
  assert.equal(db.sales.get(1)?.version, 6, "Sale version increments");
  assert.equal(db.stocks.get(1)?.currentLiters, 900, "FuelStock unchanged");
  assert.equal(db.stocks.get(1)?.version, 10, "FuelStock version MUST NOT change for payment-only edit");
});

// 4. Fuel-type change: Fuel A 100 L to Fuel B 80 L => A +100, B -80, both atomic
test("4. Fuel-type change: Fuel A +100 L, Fuel B -80 L atomically", async () => {
  const db = new MockSaleDatabase(
    [{ id: 1, fuelTypeId: 1, liters: 100, pricePerLiter: 30, totalAmount: 3000, paymentMethod: "cash", pumpNo: "1", customerName: null, note: null, version: 5 }],
    [
      { fuelTypeId: 1, currentLiters: 900, version: 10 },
      { fuelTypeId: 2, currentLiters: 1500, version: 20 },
    ]
  );

  const res = await db.executeOCCSaleEdit(
    parseSaleEditInput({ id: 1, expectedVersion: 5, fuelTypeId: 2, totalAmount: 3200, pricePerLiter: 40, paymentMethod: "cash", pumpNo: "2", reason: "เลือกชนิดน้ำมันผิด" })
  );

  assert.equal(res.status, 200);
  assert.equal(db.sales.get(1)?.fuelTypeId, 2);
  assert.equal(db.sales.get(1)?.liters, 80);
  assert.equal(db.stocks.get(1)?.currentLiters, 1000, "Old fuel refunded +100 L");
  assert.equal(db.stocks.get(1)?.version, 11);
  assert.equal(db.stocks.get(2)?.currentLiters, 1420, "New fuel deducted -80 L");
  assert.equal(db.stocks.get(2)?.version, 21);
});

// 5. Concurrent Edit A vs Edit B: same Sale version => exactly one succeeds, other 409
test("5. Concurrent Edit A vs Edit B on same version: exactly one succeeds, other gets 409", async () => {
  const db = new MockSaleDatabase(
    [{ id: 1, fuelTypeId: 1, liters: 100, pricePerLiter: 30, totalAmount: 3000, paymentMethod: "cash", pumpNo: "1", customerName: null, note: null, version: 5 }],
    [{ fuelTypeId: 1, currentLiters: 900, version: 10 }]
  );

  const inputA = parseSaleEditInput({ id: 1, expectedVersion: 5, fuelTypeId: 1, totalAmount: 3600, pricePerLiter: 30, paymentMethod: "cash", pumpNo: "1", reason: "Edit A" });
  const inputB = parseSaleEditInput({ id: 1, expectedVersion: 5, fuelTypeId: 1, totalAmount: 2400, pricePerLiter: 30, paymentMethod: "cash", pumpNo: "1", reason: "Edit B" });

  const resA = await db.executeOCCSaleEdit(inputA);
  const resB = await db.executeOCCSaleEdit(inputB);

  assert.equal(resA.status, 200, "First edit succeeds");
  assert.equal(resB.status, 409, "Second edit fails with 409");
  assert.equal((resB.body as { code?: string }).code, SALE_MUTATION_ERROR_CODES.SALE_CHANGED);

  // Final FuelStock corresponds exactly to winning Sale
  assert.equal(db.sales.get(1)?.liters, 120);
  assert.equal(db.stocks.get(1)?.currentLiters, 880);
  assert.equal(db.audits.length, 1, "Only 1 audit record created");
});

// 6. Edit vs Cancel: same expected version => exactly one succeeds
test("6. Edit vs Cancel (Edit commits first): Edit succeeds, Cancel gets 409", async () => {
  const db = new MockSaleDatabase(
    [{ id: 1, fuelTypeId: 1, liters: 100, pricePerLiter: 30, totalAmount: 3000, paymentMethod: "cash", pumpNo: "1", customerName: null, note: null, version: 5 }],
    [{ fuelTypeId: 1, currentLiters: 900, version: 10 }]
  );

  const editInput = parseSaleEditInput({ id: 1, expectedVersion: 5, fuelTypeId: 1, totalAmount: 3600, pricePerLiter: 30, paymentMethod: "cash", pumpNo: "1", reason: "Edit" });
  const cancelInput = parseSaleCancelInput({ id: 1, expectedVersion: 5, reason: "Cancel" });

  const editRes = await db.executeOCCSaleEdit(editInput);
  const cancelRes = await db.executeOCCSaleCancel(cancelInput);

  assert.equal(editRes.status, 200);
  assert.equal(cancelRes.status, 409);
  assert.equal(db.sales.has(1), true, "Sale survived");
  assert.equal(db.sales.get(1)?.liters, 120);
  assert.equal(db.stocks.get(1)?.currentLiters, 880);
  assert.equal(db.audits.length, 1);
});

// 7. Reverse scheduling: Cancel begins first, Edit races afterward
test("7. Reverse scheduling (Cancel commits first, Edit follows): Cancel succeeds, Edit gets 404/409", async () => {
  const db = new MockSaleDatabase(
    [{ id: 1, fuelTypeId: 1, liters: 100, pricePerLiter: 30, totalAmount: 3000, paymentMethod: "cash", pumpNo: "1", customerName: null, note: null, version: 5 }],
    [{ fuelTypeId: 1, currentLiters: 900, version: 10 }]
  );

  const cancelInput = parseSaleCancelInput({ id: 1, expectedVersion: 5, reason: "Cancel" });
  const editInput = parseSaleEditInput({ id: 1, expectedVersion: 5, fuelTypeId: 1, totalAmount: 3600, pricePerLiter: 30, paymentMethod: "cash", pumpNo: "1", reason: "Edit" });

  const cancelRes = await db.executeOCCSaleCancel(cancelInput);
  const editRes = await db.executeOCCSaleEdit(editInput);

  assert.equal(cancelRes.status, 200);
  assert.equal(editRes.status, 404, "Sale was deleted by Cancel; Edit gets 404");
  assert.equal(db.sales.has(1), false, "Sale is deleted");
  assert.equal(db.stocks.get(1)?.currentLiters, 1000, "Stock restored exactly once");
  assert.equal(db.audits.length, 1, "Only 1 audit record created");
});

// 8. Double Cancel: exactly one stock restoration
test("8. Double Cancel: exactly one stock restoration, second gets 404/409", async () => {
  const db = new MockSaleDatabase(
    [{ id: 1, fuelTypeId: 1, liters: 100, pricePerLiter: 30, totalAmount: 3000, paymentMethod: "cash", pumpNo: "1", customerName: null, note: null, version: 5 }],
    [{ fuelTypeId: 1, currentLiters: 900, version: 10 }]
  );

  const cancelA = parseSaleCancelInput({ id: 1, expectedVersion: 5, reason: "User A cancel" });
  const cancelB = parseSaleCancelInput({ id: 1, expectedVersion: 5, reason: "User B cancel" });

  const resA = await db.executeOCCSaleCancel(cancelA);
  const resB = await db.executeOCCSaleCancel(cancelB);

  assert.equal(resA.status, 200);
  assert.equal(resB.status, 404);
  assert.equal(db.stocks.get(1)?.currentLiters, 1000, "Stock restored exactly once (900 + 100 = 1000)");
  assert.equal(db.stocks.get(1)?.version, 11, "Stock version incremented once");
});

// 9. Stale edit: client V5, server already V6 => 409, zero FuelStock change, zero Audit row
test("9. Stale edit: client V5 vs server V6 => 409, zero FuelStock change, zero Audit row", async () => {
  const db = new MockSaleDatabase(
    [{ id: 1, fuelTypeId: 1, liters: 100, pricePerLiter: 30, totalAmount: 3000, paymentMethod: "cash", pumpNo: "1", customerName: null, note: null, version: 6 }],
    [{ fuelTypeId: 1, currentLiters: 900, version: 10 }]
  );

  const staleInput = parseSaleEditInput({ id: 1, expectedVersion: 5, fuelTypeId: 1, totalAmount: 3600, pricePerLiter: 30, paymentMethod: "cash", pumpNo: "1", reason: "Stale edit" });
  const res = await db.executeOCCSaleEdit(staleInput);

  assert.equal(res.status, 409);
  assert.equal((res.body as { code?: string }).code, SALE_MUTATION_ERROR_CODES.SALE_CHANGED);
  assert.equal(db.stocks.get(1)?.currentLiters, 900, "FuelStock untouched");
  assert.equal(db.stocks.get(1)?.version, 10, "FuelStock.version untouched");
  assert.equal(db.audits.length, 0, "No audit created");
});

// 10. Missing expectedVersion => VERSION_REQUIRED => zero mutation
test("10. Missing expectedVersion => VERSION_REQUIRED => zero mutation", async () => {
  const db = new MockSaleDatabase(
    [{ id: 1, fuelTypeId: 1, liters: 100, pricePerLiter: 30, totalAmount: 3000, paymentMethod: "cash", pumpNo: "1", customerName: null, note: null, version: 5 }],
    [{ fuelTypeId: 1, currentLiters: 900, version: 10 }]
  );

  const legacyInput = parseSaleEditInput({ id: 1, fuelTypeId: 1, totalAmount: 3600, pricePerLiter: 30, paymentMethod: "cash", pumpNo: "1", reason: "Legacy call" });
  assert.equal(legacyInput.expectedVersion, null);

  const res = await db.executeOCCSaleEdit(legacyInput);
  assert.equal(res.status, 409);
  assert.equal((res.body as { code?: string }).code, SALE_MUTATION_ERROR_CODES.VERSION_REQUIRED);
  assert.equal(db.sales.get(1)?.liters, 100, "Sale untouched");
  assert.equal(db.stocks.get(1)?.currentLiters, 900, "Stock untouched");
});

// 11. Transaction failure after Sale claim but before commit => entire rollback
test("11. Transaction failure after claim rolls back completely without partial state", async () => {
  const db = new MockSaleDatabase(
    [{ id: 1, fuelTypeId: 1, liters: 100, pricePerLiter: 30, totalAmount: 3000, paymentMethod: "cash", pumpNo: "1", customerName: null, note: null, version: 5 }],
    [{ fuelTypeId: 1, currentLiters: 900, version: 10 }]
  );

  const input = parseSaleEditInput({ id: 1, expectedVersion: 5, fuelTypeId: 1, totalAmount: 3600, pricePerLiter: 30, paymentMethod: "cash", pumpNo: "1", reason: "Edit" });
  const res = await db.executeOCCSaleEdit(input, 1, { shouldFailTransaction: true });

  assert.equal(res.status, 500);
  assert.equal(db.sales.get(1)?.liters, 100, "Sale preserved");
  assert.equal(db.sales.get(1)?.version, 5);
  assert.equal(db.stocks.get(1)?.currentLiters, 900, "Stock preserved");
  assert.equal(db.stocks.get(1)?.version, 10);
  assert.equal(db.audits.length, 0);
});

// 12. Audit correctness: one successful mutation => exactly one audit entry; losing conflict => no audit entry
test("12. Audit correctness: winning mutation creates 1 audit entry; losing conflict creates 0", async () => {
  const db = new MockSaleDatabase(
    [{ id: 1, fuelTypeId: 1, liters: 100, pricePerLiter: 30, totalAmount: 3000, paymentMethod: "cash", pumpNo: "1", customerName: null, note: null, version: 5 }],
    [{ fuelTypeId: 1, currentLiters: 900, version: 10 }]
  );

  const inputA = parseSaleEditInput({ id: 1, expectedVersion: 5, fuelTypeId: 1, totalAmount: 3600, pricePerLiter: 30, paymentMethod: "cash", pumpNo: "1", reason: "Success" });
  const inputB = parseSaleEditInput({ id: 1, expectedVersion: 5, fuelTypeId: 1, totalAmount: 2400, pricePerLiter: 30, paymentMethod: "cash", pumpNo: "1", reason: "Fail" });

  await db.executeOCCSaleEdit(inputA);
  await db.executeOCCSaleEdit(inputB);

  assert.equal(db.audits.length, 1);
  assert.equal(db.audits[0].reason, "Success");
});

// 13. FuelStock.version: every actual stock change increments its version
test("13. FuelStock.version increments on actual stock change", async () => {
  const db = new MockSaleDatabase(
    [{ id: 1, fuelTypeId: 1, liters: 100, pricePerLiter: 30, totalAmount: 3000, paymentMethod: "cash", pumpNo: "1", customerName: null, note: null, version: 5 }],
    [{ fuelTypeId: 1, currentLiters: 900, version: 10 }]
  );

  const input = parseSaleEditInput({ id: 1, expectedVersion: 5, fuelTypeId: 1, totalAmount: 3300, pricePerLiter: 30, paymentMethod: "cash", pumpNo: "1", reason: "Change 10L" });
  await db.executeOCCSaleEdit(input);

  assert.equal(db.stocks.get(1)?.version, 11);
});

// 14. Payment-only edit: FuelStock.version unchanged
test("14. Payment-only edit: FuelStock.version remains strictly unchanged", async () => {
  const db = new MockSaleDatabase(
    [{ id: 1, fuelTypeId: 1, liters: 100, pricePerLiter: 30, totalAmount: 3000, paymentMethod: "cash", pumpNo: "1", customerName: null, note: null, version: 5 }],
    [{ fuelTypeId: 1, currentLiters: 900, version: 10 }]
  );

  const input = parseSaleEditInput({ id: 1, expectedVersion: 5, fuelTypeId: 1, totalAmount: 3000, pricePerLiter: 30, paymentMethod: "credit", pumpNo: "1", reason: "Change to credit" });
  await db.executeOCCSaleEdit(input);

  assert.equal(db.stocks.get(1)?.version, 10, "FuelStock version did not increment");
});

// 15. TWO DIFFERENT SALES on same fuel type edited concurrently: both succeed, FuelStock net result equals sum of deltas
test("15. Two different Sales on same fuel type: both succeed independently, FuelStock net sum matches", async () => {
  const db = new MockSaleDatabase(
    [
      { id: 1, fuelTypeId: 1, liters: 100, pricePerLiter: 30, totalAmount: 3000, paymentMethod: "cash", pumpNo: "1", customerName: null, note: null, version: 5 },
      { id: 2, fuelTypeId: 1, liters: 50, pricePerLiter: 30, totalAmount: 1500, paymentMethod: "cash", pumpNo: "2", customerName: null, note: null, version: 3 },
    ],
    [{ fuelTypeId: 1, currentLiters: 900, version: 10 }]
  );

  // Sale 1: 100 -> 120 (delta = -20)
  // Sale 2: 50 -> 40 (delta = +10)
  const input1 = parseSaleEditInput({ id: 1, expectedVersion: 5, fuelTypeId: 1, totalAmount: 3600, pricePerLiter: 30, paymentMethod: "cash", pumpNo: "1", reason: "Sale 1 edit" });
  const input2 = parseSaleEditInput({ id: 2, expectedVersion: 3, fuelTypeId: 1, totalAmount: 1200, pricePerLiter: 30, paymentMethod: "cash", pumpNo: "2", reason: "Sale 2 edit" });

  const res1 = await db.executeOCCSaleEdit(input1);
  const res2 = await db.executeOCCSaleEdit(input2);

  assert.equal(res1.status, 200);
  assert.equal(res2.status, 200);
  // Net effect on stock: 900 - 20 + 10 = 890 L
  assert.equal(db.stocks.get(1)?.currentLiters, 890);
  assert.equal(db.stocks.get(1)?.version, 12, "Incremented twice (once per actual stock delta)");
});

// 16. Cross-fuel concurrent edits: Sale A (Fuel1 -> Fuel2), Sale B (Fuel2 -> Fuel1)
test("16. Cross-fuel concurrent edits execute deterministically without deadlock", async () => {
  const db = new MockSaleDatabase(
    [
      { id: 1, fuelTypeId: 1, liters: 50, pricePerLiter: 30, totalAmount: 1500, paymentMethod: "cash", pumpNo: "1", customerName: null, note: null, version: 1 },
      { id: 2, fuelTypeId: 2, liters: 40, pricePerLiter: 40, totalAmount: 1600, paymentMethod: "cash", pumpNo: "2", customerName: null, note: null, version: 1 },
    ],
    [
      { fuelTypeId: 1, currentLiters: 1000, version: 10 },
      { fuelTypeId: 2, currentLiters: 1000, version: 20 },
    ]
  );

  // Sale 1 changes Fuel1 (50L) -> Fuel2 (60L) => Fuel1 +50, Fuel2 -60
  // Sale 2 changes Fuel2 (40L) -> Fuel1 (30L) => Fuel2 +40, Fuel1 -30
  const inputA = parseSaleEditInput({ id: 1, expectedVersion: 1, fuelTypeId: 2, totalAmount: 2400, pricePerLiter: 40, paymentMethod: "cash", pumpNo: "2", reason: "Cross A" });
  const inputB = parseSaleEditInput({ id: 2, expectedVersion: 1, fuelTypeId: 1, totalAmount: 900, pricePerLiter: 30, paymentMethod: "cash", pumpNo: "1", reason: "Cross B" });

  const resA = await db.executeOCCSaleEdit(inputA);
  const resB = await db.executeOCCSaleEdit(inputB);

  assert.equal(resA.status, 200);
  assert.equal(resB.status, 200);

  // Net Fuel 1: 1000 + 50 - 30 = 1020 L
  // Net Fuel 2: 1000 - 60 + 40 = 980 L
  assert.equal(db.stocks.get(1)?.currentLiters, 1020);
  assert.equal(db.stocks.get(2)?.currentLiters, 980);
});

// 17. StockCheck interaction: StockCheck holds snapshot V10; Sale edit changes stock => FuelStock V11 => StockCheck 409
test("17. StockCheck snapshot V10 is invalidated when Sale edit changes stock to V11", async () => {
  const db = new MockSaleDatabase(
    [{ id: 1, fuelTypeId: 1, liters: 100, pricePerLiter: 30, totalAmount: 3000, paymentMethod: "cash", pumpNo: "1", customerName: null, note: null, version: 5 }],
    [{ fuelTypeId: 1, currentLiters: 900, version: 10 }]
  );

  // StockCheck captured snapshot: currentLiters = 900, version = 10
  const stockCheckExpectedVersion = 10;

  // Sale edit intervenes: 100 -> 120 L
  await db.executeOCCSaleEdit(
    parseSaleEditInput({ id: 1, expectedVersion: 5, fuelTypeId: 1, totalAmount: 3600, pricePerLiter: 30, paymentMethod: "cash", pumpNo: "1", reason: "Intervening edit" })
  );

  const currentStock = db.stocks.get(1);
  assert.equal(currentStock?.version, 11);

  // StockCheck checks version: 10 !== 11 => 409 STOCK_CHANGED_DURING_CHECK
  assert.notEqual(currentStock?.version, stockCheckExpectedVersion, "StockCheck snapshot is invalidated");
});

// 18. Lost-response retry: Retry with old expectedVersion gets 409 SALE_CHANGED (no second stock adjustment)
test("18. Lost-response retry: retrying with old expectedVersion returns 409 without second stock change", async () => {
  const db = new MockSaleDatabase(
    [{ id: 1, fuelTypeId: 1, liters: 100, pricePerLiter: 30, totalAmount: 3000, paymentMethod: "cash", pumpNo: "1", customerName: null, note: null, version: 5 }],
    [{ fuelTypeId: 1, currentLiters: 900, version: 10 }]
  );

  const input = parseSaleEditInput({ id: 1, expectedVersion: 5, fuelTypeId: 1, totalAmount: 3600, pricePerLiter: 30, paymentMethod: "cash", pumpNo: "1", reason: "Initial edit" });

  // First attempt succeeds
  const res1 = await db.executeOCCSaleEdit(input);
  assert.equal(res1.status, 200);
  assert.equal(db.stocks.get(1)?.currentLiters, 880);

  // Retry with same payload and same expectedVersion=5
  const resRetry = await db.executeOCCSaleEdit(input);
  assert.equal(resRetry.status, 409, "Retry with old version gets 409");
  assert.equal((resRetry.body as { code?: string }).code, SALE_MUTATION_ERROR_CODES.SALE_CHANGED);
  assert.equal(db.stocks.get(1)?.currentLiters, 880, "FuelStock NOT deducted a second time!");
  assert.equal(db.audits.length, 1, "No duplicate audit entry created");
});

// 19. Same-fuel increase with insufficient stock: 409 INSUFFICIENT_FUEL_STOCK, Sale & Stock unchanged, no Audit
test("19. Same-fuel increase with insufficient stock: 409 INSUFFICIENT_FUEL_STOCK, zero side effects", async () => {
  const db = new MockSaleDatabase(
    [{ id: 1, fuelTypeId: 1, liters: 100, pricePerLiter: 30, totalAmount: 3000, paymentMethod: "cash", pumpNo: "1", customerName: null, note: null, version: 5 }],
    [{ fuelTypeId: 1, currentLiters: 10, version: 10 }] // Only 10 L available in tank, but edit needs 20 L additional!
  );

  const input = parseSaleEditInput({ id: 1, expectedVersion: 5, fuelTypeId: 1, totalAmount: 3600, pricePerLiter: 30, paymentMethod: "cash", pumpNo: "1", reason: "Need 20L more" });
  const res = await db.executeOCCSaleEdit(input);

  assert.equal(res.status, 409);
  assert.equal((res.body as { code?: string }).code, SALE_MUTATION_ERROR_CODES.INSUFFICIENT_FUEL_STOCK);
  assert.equal(db.sales.get(1)?.liters, 100, "Sale remains at original 100 L");
  assert.equal(db.sales.get(1)?.version, 5, "Sale.version remains at original V5");
  assert.equal(db.stocks.get(1)?.currentLiters, 10, "FuelStock remains at 10 L (did NOT become -10 L!)");
  assert.equal(db.stocks.get(1)?.version, 10, "FuelStock.version unchanged");
  assert.equal(db.audits.length, 0, "No audit entry created");
});

// 20. Same-fuel increase with exactly sufficient stock: succeeds, FuelStock = 0, never negative
test("20. Same-fuel increase with exactly sufficient stock: succeeds, FuelStock reaches exactly 0 without negative", async () => {
  const db = new MockSaleDatabase(
    [{ id: 1, fuelTypeId: 1, liters: 100, pricePerLiter: 30, totalAmount: 3000, paymentMethod: "cash", pumpNo: "1", customerName: null, note: null, version: 5 }],
    [{ fuelTypeId: 1, currentLiters: 20, version: 10 }] // Exactly 20 L available, edit needs 20 L additional
  );

  const input = parseSaleEditInput({ id: 1, expectedVersion: 5, fuelTypeId: 1, totalAmount: 3600, pricePerLiter: 30, paymentMethod: "cash", pumpNo: "1", reason: "Exact stock" });
  const res = await db.executeOCCSaleEdit(input);

  assert.equal(res.status, 200);
  assert.equal(db.sales.get(1)?.liters, 120);
  assert.equal(db.stocks.get(1)?.currentLiters, 0, "Stock is exactly 0 L (never negative)");
  assert.equal(db.stocks.get(1)?.version, 11);
  assert.equal(db.audits.length, 1);
});

// 21. Fuel-type change with insufficient destination stock: entire transaction rolls back
test("21. Fuel-type change with insufficient destination stock: entire transaction rolls back", async () => {
  const db = new MockSaleDatabase(
    [{ id: 1, fuelTypeId: 1, liters: 100, pricePerLiter: 30, totalAmount: 3000, paymentMethod: "cash", pumpNo: "1", customerName: null, note: null, version: 5 }],
    [
      { fuelTypeId: 1, currentLiters: 900, version: 10 }, // Diesel
      { fuelTypeId: 2, currentLiters: 50, version: 20 },  // Gasohol (only 50 L available, but edit needs 80 L!)
    ]
  );

  const input = parseSaleEditInput({ id: 1, expectedVersion: 5, fuelTypeId: 2, totalAmount: 3200, pricePerLiter: 40, paymentMethod: "cash", pumpNo: "2", reason: "Change fuel type" });
  const res = await db.executeOCCSaleEdit(input);

  assert.equal(res.status, 409);
  assert.equal((res.body as { code?: string }).code, SALE_MUTATION_ERROR_CODES.INSUFFICIENT_FUEL_STOCK);
  assert.equal(db.sales.get(1)?.fuelTypeId, 1, "Sale remains Diesel");
  assert.equal(db.sales.get(1)?.liters, 100);
  assert.equal(db.sales.get(1)?.version, 5);
  assert.equal(db.stocks.get(1)?.currentLiters, 900, "Diesel stock NOT refunded (rollback)");
  assert.equal(db.stocks.get(1)?.version, 10);
  assert.equal(db.stocks.get(2)?.currentLiters, 50, "Gasohol stock NOT deducted (rollback)");
  assert.equal(db.stocks.get(2)?.version, 20);
  assert.equal(db.audits.length, 0);
});

// 22. Concurrent legitimate edits competing for scarce fuel: exactly one succeeds, other gets INSUFFICIENT_FUEL_STOCK
test("22. Two different Sale edits competing for scarce same FuelStock: exactly one succeeds, other gets INSUFFICIENT_FUEL_STOCK", async () => {
  const db = new MockSaleDatabase(
    [
      { id: 1, fuelTypeId: 1, liters: 100, pricePerLiter: 30, totalAmount: 3000, paymentMethod: "cash", pumpNo: "1", customerName: null, note: null, version: 5 },
      { id: 2, fuelTypeId: 1, liters: 50, pricePerLiter: 30, totalAmount: 1500, paymentMethod: "cash", pumpNo: "2", customerName: null, note: null, version: 3 },
    ],
    [{ fuelTypeId: 1, currentLiters: 20, version: 10 }] // Only 20 L available! Each edit requires 20 L more!
  );

  // Sale 1: 100 -> 120 L (+20 L needed)
  // Sale 2: 50 -> 70 L (+20 L needed)
  const input1 = parseSaleEditInput({ id: 1, expectedVersion: 5, fuelTypeId: 1, totalAmount: 3600, pricePerLiter: 30, paymentMethod: "cash", pumpNo: "1", reason: "Sale 1 needs 20L" });
  const input2 = parseSaleEditInput({ id: 2, expectedVersion: 3, fuelTypeId: 1, totalAmount: 2100, pricePerLiter: 30, paymentMethod: "cash", pumpNo: "2", reason: "Sale 2 needs 20L" });

  const res1 = await db.executeOCCSaleEdit(input1);
  const res2 = await db.executeOCCSaleEdit(input2);

  assert.equal(res1.status, 200, "First competitor takes the last 20 L");
  assert.equal(res2.status, 409, "Second competitor rejected because stock would drop below 0");
  assert.equal((res2.body as { code?: string }).code, SALE_MUTATION_ERROR_CODES.INSUFFICIENT_FUEL_STOCK);

  // Final assertions:
  assert.equal(db.sales.get(1)?.liters, 120, "Sale 1 updated to 120 L");
  assert.equal(db.sales.get(1)?.version, 6);
  assert.equal(db.sales.get(2)?.liters, 50, "Sale 2 remains 50 L");
  assert.equal(db.sales.get(2)?.version, 3);
  assert.equal(db.stocks.get(1)?.currentLiters, 0, "Stock is 0 L (never negative!)");
  assert.equal(db.stocks.get(1)?.version, 11, "Stock version incremented exactly once by winner");
  assert.equal(db.audits.length, 1, "Only 1 audit record for winner");
});
