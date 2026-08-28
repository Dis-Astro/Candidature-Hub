"use client";

import type {
  OfflineOperation,
  OfflineOperationKind,
  OfflineSyncItemResult,
  OfflineSyncResponse,
} from "./offline-types";

const DB_NAME = "candidature-hub-offline";
const DB_VERSION = 1;
const OPERATION_STORE = "operations";
const DRAFT_STORE = "drafts";
export const OFFLINE_QUEUE_EVENT = "candidature-offline-queue-change";

type DraftRecord<T = unknown> = {
  key: string;
  value: T;
  savedAt: string;
};

let flushPromise: Promise<OfflineSyncItemResult[]> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(OPERATION_STORE)) {
        database.createObjectStore(OPERATION_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(DRAFT_STORE)) {
        database.createObjectStore(DRAFT_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Archivio offline non disponibile."));
  });
}

async function transact<T>(
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const request = operation(transaction.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Operazione offline non riuscita."));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error ?? new Error("Archivio offline non disponibile."));
  });
}

function notifyQueueChanged() {
  window.dispatchEvent(new CustomEvent(OFFLINE_QUEUE_EVENT));
}

function makeId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID().replaceAll("-", "_");
  return `ipad_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function createOfflineOperation(
  kind: OfflineOperationKind,
  payload: Record<string, unknown>,
  options: Partial<Pick<OfflineOperation, "candidateId" | "baseUpdatedAt">> = {}
): OfflineOperation {
  return {
    id: makeId(),
    kind,
    payload,
    createdAt: new Date().toISOString(),
    ...options,
  };
}

export async function enqueueOfflineOperation(operation: OfflineOperation): Promise<void> {
  await transact(OPERATION_STORE, "readwrite", (store) => store.put(operation));
  notifyQueueChanged();
}

export async function listOfflineOperations(): Promise<OfflineOperation[]> {
  const items = await transact<OfflineOperation[]>(OPERATION_STORE, "readonly", (store) => store.getAll());
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getOfflineOperationCount(): Promise<number> {
  return transact<number>(OPERATION_STORE, "readonly", (store) => store.count());
}

async function removeOfflineOperation(id: string): Promise<void> {
  await transact(OPERATION_STORE, "readwrite", (store) => store.delete(id));
}

export async function discardOfflineOperations(ids: string[]): Promise<void> {
  for (const id of ids) await removeOfflineOperation(id);
  notifyQueueChanged();
}

async function sendOperations(operations: OfflineOperation[]): Promise<OfflineSyncItemResult[]> {
  const response = await fetch("/api/offline/sync", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operations }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || "Il server non ha accettato la sincronizzazione.");
  }
  const body = await response.json() as OfflineSyncResponse;
  return body.results;
}

export async function flushOfflineOperations(): Promise<OfflineSyncItemResult[]> {
  if (flushPromise) return flushPromise;
  flushPromise = (async () => {
    if (!navigator.onLine) return [];
    const pending = (await listOfflineOperations()).slice(0, 50);
    if (!pending.length) return [];
    const results = await sendOperations(pending);
    for (const result of results) {
      if (result.status === "applied" || result.status === "duplicate") {
        await removeOfflineOperation(result.operationId);
      }
    }
    notifyQueueChanged();
    return results;
  })();
  try {
    return await flushPromise;
  } finally {
    flushPromise = null;
  }
}

export async function submitOfflineOperation(operation: OfflineOperation): Promise<OfflineSyncItemResult> {
  await enqueueOfflineOperation(operation);
  if (!navigator.onLine) {
    return { operationId: operation.id, status: "error", message: "queued" };
  }
  try {
    const results = await flushOfflineOperations();
    return results.find((item) => item.operationId === operation.id)
      ?? { operationId: operation.id, status: "error", message: "queued" };
  } catch {
    return { operationId: operation.id, status: "error", message: "queued" };
  }
}

export async function saveOfflineDraft<T>(key: string, value: T): Promise<void> {
  const record: DraftRecord<T> = { key, value, savedAt: new Date().toISOString() };
  await transact(DRAFT_STORE, "readwrite", (store) => store.put(record));
}

export async function loadOfflineDraft<T>(key: string): Promise<DraftRecord<T> | null> {
  return (await transact<DraftRecord<T> | undefined>(DRAFT_STORE, "readonly", (store) => store.get(key))) ?? null;
}

export async function clearOfflineDraft(key: string): Promise<void> {
  await transact(DRAFT_STORE, "readwrite", (store) => store.delete(key));
}
