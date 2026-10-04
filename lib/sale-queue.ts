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
  source?: "quick";
};

export type SaleQueueStore = {
  list(): Promise<PendingSale[]>;
  put(item: PendingSale): Promise<void>;
  remove(id: string): Promise<void>;
  updateIfExists?(id: string, updater: (current: PendingSale) => PendingSale): Promise<boolean>;
};

export async function updateItemIfExists(
  store: SaleQueueStore,
  id: string,
  updater: (current: PendingSale) => PendingSale,
): Promise<boolean> {
  if (store.updateIfExists) {
    return store.updateIfExists(id, updater);
  }
  const items = await store.list();
  const current = items.find((i) => i.id === id);
  if (!current) return false;
  await store.put(updater(current));
  return true;
}

export type SendResult = { ok: boolean; status: number; error?: string; errorCode?: string };

type QueueResult = { synced: number; queued: number; needsReview: number; lastError?: string };

export function getQueueCounts(items: PendingSale[]) {
  return {
    queued: items.filter((i) => i.status === "queued").length,
    sending: items.filter((i) => i.status === "sending").length,
    needsReview: items.filter((i) => i.status === "needs-review").length,
    total: items.length,
  };
}

export async function retryNeedsReview(store: SaleQueueStore, id?: string) {
  const items = await store.list();
  for (const item of items) {
    if (item.status === "needs-review" && (!id || item.id === id)) {
      await updateItemIfExists(store, item.id, (current) => ({ ...current, status: "queued" }));
    }
  }
}

export async function discardQueueItem(store: SaleQueueStore, id: string): Promise<boolean> {
  const items = await store.list();
  const exists = items.some((item) => item.id === id);
  if (!exists) return false;
  await store.remove(id);
  return true;
}

export type QueueErrorCategory =
  | "NETWORK"
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "INVALID_DATA"
  | "IDEMPOTENCY_CONFLICT"
  | "SERVER_ERROR"
  | "OWNERSHIP_MISMATCH"
  | "UNKNOWN";

export function categorizeQueueError(error?: string, status?: number): {
  category: QueueErrorCategory;
  userMessage: string;
} {
  const msg = (error || "").toLowerCase();

  if (status === 401 || msg.includes("เข้าสู่ระบบ") || msg.includes("unauthorized") || msg.includes("jwt") || msg.includes("session")) {
    return {
      category: "AUTH_REQUIRED",
      userMessage: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบแล้วกดส่งอีกครั้ง",
    };
  }

  if (status === 403 || msg.includes("ไม่มีสิทธิ์") || msg.includes("forbidden") || msg.includes("permission")) {
    return {
      category: "FORBIDDEN",
      userMessage: "ไม่มีสิทธิ์ทำรายการ กรุณาให้ผู้จัดการหรือเจ้าของตรวจสอบสิทธิ์",
    };
  }

  if (msg.includes("ไม่ตรงกับบัญชีที่ล็อกอินอยู่") || msg.includes("ownership")) {
    return {
      category: "OWNERSHIP_MISMATCH",
      userMessage: "รายการนี้ถูกบันทึกโดยผู้ใช้อื่น กรุณาเข้าสู่ระบบด้วยบัญชีเดิมเพื่อส่ง หรือให้ผู้จัดการตรวจสอบ",
    };
  }

  if (status === 409 || msg.includes("ขัดแย้ง") || msg.includes("conflict")) {
    return {
      category: "IDEMPOTENCY_CONFLICT",
      userMessage: "พบความขัดแย้งของรายการในระบบ กรุณาให้ผู้จัดการตรวจสอบ",
    };
  }

  if ((status && status >= 400 && status < 500) || msg.includes("invalid") || msg.includes("ไม่ถูกต้อง") || msg.includes("กรุณาระบุ")) {
    return {
      category: "INVALID_DATA",
      userMessage: error || "ข้อมูลรายการขายไม่ถูกต้อง ต้องตรวจสอบก่อนส่งใหม่",
    };
  }

  if (status && status >= 500) {
    return {
      category: "SERVER_ERROR",
      userMessage: "เซิร์ฟเวอร์ขัดข้องชั่วคราว รายการยังถูกเก็บไว้ในเครื่อง กรุณาลองส่งอีกครั้ง",
    };
  }

  if (
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("offline") ||
    msg.includes("abort") ||
    msg.includes("timeout") ||
    msg.includes("econnrefused") ||
    msg.includes("net::")
  ) {
    return {
      category: "NETWORK",
      userMessage: "ยังไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ รายการนี้ถูกเก็บไว้อย่างปลอดภัยในเครื่อง",
    };
  }

  if (!error && !status) {
    return {
      category: "UNKNOWN",
      userMessage: "รอการตรวจสอบ",
    };
  }

  return {
    category: "UNKNOWN",
    userMessage: error || "เกิดข้อผิดพลาดในการส่ง กรุณาตรวจสอบหรือลองใหม่",
  };
}

