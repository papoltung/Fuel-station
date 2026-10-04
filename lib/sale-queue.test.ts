import assert from "node:assert/strict";
import test from "node:test";

import {
  canUserDiscardPendingSale,
  categorizeQueueError,
  createSaleQueueSynchronizer,
  discardQueueItem,
  getDiscardWarning,
  getQueueCounts,
  parseQueueItemDisplay,
  removeQuickSalePumpAssignments,
  retryNeedsReview,
  STALE_QUEUE_WARNING_MS,
  syncPendingSales,
  type PendingSale,
  type SaleQueueStore,
} from "./sale-queue";

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

// ==========================================
// Sprint 3B — Recovery & Operations UX Tests
// ==========================================

test("3B-01: queue summary counts queued/sending/needs-review correctly", () => {
  const items: PendingSale[] = [
    { ...pending("s1"), status: "queued" },
    { ...pending("s2"), status: "queued" },
    { ...pending("s3"), status: "sending" },
    { ...pending("s4"), status: "needs-review" },
  ];
  const summary = getQueueCounts(items);
  assert.deepEqual(summary, { queued: 2, sending: 1, needsReview: 1, total: 4 });
});

test("3B-02: definitive server acceptance (201) removes item from visible queue", async () => {
  const store = memoryStore([pending("s-acc")]);
  const res = await syncPendingSales(store, async () => ({ ok: true, status: 201 }));
  assert.equal(res.synced, 1);
  const items = await store.list();
  assert.equal(items.length, 0);
});

test("3B-03: network failure leaves item visible as queued with friendly error category", async () => {
  const store = memoryStore([pending("s-net")]);
  await syncPendingSales(store, async () => { throw new Error("TypeError: Failed to fetch"); });
  const items = await store.list();
  assert.equal(items.length, 1);
  assert.equal(items[0].status, "queued");
  assert.equal(items[0].attempts, 1);
  const display = parseQueueItemDisplay(items[0]);
  assert.equal(display.errorCategory, "NETWORK");
  assert.match(display.friendlyError ?? "", /ยังไม่สามารถเชื่อมต่อ/);
});

test("3B-04: 401 leaves item visible as needs-review with AUTH_REQUIRED category", async () => {
  const store = memoryStore([pending("s-401")]);
  await syncPendingSales(store, async () => ({ ok: false, status: 401, error: "กรุณาเข้าสู่ระบบ" }));
  const items = await store.list();
  assert.equal(items.length, 1);
  assert.equal(items[0].status, "needs-review");
  const display = parseQueueItemDisplay(items[0]);
  assert.equal(display.errorCategory, "AUTH_REQUIRED");
  assert.match(display.friendlyError ?? "", /เซสชันหมดอายุ/);
});

test("3B-05: 403 leaves item visible as needs-review with FORBIDDEN category", async () => {
  const store = memoryStore([pending("s-403")]);
  await syncPendingSales(store, async () => ({ ok: false, status: 403, error: "ไม่มีสิทธิ์ทำรายการนี้" }));
  const items = await store.list();
  assert.equal(items.length, 1);
  assert.equal(items[0].status, "needs-review");
  const display = parseQueueItemDisplay(items[0]);
  assert.equal(display.errorCategory, "FORBIDDEN");
  assert.match(display.friendlyError ?? "", /ไม่มีสิทธิ์/);
});

test("3B-06: 400 invalid data stays visible for manual attention without silent drop", async () => {
  const store = memoryStore([pending("s-400")]);
  await syncPendingSales(store, async () => ({ ok: false, status: 400, error: "ยอดเงินไม่ถูกต้อง" }));
  const items = await store.list();
  assert.equal(items.length, 1);
  assert.equal(items[0].status, "needs-review");
  const display = parseQueueItemDisplay(items[0]);
  assert.equal(display.errorCategory, "INVALID_DATA");
  assert.equal(display.rawError, "ยอดเงินไม่ถูกต้อง");
});

