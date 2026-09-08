import assert from "node:assert/strict";
import test from "node:test";

import { createSaleQueueSynchronizer, syncPendingSales, type PendingSale, type SaleQueueStore } from "./sale-queue";

function memoryStore(initial: PendingSale[]): SaleQueueStore & { rows: Map<string, PendingSale> } {
  const rows = new Map(initial.map((item) => [item.id, item]));
  return {
    rows,
    async list() { return [...rows.values()]; },
    async put(item) { rows.set(item.id, item); },
    async remove(id) { rows.delete(id); },
  };
}

const pending = (id: string, createdByAuthUserId?: string, expectedShiftId?: number, expectedPumpId?: number): PendingSale => ({
  id,
  createdAt: "2026-09-07T10:00:00.000Z",
  status: "queued",
  attempts: 0,
  payload: { clientRequestId: id },
  createdByAuthUserId,
  expectedShiftId,
  expectedPumpId,
});

test("removes a queued sale only after the server accepts it", async () => {
  const store = memoryStore([pending("sale-1")]);
  const result = await syncPendingSales(store, async () => ({ ok: true, status: 201 }));
  assert.equal(store.rows.size, 0);
  assert.deepEqual(result, { synced: 1, queued: 0, needsReview: 0 });
});

test("keeps the same request id queued after a network failure", async () => {
  const store = memoryStore([pending("sale-1")]);
  await syncPendingSales(store, async () => { throw new Error("offline"); });
  assert.equal(store.rows.get("sale-1")?.payload.clientRequestId, "sale-1");
  assert.equal(store.rows.get("sale-1")?.status, "queued");
  assert.equal(store.rows.get("sale-1")?.attempts, 1);
});

test("marks invalid data for review instead of retrying forever", async () => {
  const store = memoryStore([pending("sale-1")]);
  await syncPendingSales(store, async () => ({ ok: false, status: 400, error: "invalid" }));
  assert.equal(store.rows.get("sale-1")?.status, "needs-review");
});

test("keeps a sale queued when its user has not opened a shift yet", async () => {
  const store = memoryStore([pending("sale-1")]);
  const result = await syncPendingSales(store, async () => ({
    ok: false,
    status: 409,
    error: "กรุณาเปิดกะก่อนบันทึกการขาย",
    errorCode: "NO_OPEN_SHIFT",
  }));
  assert.equal(store.rows.get("sale-1")?.status, "queued");
  assert.equal(store.rows.get("sale-1")?.attempts, 1);
  assert.equal(result.queued, 1);
  assert.equal(result.needsReview, 0);
});

test("does not send a pending sale belonging to another signed-in user", async () => {
  const store = memoryStore([pending("sale-1", "user-a")]);
  let sent = false;
  const result = await syncPendingSales(store, async () => {
    sent = true;
    return { ok: true, status: 201 };
  }, "user-b");
  assert.equal(sent, false);
  assert.equal(store.rows.get("sale-1")?.status, "needs-review");
  assert.equal(result.needsReview, 1);
});

test("sends a pending sale when the verified user and original shift match", async () => {
  const store = memoryStore([pending("sale-1", "user-a", 12, 2)]);
  const result = await syncPendingSales(store, async (item) => {
    assert.equal(item.expectedShiftId, 12);
    assert.equal(item.expectedPumpId, 2);
    return { ok: true, status: 201 };
  }, "user-a");
  assert.equal(result.synced, 1);
  assert.equal(store.rows.size, 0);
});

test("waits for a verified session before synchronizing", async () => {
  const store = memoryStore([pending("sale-1", "user-a")]);
  let sent = false;
  const run = createSaleQueueSynchronizer(store, async () => {
    sent = true;
    return { ok: true, status: 201 };
  }, async () => null);
  const result = await run();
  assert.equal(sent, false);
  assert.equal(store.rows.get("sale-1")?.status, "queued");
  assert.equal(result.queued, 1);
});

test("a sale added while a sync is active is sent by the next requested run", async () => {
  const first = pending("first");
  const second = pending("second");
  const store = memoryStore([first]);
  let releaseFirst!: () => void;
  const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const sent: string[] = [];
  const run = createSaleQueueSynchronizer(store, async (item) => {
    sent.push(item.id);
    if (item.id === "first") await firstBlocked;
    return { ok: true, status: 201 };
  });

  const firstRun = run();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await store.put(second);
  const secondRun = run();
  releaseFirst();
  await Promise.all([firstRun, secondRun]);

  assert.deepEqual(sent, ["first", "second"]);
  assert.equal((await store.list()).length, 0);
});
