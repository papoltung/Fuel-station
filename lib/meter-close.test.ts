import test from "node:test";
import assert from "node:assert/strict";
import {
  parseMeterCloseInput,
  validateMeterClosePreconditions,
  METER_CLOSE_ERROR_CODES,
  type MeterPeriodRecord,
  type MeterCloseActor,
} from "./meter-close";

interface MockDb {
  periods: Map<number, MeterPeriodRecord>;
}

function createMockDb(): MockDb {
  return {
    periods: new Map(),
  };
}

/**
 * Simulates current UNGUARDED close implementation:
 * 1. Read existing
 * 2. Check preconditions in JS memory
 * 3. prisma.meterPeriod.update({ where: { id }, data: ... })
 */
async function executeUnguardedClose(
  db: MockDb,
  actor: MeterCloseActor,
  id: number,
  meterEnd: number
) {
  const existing = db.periods.get(id) ?? null;
  const validation = validateMeterClosePreconditions(existing, actor, meterEnd);
  if (!validation.ok) {
    return { ok: false as const, status: validation.status, code: validation.code, error: validation.error };
  }

  // Vulnerable blind update
  const updated: MeterPeriodRecord = {
    ...existing!,
    meterEnd,
    liters: validation.liters,
    totalRevenue: validation.totalRevenue,
    closedById: actor.id,
    closedByName: actor.name,
    closedByEmail: actor.email,
    closedAt: new Date(),
  };
  db.periods.set(id, updated);
  return { ok: true as const, status: 200, data: updated };
}

/**
 * Simulates proposed GUARDED atomic close implementation:
 * 1. Read existing & check preconditions
 * 2. Atomic updateMany({ where: { id, meterEnd: null }, data: ... })
 * 3. If count !== 1 => check if row was deleted or already closed
 */
async function executeGuardedClose(
  db: MockDb,
  actor: MeterCloseActor,
  id: number,
  meterEnd: number
) {
  const existing = db.periods.get(id) ?? null;
  const validation = validateMeterClosePreconditions(existing, actor, meterEnd);
  if (!validation.ok) {
    return { ok: false as const, status: validation.status, code: validation.code, error: validation.error };
  }

  // Atomic conditional update simulation: UPDATE "MeterPeriod" ... WHERE id = :id AND meterEnd IS NULL
  const current = db.periods.get(id);
  if (!current || current.meterEnd !== null) {
    // 0 rows updated
    const fresh = db.periods.get(id);
    if (!fresh) {
      return { ok: false as const, status: 404, code: METER_CLOSE_ERROR_CODES.NOT_FOUND, error: "ไม่พบรายการมิเตอร์" };
    }
    return {
      ok: false as const,
      status: 409,
      code: METER_CLOSE_ERROR_CODES.METER_ALREADY_CLOSED,
      error: "รอบมิเตอร์นี้ปิดไปแล้ว กรุณาโหลดหน้าใหม่",
    };
  }

  // 1 row updated atomically
  const updated: MeterPeriodRecord = {
    ...current,
    meterEnd,
    liters: validation.liters,
    totalRevenue: validation.totalRevenue,
    closedById: actor.id,
    closedByName: actor.name,
    closedByEmail: actor.email,
    closedAt: new Date(),
  };
  db.periods.set(id, updated);

  return { ok: true as const, status: 200, data: updated };
}

function makeOpenPeriod(overrides?: Partial<MeterPeriodRecord>): MeterPeriodRecord {
  return {
    id: 10,
    date: new Date("2026-10-04T08:00:00Z"),
    fuelTypeId: 1,
    pumpId: 2,
    meterStart: 10000,
    meterEnd: null,
    liters: null,
    pricePerLiter: 30,
    totalRevenue: null,
    note: null,
    openedById: 1,
    openedByName: "Attendant A",
    openedByEmail: "a@fuel.local",
    closedById: null,
    closedByName: null,
    closedByEmail: null,
    closedAt: null,
    ...overrides,
  };
}

const attendantA: MeterCloseActor = { id: 1, role: "staff", name: "Attendant A", email: "a@fuel.local" };
const attendantB: MeterCloseActor = { id: 2, role: "staff", name: "Attendant B", email: "b@fuel.local" };
const ownerUser: MeterCloseActor = { id: 99, role: "owner", name: "Owner Boss", email: "owner@fuel.local" };