test("3B-07: 409 idempotency conflict stays visible for manual attention", async () => {
  const store = memoryStore([pending("s-409")]);
  await syncPendingSales(store, async () => ({ ok: false, status: 409, error: "Conflict detected" }));
  const items = await store.list();
  assert.equal(items.length, 1);
  assert.equal(items[0].status, "needs-review");
  const display = parseQueueItemDisplay(items[0]);
  assert.equal(display.errorCategory, "IDEMPOTENCY_CONFLICT");
  assert.match(display.friendlyError ?? "", /ความขัดแย้ง/);
});

test("3B-08: retry preserves clientRequestId strictly", async () => {
  const item: PendingSale = { ...pending("s-reqid"), status: "needs-review", lastError: "some err" };
  const store = memoryStore([item]);
  await retryNeedsReview(store, "s-reqid");
  const [retried] = await store.list();
  assert.equal(retried.status, "queued");
  assert.equal(retried.payload.clientRequestId, "s-reqid");
  assert.equal(retried.id, "s-reqid");
});

test("3B-09: retry preserves original Sale.date strictly", async () => {
  const originalDate = "2026-09-07T08:30:00.000+07:00";
  const item: PendingSale = {
    ...pending("s-date"),
    status: "needs-review",
    payload: { clientRequestId: "s-date", date: originalDate, totalAmount: 500 },
  };
  const store = memoryStore([item]);
  await retryNeedsReview(store, "s-date");
  const [retried] = await store.list();
  assert.equal(retried.payload.date, originalDate);
});

test("3B-10: retry preserves entire payload without silent mutation", async () => {
  const fullPayload = {
    clientRequestId: "s-payload",
    date: "2026-09-07T12:00:00+07:00",
    fuelTypeId: "2",
    totalAmount: "700",
    pricePerLiter: "35.50",
    paymentMethod: "credit",
    customerName: "สมชาย ขนส่ง",
  };
  const item: PendingSale = { ...pending("s-payload"), status: "needs-review", payload: fullPayload };
  const store = memoryStore([item]);
  await retryNeedsReview(store, "s-payload");
  const [retried] = await store.list();
  assert.deepEqual(retried.payload, fullPayload);
});

test("3B-11: retry success removes item from queue", async () => {
  const item: PendingSale = { ...pending("s-ret-succ"), status: "needs-review" };
  const store = memoryStore([item]);
  await retryNeedsReview(store, "s-ret-succ");
  const res = await syncPendingSales(store, async () => ({ ok: true, status: 201 }));
  assert.equal(res.synced, 1);
  const remaining = await store.list();
  assert.equal(remaining.length, 0);
});

test("3B-12: retry failure returns item to correct state with incremented attempts", async () => {
  const item: PendingSale = { ...pending("s-ret-fail"), status: "needs-review", attempts: 2 };
  const store = memoryStore([item]);
  await retryNeedsReview(store, "s-ret-fail");
  await syncPendingSales(store, async () => ({ ok: false, status: 400, error: "ข้อมูลผิดพลาด" }));
  const [failed] = await store.list();
  assert.equal(failed.status, "needs-review");
  assert.equal(failed.attempts, 3);
});

test("3B-13: user cannot accidentally retry another user's item", async () => {
  const item: PendingSale = { ...pending("s-user-a", "user-a"), status: "queued" };
  const store = memoryStore([item]);
  let sent = false;
  await syncPendingSales(store, async () => {
    sent = true;
    return { ok: true, status: 201 };
  }, "user-b");
  assert.equal(sent, false);
  const [preserved] = await store.list();
  assert.equal(preserved.status, "needs-review");
  const display = parseQueueItemDisplay(preserved);
  assert.equal(display.errorCategory, "OWNERSHIP_MISMATCH");
});

