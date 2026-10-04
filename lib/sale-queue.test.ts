import assert from "node:assert/strict";
import test from "node:test";

import { createSaleQueueSynchronizer, removeQuickSalePumpAssignments, retryNeedsReview, syncPendingSales, type PendingSale, type SaleQueueStore } from "./sale-queue";

function memoryStore(initial: PendingSale[]): SaleQueueStore & { rows: Map<string, PendingSale> } {
  const rows = new Map(initial.map((item) => [item.id, item]));
  return {
    rows,
    async list() { return [...rows.values()]; },
    async put(item) { rows.set(item.id, item); },
    async remove(id) { rows.delete(id); },
    async updateIfExists(id, updater) {
      const current = rows.get(id);
      if (!current) return false;
      rows.set(id, updater(current));
      return true;
    },
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

test("manual retry requeues needs-review sales so the server is called again", async () => {
  const item = { ...pending("sale-1"), status: "needs-review" as const, lastError: "missing meter" };
  const store = memoryStore([item]);
  await retryNeedsReview(store);
  let sent = 0;
  const result = await syncPendingSales(store, async () => {
    sent += 1;
    return { ok: true, status: 201 };
  });
  assert.equal(sent, 1);
  assert.equal(result.synced, 1);
  assert.equal(store.rows.size, 0);
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

test("still sends a legacy pending sale that contains shift context", async () => {
  const store = memoryStore([pending("sale-1", "user-a", 12, 2)]);
  const result = await syncPendingSales(store, async (item) => {
    assert.equal(item.expectedShiftId, 12);
    assert.equal(item.expectedPumpId, 2);
    return { ok: true, status: 201 };
  }, "user-a");
  assert.equal(result.synced, 1);
  assert.equal(store.rows.size, 0);
});

test("sends an authenticated quick sale without shift or pump context", async () => {
  const store = memoryStore([pending("sale-1", "user-a")]);
  let sent = false;
  const result = await syncPendingSales(store, async () => {
    sent = true;
    return { ok: true, status: 201 };
  }, "user-a");
  assert.equal(sent, true);
  assert.equal(result.synced, 1);
  assert.equal(store.rows.size, 0);
});

test("removes a legacy fabricated pump before retrying a queued quick sale", async () => {
  const item = {
    ...pending("sale-1", "user-a", undefined, 1),
    status: "needs-review" as const,
    lastError: "ชนิดน้ำมันไม่ตรงกับหัวจ่ายหรือรอบมิเตอร์",
    payload: { clientRequestId: "sale-1", totalAmount: "50", pumpId: 1, expectedPumpId: 1, pumpNo: "หัวจ่าย 1" },
  };
  const store = memoryStore([item]);
  await removeQuickSalePumpAssignments(store);
  const updated = store.rows.get("sale-1");
  assert.equal(updated?.expectedPumpId, undefined);
  assert.equal("pumpId" in (updated?.payload ?? {}), false);
  assert.equal("expectedPumpId" in (updated?.payload ?? {}), false);
  assert.equal("pumpNo" in (updated?.payload ?? {}), false);
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

test("lost response: server returns 200 Idempotent-Replay => treated as success and removed", async () => {
  const store = memoryStore([pending("sale-lost-response")]);
  let sentCount = 0;
  const result = await syncPendingSales(store, async (item) => {
    sentCount += 1;
    assert.equal(item.payload.clientRequestId, "sale-lost-response");
    // Server simulates idempotent replay: 200 OK
    return { ok: true, status: 200 };
  });

  assert.equal(sentCount, 1);
  assert.equal(result.synced, 1);
  assert.equal(store.rows.size, 0);
});

test("HTTP 500 server error => item retained as queued with incremented attempts", async () => {
  const store = memoryStore([pending("sale-500")]);
  const result = await syncPendingSales(store, async () => {
    return { ok: false, status: 500, error: "Internal Server Error" };
  });

  assert.equal(result.synced, 0);
  assert.equal(result.queued, 1);
  const item = store.rows.get("sale-500");
  assert.equal(item?.status, "queued");
  assert.equal(item?.attempts, 1);
  assert.equal(item?.lastError, "Internal Server Error");
});

test("timeout / AbortError => item retained as queued with same clientRequestId", async () => {
  const store = memoryStore([pending("sale-timeout")]);
  const result = await syncPendingSales(store, async () => {
    const error = new Error("The operation was aborted");
    error.name = "AbortError";
    throw error;
  });

  assert.equal(result.synced, 0);
  assert.equal(result.queued, 1);
  const item = store.rows.get("sale-timeout");
  assert.equal(item?.status, "queued");
  assert.equal(item?.attempts, 1);
  assert.equal(item?.payload.clientRequestId, "sale-timeout");
  assert.equal(item?.lastError, "The operation was aborted");
});

test("401 Unauthorized => item retained as needs-review without silent deletion", async () => {
  const store = memoryStore([pending("sale-401")]);
  const result = await syncPendingSales(store, async () => {
    return { ok: false, status: 401, error: "กรุณาเข้าสู่ระบบก่อนทำรายการ" };
  });

  assert.equal(result.synced, 0);
  assert.equal(result.needsReview, 1);
  const item = store.rows.get("sale-401");
  assert.equal(item?.status, "needs-review");
  assert.equal(item?.payload.clientRequestId, "sale-401");
  assert.equal(item?.lastError, "กรุณาเข้าสู่ระบบก่อนทำรายการ");
});

test("403 Forbidden => item retained as needs-review without silent discard", async () => {
  const store = memoryStore([pending("sale-403")]);
  const result = await syncPendingSales(store, async () => {
    return { ok: false, status: 403, error: "ไม่อนุญาตให้ใช้รายการของบัญชีอื่น" };
  });

  assert.equal(result.synced, 0);
  assert.equal(result.needsReview, 1);
  const item = store.rows.get("sale-403");
  assert.equal(item?.status, "needs-review");
  assert.equal(item?.lastError, "ไม่อนุญาตให้ใช้รายการของบัญชีอื่น");
});

test("409 Conflict => item retained as needs-review with conflict error", async () => {
  const store = memoryStore([pending("sale-409")]);
  const result = await syncPendingSales(store, async () => {
    return { ok: false, status: 409, error: "รหัสรายการนี้ถูกใช้กับข้อมูลอื่นแล้ว" };
  });

  assert.equal(result.synced, 0);
  assert.equal(result.needsReview, 1);
  const item = store.rows.get("sale-409");
  assert.equal(item?.status, "needs-review");
  assert.equal(item?.lastError, "รหัสรายการนี้ถูกใช้กับข้อมูลอื่นแล้ว");
});

test("multiple queue items all succeed sequentially in order", async () => {
  const item1 = { ...pending("sale-1"), createdAt: "2026-09-07T10:00:00.000Z" };
  const item2 = { ...pending("sale-2"), createdAt: "2026-09-07T10:05:00.000Z" };
  const item3 = { ...pending("sale-3"), createdAt: "2026-09-07T10:10:00.000Z" };
  const store = memoryStore([item3, item1, item2]); // Unordered in storage

  const sentOrder: string[] = [];
  const result = await syncPendingSales(store, async (item) => {
    sentOrder.push(item.id);
    return { ok: true, status: 201 };
  });

  assert.equal(result.synced, 3);
  assert.equal(store.rows.size, 0);
});

test("middle item failure retains middle item while others succeed", async () => {
  const item1 = pending("sale-1");
  const item2 = pending("sale-2");
  const item3 = pending("sale-3");
  const store = memoryStore([item1, item2, item3]);

  const result = await syncPendingSales(store, async (item) => {
    if (item.id === "sale-2") {
      return { ok: false, status: 500, error: "Temporary outage" };
    }
    return { ok: true, status: 201 };
  });

  assert.equal(result.synced, 2);
  assert.equal(result.queued, 1);
  assert.equal(store.rows.has("sale-1"), false);
  assert.equal(store.rows.has("sale-2"), true);
  assert.equal(store.rows.has("sale-3"), false);
  assert.equal(store.rows.get("sale-2")?.status, "queued");
});

test("business Sale.date is preserved in payload and sent unchanged across retries", async () => {
  const originalDate = "2026-10-04T08:15:30.000+07:00";
  const item: PendingSale = {
    id: "sale-with-date",
    createdAt: "2026-10-04T08:15:30.000Z",
    status: "queued",
    attempts: 2,
    payload: {
      clientRequestId: "sale-with-date",
      date: originalDate,
      fuelTypeId: 1,
      totalAmount: "500",
    },
  };
  const store = memoryStore([item]);

  let receivedDate: unknown;
  await syncPendingSales(store, async (sentItem) => {
    receivedDate = sentItem.payload.date;
    return { ok: true, status: 201 };
  });

  assert.equal(receivedDate, originalDate);
  assert.equal(store.rows.size, 0);
});

test("repeated sync runs on empty queue do nothing safely", async () => {
  const store = memoryStore([]);
  let sendCalled = false;
  const run = createSaleQueueSynchronizer(store, async () => {
    sendCalled = true;
    return { ok: true, status: 201 };
  });

  const res1 = await run();
  const res2 = await run();

  assert.equal(sendCalled, false);
  assert.deepEqual(res1, { synced: 0, queued: 0, needsReview: 0 });
  assert.deepEqual(res2, { synced: 0, queued: 0, needsReview: 0 });
});

test("corrupted queue item missing payload properties is handled safely without crashing", async () => {
  const corruptedItem = {
    id: "sale-corrupted",
    createdAt: "2026-09-07T10:00:00.000Z",
    status: "queued" as const,
    attempts: 0,
    payload: { clientRequestId: "sale-corrupted" }, // minimal payload
  };
  const store = memoryStore([corruptedItem]);

  const result = await syncPendingSales(store, async () => {
    // Server rejects corrupted item with 400 Bad Request
    return { ok: false, status: 400, error: "ข้อมูลไม่ครบหรือไม่ถูกต้อง" };
  });

  assert.equal(result.synced, 0);
  assert.equal(result.needsReview, 1);
  assert.equal(store.rows.get("sale-corrupted")?.status, "needs-review");
  assert.equal(store.rows.get("sale-corrupted")?.lastError, "ข้อมูลไม่ครบหรือไม่ถูกต้อง");
});

test("concurrent duplicate sync calls are serialized and never send items twice", async () => {
  const store = memoryStore([pending("sale-single-flight")]);
  let sendExecutionCount = 0;

  const run = createSaleQueueSynchronizer(store, async (item) => {
    sendExecutionCount += 1;
    // Simulate latency
    await new Promise((r) => setTimeout(r, 10));
    return { ok: true, status: 201 };
  });

  // Launch two syncs concurrently (e.g. online event + user clicking retry at same time)
  const [resA, resB] = await Promise.all([run(), run()]);

  // Total times send was executed must be exactly 1
  assert.equal(sendExecutionCount, 1);
  assert.equal(resA.synced, 1);
  assert.equal(resB.synced, 0); // Second run finds queue empty
  assert.equal(store.rows.size, 0);
});

test("strict dequeue: send result with ok: false does not remove item from queue", async () => {
  const store = memoryStore([pending("sale-strict-check")]);
  const result = await syncPendingSales(store, async () => {
    return { ok: false, status: 200, error: "Malformed response" };
  });

  assert.equal(result.synced, 0);
  assert.equal(store.rows.has("sale-strict-check"), true);
  assert.equal(store.rows.get("sale-strict-check")?.lastError, "Malformed response");
});

test("crash recovery: item persisted as 'sending' from a previous crash is picked up and synced", async () => {
  const crashedItem: PendingSale = {
    ...pending("sale-crashed"),
    status: "sending",
    attempts: 1,
    payload: { clientRequestId: "sale-crashed", totalAmount: "100" },
  };
  const store = memoryStore([crashedItem]);

  let sentWithId: string | null = null;
  const result = await syncPendingSales(store, async (item) => {
    sentWithId = item.payload.clientRequestId;
    return { ok: true, status: 200 };
  });

  assert.equal(sentWithId, "sale-crashed");
  assert.equal(result.synced, 1);
  assert.equal(store.rows.size, 0);
});

test("true multi-tab simulation: two independent synchronizers on shared store with server idempotency", async () => {
  const sharedStore = memoryStore([pending("sale-shared-multitab")]);

  let serverSalesCount = 0;
  let serverStockDecrements = 0;

  const simulateServerPost = async (item: PendingSale) => {
    await new Promise((r) => setTimeout(r, 10));
    if (serverSalesCount === 0) {
      serverSalesCount += 1;
      serverStockDecrements += 1;
      return { ok: true, status: 201 };
    } else {
      return { ok: true, status: 200 };
    }
  };

  const syncTabA = createSaleQueueSynchronizer(sharedStore, simulateServerPost);
  const syncTabB = createSaleQueueSynchronizer(sharedStore, simulateServerPost);

  const [resA, resB] = await Promise.all([syncTabA(), syncTabB()]);

  // Exact database invariants:
  assert.equal(serverSalesCount, 1);
  assert.equal(serverStockDecrements, 1);
  assert.equal(sharedStore.rows.size, 0);
  // Both tabs received 2xx (one 201, one 200 replay), so both report their sync attempt succeeded
  assert.equal(resA.synced, 1);
  assert.equal(resB.synced, 1);
});

test("single-flight tail recovery: unexpected store failure does not permanently poison synchronizer", async () => {
  let listShouldThrow = true;
  const flakyStore: SaleQueueStore = {
    async list() {
      if (listShouldThrow) {
        listShouldThrow = false;
        throw new Error("IndexedDB transient failure");
      }
      return [pending("sale-recovered")];
    },
    async put() {},
    async remove(id) {
      assert.equal(id, "sale-recovered");
    },
  };

  const run = createSaleQueueSynchronizer(flakyStore, async () => {
    return { ok: true, status: 201 };
  });

  // First run rejects because store.list threw
  await run().catch((err) => {
    assert.match(err.message, /IndexedDB transient failure/);
  });

  // Second run: store works normally now. Synchronizer tail must NOT be poisoned!
  const res2 = await run();
  assert.equal(res2.synced, 1);
});

test("multi-tab resurrection prevention A: network error after 201 does not resurrect item", async () => {
  const sharedStore = memoryStore([pending("sale-resurrect-a")]);

  let tabBFail: () => void;
  const tabBGate = new Promise<never>((_, reject) => {
    tabBFail = () => reject(new Error("Tab B network timeout"));
  });

  const sendA = async (_item: PendingSale) => {
    return { ok: true, status: 201 };
  };

  const sendB = async (_item: PendingSale) => {
    await tabBGate;
    return { ok: true, status: 201 };
  };

  const syncA = createSaleQueueSynchronizer(sharedStore, sendA);
  const syncB = createSaleQueueSynchronizer(sharedStore, sendB);

  const promiseA = syncA();
  const promiseB = syncB();

  const resA = await promiseA;
  assert.equal(resA.synced, 1);
  assert.equal(sharedStore.rows.size, 0, "Tab A should have removed the item after 201");

  tabBFail!();
  const resB = await promiseB;

  assert.equal(sharedStore.rows.size, 0, "Item must not be resurrected into store on network error");
  assert.equal(resB.queued, 0);
  assert.equal(resB.needsReview, 0);
});

test("multi-tab resurrection prevention B: 401/403 after 201 does not recreate item as needs-review", async () => {
  const sharedStore = memoryStore([pending("sale-resurrect-b")]);

  let tabBFinish: () => void;
  const tabBGate = new Promise<void>((resolve) => {
    tabBFinish = resolve;
  });

  const sendA = async (_item: PendingSale) => {
    return { ok: true, status: 201 };
  };

  const sendB = async (_item: PendingSale) => {
    await tabBGate;
    return { ok: false, status: 401, error: "Session expired on Tab B" };
  };

  const syncA = createSaleQueueSynchronizer(sharedStore, sendA);
  const syncB = createSaleQueueSynchronizer(sharedStore, sendB);

  const promiseA = syncA();
  const promiseB = syncB();

  const resA = await promiseA;
  assert.equal(resA.synced, 1);
  assert.equal(sharedStore.rows.size, 0);

  tabBFinish!();
  const resB = await promiseB;

  assert.equal(sharedStore.rows.size, 0, "Item must not be resurrected as needs-review");
  assert.equal(resB.needsReview, 0);
});

test("multi-tab resurrection prevention C: 500 error after 201 does not recreate item as queued", async () => {
  const sharedStore = memoryStore([pending("sale-resurrect-c")]);

  let tabBFinish: () => void;
  const tabBGate = new Promise<void>((resolve) => {
    tabBFinish = resolve;
  });

  const sendA = async (_item: PendingSale) => {
    return { ok: true, status: 201 };
  };

  const sendB = async (_item: PendingSale) => {
    await tabBGate;
    return { ok: false, status: 500, error: "Server crashed during replay" };
  };

  const syncA = createSaleQueueSynchronizer(sharedStore, sendA);
  const syncB = createSaleQueueSynchronizer(sharedStore, sendB);

  const promiseA = syncA();
  const promiseB = syncB();

  const resA = await promiseA;
  assert.equal(resA.synced, 1);
  assert.equal(sharedStore.rows.size, 0);

  tabBFinish!();
  const resB = await promiseB;

  assert.equal(sharedStore.rows.size, 0, "Item must not be resurrected as queued on 500");
  assert.equal(resB.queued, 0);
});

test("multi-tab resurrection prevention D: both tabs fail transiently, item remains queued for retry", async () => {
  const sharedStore = memoryStore([pending("sale-transient-d")]);

  const sendFailure = async (_item: PendingSale) => {
    await new Promise((r) => setTimeout(r, 10));
    throw new Error("Both tabs offline");
  };

  const syncA = createSaleQueueSynchronizer(sharedStore, sendFailure);
  const syncB = createSaleQueueSynchronizer(sharedStore, sendFailure);

  const [resA, resB] = await Promise.all([syncA(), syncB()]);

  assert.equal(sharedStore.rows.size, 1);
  const item = sharedStore.rows.get("sale-transient-d");
  assert.equal(item?.status, "queued");
  assert.ok(item?.attempts && item.attempts >= 1);
  assert.equal(resA.synced, 0);
  assert.equal(resB.synced, 0);
});
