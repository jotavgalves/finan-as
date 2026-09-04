const DB_NAME = 'fluxo-offline';
const DB_VERSION = 1;

type QueuedWrite = { id: string; createdAt: number; method: string; path: string; body?: unknown };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache');
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function cacheSet(key: string, value: unknown) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('cache', 'readwrite');
    tx.objectStore('cache').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('cache').objectStore('cache').get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function queueWrite(input: Omit<QueuedWrite, 'id' | 'createdAt'>) {
  const db = await openDb();
  const item: QueuedWrite = { id: crypto.randomUUID(), createdAt: Date.now(), ...input };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('outbox', 'readwrite');
    tx.objectStore('outbox').add(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return item;
}

export async function getOutboxCount() {
  const db = await openDb();
  return new Promise<number>((resolve, reject) => {
    const req = db.transaction('outbox').objectStore('outbox').count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function flushOutbox() {
  const db = await openDb();
  const items = await new Promise<QueuedWrite[]>((resolve, reject) => {
    const req = db.transaction('outbox').objectStore('outbox').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  for (const item of items.sort((a, b) => a.createdAt - b.createdAt)) {
    const res = await fetch(item.path, {
      method: item.method,
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: item.body ? JSON.stringify(item.body) : undefined
    });
    if (!res.ok) break;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('outbox', 'readwrite');
      tx.objectStore('outbox').delete(item.id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