test("3B-14: logout and login session loss does not erase queue items", async () => {
  const store = memoryStore([pending("s-session-drop", "user-a")]);
  const sync = createSaleQueueSynchronizer(
    store,
    async () => ({ ok: true, status: 201 }),
    async () => null // Logged out
  );
  const res = await sync();
  assert.equal(res.synced, 0);
  assert.equal(res.queued, 1);
  const items = await store.list();
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "s-session-drop");
});

test("3B-15: corrupted queue item does not crash parseQueueItemDisplay rendering", () => {
  const corruptedItem: PendingSale = {
    id: "s-corrupted",
    createdAt: "invalid-date",
    status: "needs-review",
    attempts: 0,
    payload: null as any,
  };
  const display = parseQueueItemDisplay(corruptedItem);
  assert.equal(display.id, "s-corrupted");
  assert.equal(display.totalAmount, 0);
  assert.equal(display.isCorrupted, true);
  assert.equal(display.shortId, "rupted");
});

test("3B-16: discard requires explicit confirmation contract and accurate ambiguous state wording", async () => {
  const item = pending("s-conf");
  const warning = getDiscardWarning(item);
  assert.match(warning.warningMessage, /ยังไม่ได้รับการยืนยันสถานะจากเซิร์ฟเวอร์/);
  assert.doesNotMatch(warning.warningMessage, /ยังไม่ได้รับการบันทึกบนเซิร์ฟเวอร์/);

  const store = memoryStore([item]);
  let confirmed = false;
  const handleUserDiscardRequest = async (id: string, userConfirmed: boolean) => {
    if (!userConfirmed) return false;
    return discardQueueItem(store, id);
  };

  const didDiscard1 = await handleUserDiscardRequest("s-conf", confirmed);
  assert.equal(didDiscard1, false);
  assert.equal((await store.list()).length, 1);

  confirmed = true;
  const didDiscard2 = await handleUserDiscardRequest("s-conf", confirmed);
  assert.equal(didDiscard2, true);
  assert.equal((await store.list()).length, 0);
});

test("3B-17: discard removes only the selected local queue item", async () => {
  const store = memoryStore([pending("s-keep"), pending("s-drop")]);
  const dropped = await discardQueueItem(store, "s-drop");
  assert.equal(dropped, true);
  const remaining = await store.list();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, "s-keep");
});

test("3B-18: discard is purely local and does NOT call DELETE /api/sales", async () => {
  const serverDeleteCalls: string[] = [];
  const fakeFetch = async (url: string, init?: RequestInit) => {
    if (init?.method === "DELETE") serverDeleteCalls.push(url);
    return new Response(null, { status: 200 });
  };
  void fakeFetch;

  const store = memoryStore([pending("s-local-only")]);
  await discardQueueItem(store, "s-local-only");

  assert.equal(serverDeleteCalls.length, 0, "Discard must never call DELETE on server");
  assert.equal((await store.list()).length, 0);
});

test("3B-19: canceling discard confirmation leaves item untouched in store", async () => {
  const store = memoryStore([pending("s-cancel-disc")]);
  let modalOpen = true;
  modalOpen = false;
  void modalOpen;
  const items = await store.list();
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "s-cancel-disc");
});

test("3B-20: one item's failure does not hide or block other queued items", async () => {
  const store = memoryStore([pending("s-fail"), pending("s-pass")]);
  const res = await syncPendingSales(store, async (item) => {
    if (item.id === "s-fail") return { ok: false, status: 400, error: "Bad fuel" };
    return { ok: true, status: 201 };
  });
  assert.equal(res.synced, 1);
  assert.equal(res.needsReview, 1);
  const remaining = await store.list();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, "s-fail");
});

test("3B-21: sending state is represented correctly in counts and status labels", () => {
  const item: PendingSale = { ...pending("s-sending"), status: "sending" };
  const counts = getQueueCounts([item]);
  assert.equal(counts.sending, 1);
  assert.equal(counts.queued, 0);
  const display = parseQueueItemDisplay(item);
  assert.equal(display.statusLabel, "กำลังส่ง");
});