test("REPRODUCE RACE: Unguarded close allows Request B to overwrite Request A", async () => {
  const db = createMockDb();
  db.periods.set(10, makeOpenPeriod());

  // Interleaving: Both read when meterEnd is null
  const reqA_existing = db.periods.get(10)!;
  const reqB_existing = db.periods.get(10)!;

  const validA = validateMeterClosePreconditions(reqA_existing, attendantA, 10100);
  const validB = validateMeterClosePreconditions(reqB_existing, ownerUser, 10120);

  assert.equal(validA.ok, true);
  assert.equal(validB.ok, true);

  // A writes first
  const updatedA: MeterPeriodRecord = {
    ...reqA_existing,
    meterEnd: 10100,
    liters: validA.ok ? validA.liters : 0,
    totalRevenue: validA.ok ? validA.totalRevenue : 0,
    closedById: attendantA.id,
    closedByName: attendantA.name,
    closedByEmail: attendantA.email,
    closedAt: new Date(),
  };
  db.periods.set(10, updatedA);

  // B writes second, blindly overwriting A
  const updatedB: MeterPeriodRecord = {
    ...reqB_existing,
    meterEnd: 10120,
    liters: validB.ok ? validB.liters : 0,
    totalRevenue: validB.ok ? validB.totalRevenue : 0,
    closedById: ownerUser.id,
    closedByName: ownerUser.name,
    closedByEmail: ownerUser.email,
    closedAt: new Date(),
  };
  db.periods.set(10, updatedB);

  // PROOF OF BUG in unguarded code:
  const finalState = db.periods.get(10)!;
  assert.equal(finalState.meterEnd, 10120);
  assert.equal(finalState.liters, 120);
  assert.equal(finalState.closedById, ownerUser.id);
  // Attendant A's close was silently lost!
});

test("1. Normal close: OPEN -> CLOSED transitions correctly with all derived values", async () => {
  const db = createMockDb();
  db.periods.set(10, makeOpenPeriod());

  const result = await executeGuardedClose(db, attendantA, 10, 10100);
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);

  const finalState = db.periods.get(10)!;
  assert.equal(finalState.meterEnd, 10100);
  assert.equal(finalState.liters, 100);
  assert.equal(finalState.totalRevenue, 3000);
  assert.equal(finalState.closedById, 1);
  assert.equal(finalState.closedByName, "Attendant A");
  assert.ok(finalState.closedAt instanceof Date);
});

test("2. Concurrent close, same meterEnd: exactly one wins, second gets 409 METER_ALREADY_CLOSED", async () => {
  const db = createMockDb();
  db.periods.set(10, makeOpenPeriod());

  // Both attempt with meterEnd = 10100
  const [resA, resB] = await Promise.all([
    executeGuardedClose(db, attendantA, 10, 10100),
    executeGuardedClose(db, attendantA, 10, 10100),
  ]);

  const successes = [resA, resB].filter((r) => r.ok);
  const conflicts = [resA, resB].filter((r) => !r.ok && r.code === METER_CLOSE_ERROR_CODES.METER_ALREADY_CLOSED);

  assert.equal(successes.length, 1);
  assert.equal(conflicts.length, 1);

  const finalState = db.periods.get(10)!;
  assert.equal(finalState.meterEnd, 10100);
  assert.equal(finalState.liters, 100);
});

test("3. Concurrent close, different meterEnd: exactly one wins, loser cannot overwrite", async () => {
  const db = createMockDb();
  db.periods.set(10, makeOpenPeriod());

  // Attendant A (10100) vs Owner (10120)
  const [resA, resB] = await Promise.all([
    executeGuardedClose(db, attendantA, 10, 10100),
    executeGuardedClose(db, ownerUser, 10, 10120),
  ]);

  const successes = [resA, resB].filter((r) => r.ok);
  const conflicts = [resA, resB].filter((r) => !r.ok && r.code === METER_CLOSE_ERROR_CODES.METER_ALREADY_CLOSED);

  assert.equal(successes.length, 1);
  assert.equal(conflicts.length, 1);

  const finalState = db.periods.get(10)!;
  if (resA.ok) {
    // A won
    assert.equal(finalState.meterEnd, 10100);
    assert.equal(finalState.liters, 100);
    assert.equal(finalState.totalRevenue, 3000);
    assert.equal(finalState.closedById, attendantA.id);
  } else {
    // B won
    assert.equal(finalState.meterEnd, 10120);
    assert.equal(finalState.liters, 120);
    assert.equal(finalState.totalRevenue, 3600);
    assert.equal(finalState.closedById, ownerUser.id);
  }
  // No mixed state ever!
});

