type CacheRecord = {
  key: string;
  value: unknown;
  updatedAt: number;
};

type QueueRecord = {
  id?: number;
  createdAt: number;
  method: string;
  url: string;
  body: unknown;
  credentials?: RequestCredentials;
  headers?: Record<string, string>;
};

type ShadowCreateRecord = {
  key: string;
  value: unknown;
  createdAt: number;
};

type ShadowPatchRecord = {
  key: string;
  patch: unknown;
  createdAt: number;
};

const DB_NAME = "fms_timetrack_offline";
const DB_VERSION = 1;

const STORE_CACHE = "cache";
const STORE_QUEUE = "queue";
const STORE_SHADOW_CREATES = "shadow_creates";
const STORE_SHADOW_PATCHES = "shadow_patches";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        db.createObjectStore(STORE_QUEUE, { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORE_SHADOW_CREATES)) {
        db.createObjectStore(STORE_SHADOW_CREATES, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_SHADOW_PATCHES)) {
        db.createObjectStore(STORE_SHADOW_PATCHES, { keyPath: "key" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const req = fn(store);

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);

    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      reject(tx.error);
      db.close();
    };
  });
}

async function withAll<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return withStore(storeName, mode, fn);
}

export async function cacheSet(key: string, value: unknown) {
  const rec: CacheRecord = { key, value, updatedAt: Date.now() };
  await withAll(STORE_CACHE, "readwrite", (s) => s.put(rec));
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const rec = await withAll<CacheRecord | undefined>(STORE_CACHE, "readonly", (s) => s.get(key));
  return (rec?.value as T) ?? null;
}

export async function queueEnqueue(item: Omit<QueueRecord, "id">) {
  await withAll(STORE_QUEUE, "readwrite", (s) => s.add(item));
}

export async function queueList(): Promise<QueueRecord[]> {
  return (await withAll<QueueRecord[]>(STORE_QUEUE, "readonly", (s) => s.getAll())) ?? [];
}

export async function queueDelete(id: number) {
  await withAll(STORE_QUEUE, "readwrite", (s) => s.delete(id));
}

export async function shadowCreatePut(key: string, value: unknown) {
  const rec: ShadowCreateRecord = { key, value, createdAt: Date.now() };
  await withAll(STORE_SHADOW_CREATES, "readwrite", (s) => s.put(rec));
}

export async function shadowCreateList(prefix: string): Promise<ShadowCreateRecord[]> {
  const all = (await withAll<ShadowCreateRecord[]>(STORE_SHADOW_CREATES, "readonly", (s) => s.getAll())) ?? [];
  return all.filter((r) => r.key.startsWith(prefix));
}

export async function shadowCreateDelete(key: string) {
  await withAll(STORE_SHADOW_CREATES, "readwrite", (s) => s.delete(key));
}

export async function shadowPatchPut(key: string, patch: unknown) {
  const rec: ShadowPatchRecord = { key, patch, createdAt: Date.now() };
  await withAll(STORE_SHADOW_PATCHES, "readwrite", (s) => s.put(rec));
}

export async function shadowPatchGet<T>(key: string): Promise<T | null> {
  const rec = await withAll<ShadowPatchRecord | undefined>(STORE_SHADOW_PATCHES, "readonly", (s) => s.get(key));
  return (rec?.patch as T) ?? null;
}

export async function shadowPatchDelete(key: string) {
  await withAll(STORE_SHADOW_PATCHES, "readwrite", (s) => s.delete(key));
}

export function isOfflineError(err: unknown) {
  return err instanceof TypeError;
}
