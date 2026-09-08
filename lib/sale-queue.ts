export type PendingSaleStatus = "queued" | "sending" | "needs-review";

export type PendingSale = {
  id: string;
  createdAt: string;
  status: PendingSaleStatus;
  attempts: number;
  payload: Record<string, unknown> & { clientRequestId: string };
  createdByAuthUserId?: string;
  // Retained only so sales queued by older app versions remain readable.
  expectedShiftId?: number;
  expectedPumpId?: number;
  lastError?: string;
};

export type SaleQueueStore = {
  list(): Promise<PendingSale[]>;
  put(item: PendingSale): Promise<void>;
  remove(id: string): Promise<void>;
};

export type SendResult = { ok: boolean; status: number; error?: string; errorCode?: string };

type QueueResult = { synced: number; queued: number; needsReview: number; lastError?: string };

export async function retryNeedsReview(store: SaleQueueStore) {
  const items = await store.list();
  for (const item of items) {
    if (item.status === "needs-review") {
      await store.put({ ...item, status: "queued" });
    }
  }
}

export async function repairPumpAssignments(
  store: SaleQueueStore,
  pumps: Array<{ id: number; number: string; fuelTypeId: number | null; isActive: boolean }>,
) {
  const items = await store.list();
  for (const item of items) {
    if (item.status !== "needs-review") continue;
    const fuelTypeId = Number(item.payload.fuelTypeId);
    const currentPump = pumps.find((pump) => pump.id === item.expectedPumpId);
    if (!Number.isInteger(fuelTypeId) || (currentPump?.isActive && currentPump.fuelTypeId === fuelTypeId)) continue;
    const replacement = pumps.find((pump) => pump.isActive && pump.fuelTypeId === fuelTypeId);
    if (!replacement) continue;
    await store.put({
      ...item,
      status: "queued",
      expectedPumpId: replacement.id,
      lastError: undefined,
      payload: {
        ...item.payload,
        expectedPumpId: replacement.id,
        pumpId: replacement.id,
        pumpNo: `หัวจ่าย ${replacement.number}`,
      },
    });
  }
}

async function queueResult(store: SaleQueueStore): Promise<QueueResult> {
  const remaining = await store.list();
  const lastError = remaining.find((item) => item.status === "needs-review")?.lastError;
  return {
    synced: 0,
    queued: remaining.filter((item) => item.status !== "needs-review").length,
    needsReview: remaining.filter((item) => item.status === "needs-review").length,
    ...(lastError ? { lastError } : {}),
  };
}

export function createSaleQueueSynchronizer(
  store: SaleQueueStore,
  send: (item: PendingSale) => Promise<SendResult>,
  getCurrentAuthUserId?: () => Promise<string | null>,
) {
  let tail: Promise<QueueResult> = Promise.resolve({ synced: 0, queued: 0, needsReview: 0 });
  return () => {
    const run = tail.then(async () => {
      if (!getCurrentAuthUserId) return syncPendingSales(store, send);
      const authUserId = await getCurrentAuthUserId();
      // No verified session means the queue must wait; never send as an unknown user.
      if (!authUserId) return queueResult(store);
      return syncPendingSales(store, send, authUserId);
    });
    // Keep the chain usable after a truly unexpected failure.
    tail = run.catch(async () => {
      return queueResult(store);
    });
    return run;
  };
}

export async function syncPendingSales(
  store: SaleQueueStore,
  send: (item: PendingSale) => Promise<SendResult>,
  currentAuthUserId?: string,
) {
  const items = (await store.list()).filter((item) => item.status !== "needs-review");
  let synced = 0;
  for (const item of items) {
    if (currentAuthUserId && (item.createdByAuthUserId !== currentAuthUserId || typeof item.expectedPumpId !== "number" || !Number.isInteger(item.expectedPumpId) || item.expectedPumpId <= 0)) {
      await store.put({ ...item, status: "needs-review", lastError: "รายการนี้ไม่ตรงกับบัญชีที่ล็อกอินอยู่" });
      continue;
    }
    await store.put({ ...item, status: "sending" });
    try {
      const result = await send(item);
      if (result.ok) {
        await store.remove(item.id);
        synced += 1;
      } else {
        await store.put({
          ...item,
          attempts: item.attempts + 1,
          status: result.status >= 400 && result.status < 500 ? "needs-review" : "queued",
          lastError: result.error ?? `HTTP ${result.status}`,
        });
      }
    } catch (error) {
      await store.put({
        ...item,
        attempts: item.attempts + 1,
        status: "queued",
        lastError: error instanceof Error ? error.message : "network error",
      });
    }
  }
  const remaining = await store.list();
  const lastError = remaining.find((item) => item.status === "needs-review")?.lastError;
  return {
    synced,
    queued: remaining.filter((item) => item.status !== "needs-review").length,
    needsReview: remaining.filter((item) => item.status === "needs-review").length,
    ...(lastError ? { lastError } : {}),
  };
}

const DB_NAME = "fuel-station";
const STORE_NAME = "pending-sales";

function openQueue() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("เปิดพื้นที่เก็บคิวไม่ได้"));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("บันทึกคิวไม่ได้"));
    transaction.onabort = () => reject(transaction.error ?? new Error("บันทึกคิวถูกยกเลิก"));
  });
}

export const browserSaleQueue: SaleQueueStore = {
  async list() {
    const db = await openQueue();
    try {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const done = transactionDone(transaction);
      const request = transaction.objectStore(STORE_NAME).getAll();
      const rows = await new Promise<PendingSale[]>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result as PendingSale[]);
        request.onerror = () => reject(request.error);
      });
      await done;
      return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } finally {
      db.close();
    }
  },
  async put(item) {
    const db = await openQueue();
    try {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(item);
      await transactionDone(transaction);
    } finally {
      db.close();
    }
  },
  async remove(id) {
    const db = await openQueue();
    try {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(id);
      await transactionDone(transaction);
    } finally {
      db.close();
    }
  },
};
