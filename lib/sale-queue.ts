export type PendingSaleStatus = "queued" | "sending" | "needs-review";

export type PendingSale = {
  id: string;
  createdAt: string;
  status: PendingSaleStatus;
  attempts: number;
  payload: Record<string, unknown> & { clientRequestId: string };
  lastError?: string;
};

export type SaleQueueStore = {
  list(): Promise<PendingSale[]>;
  put(item: PendingSale): Promise<void>;
  remove(id: string): Promise<void>;
};

type SendResult = { ok: boolean; status: number; error?: string };

export function createSaleQueueSynchronizer(
  store: SaleQueueStore,
  send: (item: PendingSale) => Promise<SendResult>,
) {
  let tail = Promise.resolve({ synced: 0, queued: 0, needsReview: 0 });
  return () => {
    const run = tail.then(() => syncPendingSales(store, send));
    // Keep the chain usable after a truly unexpected failure.
    tail = run.catch(async () => {
      const remaining = await store.list();
      return {
        synced: 0,
        queued: remaining.filter((item) => item.status !== "needs-review").length,
        needsReview: remaining.filter((item) => item.status === "needs-review").length,
      };
    });
    return run;
  };
}

export async function syncPendingSales(
  store: SaleQueueStore,
  send: (item: PendingSale) => Promise<SendResult>,
) {
  const items = (await store.list()).filter((item) => item.status !== "needs-review");
  let synced = 0;
  for (const item of items) {
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
  return {
    synced,
    queued: remaining.filter((item) => item.status !== "needs-review").length,
    needsReview: remaining.filter((item) => item.status === "needs-review").length,
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