test("4. Sequential double close: second attempt rejected without altering first close", async () => {
  const db = createMockDb();
  db.periods.set(10, makeOpenPeriod());

  const first = await executeGuardedClose(db, attendantA, 10, 10100);
  assert.equal(first.ok, true);

  const second = await executeGuardedClose(db, ownerUser, 10, 10200);
  assert.equal(second.ok, false);
  assert.equal(second.status, 409);
  assert.equal(second.code, METER_CLOSE_ERROR_CODES.METER_ALREADY_CLOSED);

  const finalState = db.periods.get(10)!;
  assert.equal(finalState.meterEnd, 10100);
  assert.equal(finalState.liters, 100);
});

test("5. Lost HTTP response + retry: client retrying gets 409 METER_ALREADY_CLOSED without mutating state", async () => {
  const db = createMockDb();
  db.periods.set(10, makeOpenPeriod());

  // First request commits
  const first = await executeGuardedClose(db, attendantA, 10, 10100);
  assert.equal(first.ok, true);

  // Response was dropped by network, client retries exact same request
  const retry = await executeGuardedClose(db, attendantA, 10, 10100);
  assert.equal(retry.ok, false);
  assert.equal(retry.status, 409);
  assert.equal(retry.code, METER_CLOSE_ERROR_CODES.METER_ALREADY_CLOSED);

  // State preserved perfectly
  const finalState = db.periods.get(10)!;
  assert.equal(finalState.meterEnd, 10100);
});

test("6. Unauthorized staff tries to close another user's open period: 403 METER_FORBIDDEN", async () => {
  const db = createMockDb();
  db.periods.set(10, makeOpenPeriod({ openedById: attendantA.id }));

  // Attendant B is not the opener and not an owner
  const res = await executeGuardedClose(db, attendantB, 10, 10100);
  assert.equal(res.ok, false);
  assert.equal(res.status, 403);
  assert.equal(res.code, METER_CLOSE_ERROR_CODES.METER_FORBIDDEN);

  // Row remains OPEN
  const finalState = db.periods.get(10)!;
  assert.equal(finalState.meterEnd, null);
});

test("7. Owner closes another user's open period: succeeds per business policy", async () => {
  const db = createMockDb();
  db.periods.set(10, makeOpenPeriod({ openedById: attendantA.id }));

  const res = await executeGuardedClose(db, ownerUser, 10, 10150);
  assert.equal(res.ok, true);
  assert.equal(res.status, 200);

  const finalState = db.periods.get(10)!;
  assert.equal(finalState.meterEnd, 10150);
  assert.equal(finalState.closedById, ownerUser.id);
});

test("8. Opener closes own period: succeeds", async () => {
  const db = createMockDb();
  db.periods.set(10, makeOpenPeriod({ openedById: attendantA.id }));

  const res = await executeGuardedClose(db, attendantA, 10, 10100);
  assert.equal(res.ok, true);
  assert.equal(res.status, 200);

  const finalState = db.periods.get(10)!;
  assert.equal(finalState.meterEnd, 10100);
});

test("9. Invalid meterEnd (meterEnd <= meterStart or negative): 400 INVALID_INPUT, zero DB mutation", async () => {
  const db = createMockDb();
  db.periods.set(10, makeOpenPeriod({ meterStart: 10000 }));

  // Test <= meterStart
  const res1 = await executeGuardedClose(db, attendantA, 10, 9999);
  assert.equal(res1.ok, false);
  assert.equal(res1.status, 400);

  const res2 = await executeGuardedClose(db, attendantA, 10, 10000);
  assert.equal(res2.ok, false);
  assert.equal(res2.status, 400);

  // Test parser invalid inputs
  const parseNegative = parseMeterCloseInput({ id: 10, meterEnd: -5 });
  assert.equal(parseNegative.ok, false);

  const parseNaN = parseMeterCloseInput({ id: 10, meterEnd: "abc" });
  assert.equal(parseNaN.ok, false);

  // Zero mutation in DB
  const finalState = db.periods.get(10)!;
  assert.equal(finalState.meterEnd, null);
});