export const STALE_QUEUE_WARNING_MS = 24 * 60 * 60 * 1000;

export function canUserDiscardPendingSale(userRole?: string | null): boolean {
  return userRole === "owner" || userRole === "manager";
}

export function getDiscardWarning(item: PendingSale): {
  warningTitle: string;
  warningMessage: string;
  isConflict: boolean;
} {
  const errorCategory = item.lastError ? categorizeQueueError(item.lastError).category : "UNKNOWN";
  const isConflict = errorCategory === "IDEMPOTENCY_CONFLICT";

  if (isConflict) {
    return {
      warningTitle: "คำเตือน: พบความขัดแย้งของรายการบนเซิร์ฟเวอร์",
      warningMessage:
        "พบรายการที่มีรหัสเดียวกันบนระบบแต่ข้อมูลไม่ตรงกัน กรุณาให้ผู้จัดการตรวจสอบรายการบนเซิร์ฟเวอร์ก่อนลบรายการค้าง หากลบ รายการค้างในเครื่องนี้จะถูกนำออกและจะไม่ถูกส่งซ้ำอัตโนมัติ โดยไม่ลบรายการที่อาจมีอยู่แล้วบนเซิร์ฟเวอร์",
      isConflict: true,
    };
  }

  return {
    warningTitle: "ยืนยันการนำรายการค้างออกจากเครื่อง",
    warningMessage:
      "รายการนี้ยังไม่ได้รับการยืนยันสถานะจากเซิร์ฟเวอร์ หากลบ รายการค้างในเครื่องนี้จะถูกนำออกและจะไม่ถูกส่งซ้ำอัตโนมัติ กรุณาตรวจสอบว่ารายการไม่ได้ถูกบันทึกในระบบแล้วก่อนดำเนินการ (การลบนี้จะไม่มีผลต่อรายการขายใดๆ บนเซิร์ฟเวอร์)",
    isConflict: false,
  };
}

export type ParsedQueueItem = {
  id: string;
  shortId: string;
  createdAt: string;
  formattedTime: string;
  fuelTypeName: string;
  totalAmount: number;
  liters?: number;
  paymentMethod: string;
  customerName?: string;
  status: PendingSaleStatus;
  statusLabel: string;
  attempts: number;
  rawError?: string;
  friendlyError?: string;
  errorCategory?: QueueErrorCategory;
  isStale: boolean;
  isCorrupted: boolean;
};

