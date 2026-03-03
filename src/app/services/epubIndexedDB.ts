/**
 * IndexedDB caching layer for EPUB files.
 *
 * Stores both EPUB binary data (ArrayBuffer) and book metadata so that:
 *  - Books persist across page refreshes without needing a server
 *  - Subsequent reads load instantly from local storage (zero bandwidth)
 *  - Metadata parsing only needs to happen once per book
 */

const DB_NAME = "library-of-eden";
const DB_VERSION = 2;

// Object store names
const EPUB_STORE = "epubs"; // bookId -> ArrayBuffer
const BOOK_STORE = "books"; // bookId -> { id, title, author, epubUrl, cachedAt }
const DIR_STORE = "connected_dirs"; // folder handle persistence

/**
 * Opens (or creates) the IndexedDB database.
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(EPUB_STORE)) {
        db.createObjectStore(EPUB_STORE); // key = bookId
      }
      if (!db.objectStoreNames.contains(BOOK_STORE)) {
        db.createObjectStore(BOOK_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(DIR_STORE)) {
        db.createObjectStore(DIR_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.error("IndexedDB open error:", request.error);
      reject(request.error);
    };
  });
}

// ─── EPUB ArrayBuffer Storage ───────────────────────────────────

/**
 * Stores an EPUB ArrayBuffer in IndexedDB.
 */
export async function cacheEpub(bookId: string, data: ArrayBuffer): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(EPUB_STORE, "readwrite");
      tx.objectStore(EPUB_STORE).put(data, bookId);
      tx.oncomplete = () => {
        console.log(`[IndexedDB] Cached EPUB for "${bookId}" (${(data.byteLength / 1024 / 1024).toFixed(2)} MB)`);
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error("[IndexedDB] Failed to cache EPUB:", err);
  }
}

/**
 * Retrieves a cached EPUB ArrayBuffer from IndexedDB.
 * Returns null if not found.
 */
export async function getCachedEpub(bookId: string): Promise<ArrayBuffer | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(EPUB_STORE, "readonly");
      const req = tx.objectStore(EPUB_STORE).get(bookId);
      req.onsuccess = () => {
        if (req.result) {
          console.log(`[IndexedDB] Cache HIT for "${bookId}"`);
          resolve(req.result as ArrayBuffer);
        } else {
          console.log(`[IndexedDB] Cache MISS for "${bookId}"`);
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error("[IndexedDB] Failed to get cached EPUB:", err);
    return null;
  }
}

/**
 * Removes a cached EPUB from IndexedDB.
 */
export async function removeCachedEpub(bookId: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(EPUB_STORE, "readwrite");
      tx.objectStore(EPUB_STORE).delete(bookId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error("[IndexedDB] Failed to remove cached EPUB:", err);
  }
}

// ─── Book Metadata Storage ───────────────────────────────────────

export interface CachedBookMeta {
  id: string;
  title: string;
  author: string;
  epubUrl: string; // original URL (blob: or remote)
  ownerId: string; // user ID or "anonymous"
  cachedAt: string; // ISO timestamp
}

/**
 * Saves book metadata to IndexedDB so the library persists across refreshes.
 */
export async function saveBookMeta(book: CachedBookMeta): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BOOK_STORE, "readwrite");
      tx.objectStore(BOOK_STORE).put(book);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error("[IndexedDB] Failed to save book meta:", err);
  }
}

/**
 * Loads all saved book metadata from IndexedDB.
 */
export async function loadAllBookMetas(): Promise<CachedBookMeta[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BOOK_STORE, "readonly");
      const req = tx.objectStore(BOOK_STORE).getAll();
      req.onsuccess = () => {
        const results = (req.result as CachedBookMeta[]) || [];
        console.log(`[IndexedDB] Loaded ${results.length} book(s) from cache`);
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error("[IndexedDB] Failed to load book metas:", err);
    return [];
  }
}

/**
 * Loads book metadata from IndexedDB filtered by owner.
 */
export async function loadBookMetasByOwner(ownerId: string): Promise<CachedBookMeta[]> {
  const all = await loadAllBookMetas();
  const filtered = all.filter((m) => m.ownerId === ownerId);
  console.log(`[IndexedDB] Filtered to ${filtered.length} book(s) for owner "${ownerId}"`);
  return filtered;
}

/**
 * Removes book metadata from IndexedDB.
 */
export async function removeBookMeta(bookId: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BOOK_STORE, "readwrite");
      tx.objectStore(BOOK_STORE).delete(bookId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error("[IndexedDB] Failed to remove book meta:", err);
  }
}

/**
 * Gets an estimate of how much storage is being used.
 */
export async function getStorageEstimate(): Promise<{ used: string; quota: string } | null> {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      const usedMB = ((estimate.usage || 0) / 1024 / 1024).toFixed(1);
      const quotaMB = ((estimate.quota || 0) / 1024 / 1024).toFixed(0);
      return { used: `${usedMB} MB`, quota: `${quotaMB} MB` };
    }
    return null;
  } catch {
    return null;
  }
}