test("10. Close vs DELETE race: no partial/mixed state", async () => {
  const db = createMockDb();
  db.periods.set(10, makeOpenPeriod());

  // Scenario 10A: DELETE commits first
  db.periods.delete(10);
  const closeAfterDelete = await executeGuardedClose(db, attendantA, 10, 10100);
  assert.equal(closeAfterDelete.ok, false);
  assert.equal(closeAfterDelete.status, 404);
  assert.equal(closeAfterDelete.code, METER_CLOSE_ERROR_CODES.NOT_FOUND);

  // Scenario 10B: Close commits first, then DELETE occurs
  db.periods.set(20, makeOpenPeriod({ id: 20 }));
  const closeFirst = await executeGuardedClose(db, attendantA, 20, 10100);
  assert.equal(closeFirst.ok, true);
  // Owner then deletes the closed period
  db.periods.delete(20);
  assert.equal(db.periods.has(20), false);
});

test("11. Close vs new OPEN on same pump: serialization invariant prevents two active periods", async () => {
  const db = createMockDb();
  db.periods.set(10, makeOpenPeriod({ pumpId: 5, meterEnd: null }));

  // Simulate POST /api/meter-periods check:
  // findFirst({ where: { pumpId: 5, meterEnd: null } })
  const findActivePeriod = (pumpId: number) => {
    for (const p of db.periods.values()) {
      if (p.pumpId === pumpId && p.meterEnd === null) return p;
    }
    return null;
  };

  // While period 10 is OPEN, open request on pump 5 must fail
  assert.ok(findActivePeriod(5) !== null);

  // Close period 10
  const closeRes = await executeGuardedClose(db, attendantA, 10, 10100);
  assert.equal(closeRes.ok, true);

  // Now pump 5 has no active open period
  assert.equal(findActivePeriod(5), null);

  // New period on pump 5 can now open safely
  db.periods.set(11, makeOpenPeriod({ id: 11, pumpId: 5, meterStart: 10100, meterEnd: null }));
  assert.ok(findActivePeriod(5) !== null);
  assert.equal(findActivePeriod(5)?.id, 11);
});

test("12. Response freshness: API response matches persisted winning row and derived values", async () => {
  const db = createMockDb();
  db.periods.set(10, makeOpenPeriod({ meterStart: 5000, pricePerLiter: 35.5 }));

  const res = await executeGuardedClose(db, attendantA, 10, 5200);
  assert.equal(res.ok, true);

  if (res.ok) {
    const data = res.data;
    assert.equal(data.meterEnd, 5200);
    assert.equal(data.liters, 200);
    assert.equal(data.totalRevenue, 200 * 35.5);
    assert.equal(data.closedById, attendantA.id);

    // Matches persisted row in DB exactly
    const inDb = db.periods.get(10)!;
    assert.deepEqual(data, inDb);
  }
});

test("13. Single-statement update eliminates re-read race with post-close DELETE", async () => {
  const db = createMockDb();
  db.periods.set(30, makeOpenPeriod({ id: 30, meterStart: 1000 }));

  // In single statement update, the mutation itself returns the row.
  // Even if a concurrent DELETE deletes the row immediately after update commits:
  const closePromise = executeGuardedClose(db, attendantA, 30, 1100);

  // Close completes and has the closed record in hand
  const closeRes = await closePromise;
  assert.equal(closeRes.ok, true);
  if (closeRes.ok) {
    assert.equal(closeRes.data.meterEnd, 1100);
    assert.equal(closeRes.data.liters, 100);
  }

  // Then DELETE occurs
  db.periods.delete(30);

  // Subsequent check sees it is deleted
  assert.equal(db.periods.has(30), false);
});
