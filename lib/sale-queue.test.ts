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

const pending = (id: string): PendingSale => ({
  id,
  createdAt: "2026-09-07T10:00:00.000Z",
  status: "queued",
  attempts: 0,
  payload: { clientRequestId: id },
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
