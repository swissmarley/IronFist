/**
 * Persistent save data via IndexedDB with an in-memory fallback (tests, private
 * mode). Stores small JSON documents under string keys.
 */
const DB_NAME = 'ironfist';
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memory = new Map<string, unknown>();

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbPromise;
}

export async function loadKey<T>(key: string, fallback: T): Promise<T> {
  if (memory.has(key)) return memory.get(key) as T;
  const db = await openDb();
  if (!db) return fallback;
  return new Promise<T>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => { const v = req.result as T | undefined; if (v !== undefined) memory.set(key, v); resolve(v === undefined ? fallback : v); };
      req.onerror = () => resolve(fallback);
    } catch { resolve(fallback); }
  });
}

export async function saveKey<T>(key: string, value: T): Promise<void> {
  memory.set(key, value);
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch { resolve(); }
  });
}

export async function listKeys(prefix: string): Promise<string[]> {
  const db = await openDb();
  const mem = [...memory.keys()].filter((k) => k.startsWith(prefix));
  if (!db) return mem;
  return new Promise<string[]>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAllKeys();
      req.onsuccess = () => resolve([...new Set([...mem, ...(req.result as string[]).filter((k) => k.startsWith(prefix))])]);
      req.onerror = () => resolve(mem);
    } catch { resolve(mem); }
  });
}

export async function deleteKey(key: string): Promise<void> {
  memory.delete(key);
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch { resolve(); }
  });
}