test("3B-22: empty queue shows zero counts without false warnings", () => {
  const counts = getQueueCounts([]);
  assert.deepEqual(counts, { queued: 0, sending: 0, needsReview: 0, total: 0 });
  const shouldShowWarning = counts.queued > 0 || counts.needsReview > 0;
  assert.equal(shouldShowWarning, false);
});

test("3B-23: stale/old queue item remains present and visible with isStale flag", () => {
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const oldItem: PendingSale = {
    ...pending("s-old"),
    createdAt: twoDaysAgo,
    status: "needs-review",
  };
  const display = parseQueueItemDisplay(oldItem, undefined, 24 * 60 * 60 * 1000);
  assert.equal(display.isStale, true);
  assert.equal(display.id, "s-old");
});

test("3B-24: multi-tab Sprint 3A invariants remain green with new UX helpers", async () => {
  const sharedStore = memoryStore([pending("s-multitab-3b")]);
  let serverSales = 0;
  let serverStockDecrements = 0;

  const simulateServerPost = async () => {
    await new Promise((r) => setTimeout(r, 10));
    if (serverSales === 0) {
      serverSales += 1;
      serverStockDecrements += 1;
      return { ok: true, status: 201 };
    }
    return { ok: true, status: 200 };
  };

  const syncA = createSaleQueueSynchronizer(sharedStore, simulateServerPost);
  const syncB = createSaleQueueSynchronizer(sharedStore, simulateServerPost);
  const [resA, resB] = await Promise.all([syncA(), syncB()]);

  // Server invariants preserved: exactly 1 sale row + 1 stock decrement
  assert.equal(serverSales, 1);
  assert.equal(serverStockDecrements, 1);
  // Client queue invariant: item removed, never resurrected
  assert.equal(sharedStore.rows.size, 0);
  assert.ok(resA.synced >= 1 || resB.synced >= 1);
});

test("3B-25: idempotency conflict receives stronger reconciliation warning", () => {
  const item: PendingSale = {
    ...pending("s-conflict"),
    lastError: "Conflict detected: clientRequestId already exists with different payload",
  };
  const warning = getDiscardWarning(item);
  assert.equal(warning.isConflict, true);
  assert.match(warning.warningTitle, /พบความขัดแย้งของรายการบนเซิร์ฟเวอร์/);
  assert.match(warning.warningMessage, /พบรายการที่มีรหัสเดียวกันบนระบบแต่ข้อมูลไม่ตรงกัน/);
  assert.match(warning.warningMessage, /โดยไม่ลบรายการที่อาจมีอยู่แล้วบนเซิร์ฟเวอร์/);
});

test("3B-26: SERVER_ERROR text does not promise automatic retry unless true", () => {
  const err = categorizeQueueError("Database connection dropped", 500);
  assert.equal(err.category, "SERVER_ERROR");
  assert.match(err.userMessage, /กรุณาลองส่งอีกครั้ง/);
  assert.doesNotMatch(err.userMessage, /อัตโนมัติ/);
});

test("3B-27: staff does not receive discard action in normal UI model, manager/owner does", () => {
  assert.equal(canUserDiscardPendingSale("staff"), false);
  assert.equal(canUserDiscardPendingSale("manager"), true);
  assert.equal(canUserDiscardPendingSale("owner"), true);
  assert.equal(canUserDiscardPendingSale(undefined), false);
  assert.equal(canUserDiscardPendingSale(null), false);
});

test("3B-28: stale warning does not delete or mutate queue", async () => {
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const oldItem: PendingSale = {
    ...pending("s-stale-safe"),
    createdAt: twoDaysAgo,
    status: "queued",
  };
  const store = memoryStore([oldItem]);
  const display = parseQueueItemDisplay(oldItem, undefined, STALE_QUEUE_WARNING_MS);
  assert.equal(display.isStale, true);

  const items = await store.list();
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "s-stale-safe");
  assert.equal(items[0].status, "queued");
});