export function parseQueueItemDisplay(
  item: PendingSale,
  fuelTypes?: Array<{ id: number; label: string }>,
  staleThresholdMs: number = STALE_QUEUE_WARNING_MS
): ParsedQueueItem {
  const shortId = item.id ? item.id.slice(-6) : "unknown";
  const payload: Record<string, unknown> = (item.payload && typeof item.payload === "object") ? item.payload : {};

  const isCorrupted = !item.id || !item.payload || typeof item.payload !== "object";

  const rawAmount = payload.totalAmount;
  const totalAmount = typeof rawAmount === "number" ? rawAmount : Number(rawAmount) || 0;

  const fuelTypeId = Number(payload.fuelTypeId);
  const matchedFuel = fuelTypes?.find((f) => f.id === fuelTypeId);
  const fuelTypeName = matchedFuel ? matchedFuel.label : (fuelTypeId ? `น้ำมัน #${fuelTypeId}` : "น้ำมัน");

  const pricePerLiter = Number(payload.pricePerLiter) || 0;
  const liters = pricePerLiter > 0 && totalAmount > 0 ? Number((totalAmount / pricePerLiter).toFixed(2)) : undefined;

  const paymentMethodMap: Record<string, string> = {
    cash: "เงินสด",
    transfer: "เงินโอน",
    credit: "เครดิต",
  };
  const rawPayment = String(payload.paymentMethod || "cash");
  const paymentMethod = paymentMethodMap[rawPayment] || rawPayment;

  const statusLabelMap: Record<PendingSaleStatus, string> = {
    queued: "รอส่ง",
    sending: "กำลังส่ง",
    "needs-review": "ต้องตรวจสอบ",
  };
  const statusLabel = statusLabelMap[item.status] || item.status;

  const errorInfo = item.lastError ? categorizeQueueError(item.lastError) : undefined;

  let isStale = false;
  let formattedTime = "";
  if (item.createdAt) {
    try {
      const createdDate = new Date(item.createdAt);
      if (!isNaN(createdDate.getTime())) {
        isStale = Date.now() - createdDate.getTime() > staleThresholdMs;
        formattedTime = createdDate.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
      }
    } catch {
      // ignore date parse errors
    }
  }

  return {
    id: item.id,
    shortId,
    createdAt: item.createdAt,
    formattedTime,
    fuelTypeName,
    totalAmount,
    liters,
    paymentMethod,
    customerName: typeof payload.customerName === "string" && payload.customerName.trim() ? payload.customerName.trim() : undefined,
    status: item.status,
    statusLabel,
    attempts: item.attempts || 0,
    rawError: item.lastError,
    friendlyError: errorInfo?.userMessage,
    errorCategory: errorInfo?.category,
    isStale,
    isCorrupted,
  };
}

export async function removeQuickSalePumpAssignments(store: SaleQueueStore) {
  const items = await store.list();
  for (const item of items) {
    const isLegacyPumpMismatch = item.status === "needs-review"
      && item.payload.totalAmount !== undefined
      && typeof item.payload.pumpId === "number"
      && item.lastError?.includes("ชนิดน้ำมันไม่ตรงกับหัวจ่าย");
    if (item.source !== "quick" && !isLegacyPumpMismatch) continue;
    const { pumpId: _pumpId, expectedPumpId: _expectedPumpId, pumpNo: _pumpNo, ...payload } = item.payload;
    void _pumpId;
    void _expectedPumpId;
    void _pumpNo;
    await updateItemIfExists(store, item.id, (current) => ({ ...current, expectedPumpId: undefined, payload }));
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
      try {
        return await queueResult(store);
      } catch {
        return { synced: 0, queued: 0, needsReview: 0 };
      }
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
    if (currentAuthUserId && item.createdByAuthUserId !== currentAuthUserId) {
      await updateItemIfExists(store, item.id, (current) => ({ ...current, status: "needs-review", lastError: "รายการนี้ไม่ตรงกับบัญชีที่ล็อกอินอยู่" }));
      continue;
    }
    const claimed = await updateItemIfExists(store, item.id, (current) => ({ ...current, status: "sending" }));
    if (!claimed) continue; // Item already removed by another tab/session

    try {
      const result = await send(item);
      if (result.ok) {
        await store.remove(item.id);
        synced += 1;
      } else {
        await updateItemIfExists(store, item.id, (current) => ({
          ...current,
          attempts: current.attempts + 1,
          status: result.status >= 400 && result.status < 500 ? "needs-review" : "queued",
          lastError: result.error ?? `HTTP ${result.status}`,
        }));
      }
    } catch (error) {
      await updateItemIfExists(store, item.id, (current) => ({
        ...current,
        attempts: current.attempts + 1,
        status: "queued",
        lastError: error instanceof Error ? error.message : "network error",
      }));
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
  async updateIfExists(id, updater) {
    const db = await openQueue();
    try {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const objectStore = transaction.objectStore(STORE_NAME);
      const getReq = objectStore.get(id);
      let updated = false;
      getReq.onsuccess = () => {
        const current = getReq.result as PendingSale | undefined;
        if (current) {
          objectStore.put(updater(current));
          updated = true;
        }
      };
      await transactionDone(transaction);
      return updated;
    } finally {
      db.close();
    }
  },
};
