const DB_NAME = "scan-book-app", STORES = ["edits", "drafts", "handles", "settings"];
let dbPromise = null;

function db() {
  dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode), s = t.objectStore(store);
    const req = fn(s);
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
  });
}

export const idb = {
  get: (store, key) => tx(store, "readonly", s => s.get(key)),
  put: (store, key, value) => tx(store, "readwrite", s => s.put(value, key)),
  del: (store, key) => tx(store, "readwrite", s => s.delete(key)),
  keys: store => tx(store, "readonly", s => s.getAllKeys()),
};

export const settings = {
  get: key => idb.get("settings", key),
  set: (key, value) => idb.put("settings", key, value),
  async update(key, change) {
    const database = await db();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("settings", "readwrite");
      const store = transaction.objectStore("settings");
      const request = store.get(key);
      request.onsuccess = () => {
        try { store.put(change(request.result), key); }
        catch (error) { transaction.abort(); reject(error); }
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("The settings update was interrupted."));
    });
  },
};
