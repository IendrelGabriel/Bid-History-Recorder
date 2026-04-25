/**
 * Canonical bid database (automatic saves only go here).
 * IndexedDB database: "AutomaticBidRecord" · object store: "bids" · index: "timestamp"
 * Export reads the same store; nothing is exported except what was persisted here first.
 */
const DB_NAME = "AutomaticBidRecord";
const DB_VERSION = 1;
const STORE = "bids";
const DEDUPE_MS = 20000;
const NATIVE_HOST_NAME = "com.automatic_bid_record.sqlite";

async function isSqliteEnabled() {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get({ sqliteEnabled: true }, (r) => resolve(!!r.sqliteEnabled));
    } catch {
      resolve(false);
    }
  });
}

async function mirrorToSqlite(record) {
  if (!(await isSqliteEnabled())) return { ok: false, skipped: true };
  try {
    const resp = await chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, {
      type: "UPSERT_BID",
      payload: record,
    });
    return { ok: true, resp };
  } catch (e) {
    // Native host not installed / blocked: keep IndexedDB as canonical store.
    return { ok: false, error: String(e?.message || e) };
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        os.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });
}

async function saveBid(record) {
  const db = await openDb();
  const latest = await new Promise((resolve, reject) => {
    let first = null;
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).index("timestamp").openCursor(null, "prev");
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const c = req.result;
      first = c ? c.value : null;
    };
    tx.oncomplete = () => resolve(first);
  });
  if (latest && latest.jobLink === record.jobLink) {
    const a = new Date(latest.timestamp).getTime();
    const b = new Date(record.timestamp).getTime();
    if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < DEDUPE_MS) {
      db.close();
      return { id: latest.id, deduped: true };
    }
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).add(record);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve({ id: req.result, deduped: false });
    tx.oncomplete = () => db.close();
  });
}

async function listBids({ direction = "desc" } = {}) {
  const cursorDirection = direction === "asc" ? "next" : "prev";
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const idx = store.index("timestamp");
    const req = idx.openCursor(null, cursorDirection);
    const rows = [];
    req.onsuccess = () => {
      const c = req.result;
      if (c) {
        rows.push(c.value);
        c.continue();
      } else resolve(rows);
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function countBids() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).count();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result || 0);
    tx.oncomplete = () => db.close();
  });
}

async function listBidsPage({ offset = 0, limit = 50, direction = "desc" } = {}) {
  const safeOffset = Math.max(0, Number(offset) || 0);
  const safeLimit = Math.min(500, Math.max(1, Number(limit) || 50));
  const cursorDirection = direction === "asc" ? "next" : "prev";

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const idx = tx.objectStore(STORE).index("timestamp");
    const rows = [];

    let skipped = false;
    const req = idx.openCursor(null, cursorDirection);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return;

      if (!skipped && safeOffset > 0) {
        skipped = true;
        c.advance(safeOffset);
        return;
      }

      rows.push(c.value);
      if (rows.length >= safeLimit) return;
      c.continue();
    };

    tx.oncomplete = () => {
      db.close();
      resolve(rows);
    };
  });
}

async function clearAllBids() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "SAVE_BID" && msg.payload) {
    saveBid(msg.payload)
      .then(async (result) => {
        // Mirror to local SQLite if native host is installed.
        const mirror = await mirrorToSqlite({ ...msg.payload, id: result.id });
        sendResponse({ ok: true, ...result, sqlite: mirror });
      })
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }
  if (msg?.type === "LIST_BIDS") {
    listBids(msg)
      .then((rows) => sendResponse({ ok: true, rows }))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }
  if (msg?.type === "COUNT_BIDS") {
    countBids()
      .then((count) => sendResponse({ ok: true, count }))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }
  if (msg?.type === "LIST_BIDS_PAGE") {
    listBidsPage(msg)
      .then((rows) => sendResponse({ ok: true, rows }))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }
  if (msg?.type === "DELETE_BID" && msg.id != null) {
    openDb()
      .then(
        (db) =>
          new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, "readwrite");
            tx.objectStore(STORE).delete(msg.id);
            tx.onerror = () => reject(tx.error);
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
          })
      )
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }
  if (msg?.type === "CLEAR_ALL_BIDS") {
    clearAllBids()
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }
});
