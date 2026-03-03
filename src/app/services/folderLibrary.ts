/**
 * Folder Library Service
 *
 * Uses the File System Access API to let users connect a local folder
 * containing EPUB files — Kavita-style. The directory handle is persisted
 * in IndexedDB so the connection survives page reloads (the browser will
 * re-prompt for permission).
 *
 * Books are read directly from disk on demand; no duplication into IDB.
 * Reading progress is handled by the existing progress system.
 */

import { Book } from "../types/book";

// ─── Types ───────────────────────────────────────────────────────

interface FolderBookEntry {
  /** Relative path inside the connected directory (stable ID seed) */
  relativePath: string;
  title: string;
  author: string;
  /** The file handle – needed to read the EPUB later */
  fileHandle: FileSystemFileHandle;
}

// ─── IndexedDB helpers for the directory handle ──────────────────

const DB_NAME = "library-of-eden";
const DB_VERSION = 2; // bump to add the new store
const DIR_STORE = "connected_dirs";

function openFolderDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      // Preserve existing stores
      if (!db.objectStoreNames.contains("epubs")) {
        db.createObjectStore("epubs");
      }
      if (!db.objectStoreNames.contains("books")) {
        db.createObjectStore("books", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(DIR_STORE)) {
        db.createObjectStore(DIR_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Persist the directory handle so it survives reloads. */
async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openFolderDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DIR_STORE, "readwrite");
    tx.objectStore(DIR_STORE).put(handle, "connected_folder");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Load a previously saved directory handle. */
async function loadDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openFolderDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DIR_STORE, "readonly");
      const req = tx.objectStore(DIR_STORE).get("connected_folder");
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

/** Remove the saved directory handle. */
async function removeDirectoryHandle(): Promise<void> {
  try {
    const db = await openFolderDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DIR_STORE, "readwrite");
      tx.objectStore(DIR_STORE).delete("connected_folder");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

// ─── File scanning ───────────────────────────────────────────────

/** Recursively find all .epub files under the directory handle. */
async function scanForEpubs(
  dirHandle: FileSystemDirectoryHandle,
  pathPrefix = ""
): Promise<{ relativePath: string; handle: FileSystemFileHandle }[]> {
  const results: { relativePath: string; handle: FileSystemFileHandle }[] = [];

  for await (const [name, entry] of (dirHandle as any).entries()) {
    if (entry.kind === "file" && name.toLowerCase().endsWith(".epub")) {
      const relativePath = pathPrefix ? `${pathPrefix}/${name}` : name;
      results.push({ relativePath, handle: entry as FileSystemFileHandle });
    } else if (entry.kind === "directory") {
      const subPath = pathPrefix ? `${pathPrefix}/${name}` : name;
      const subResults = await scanForEpubs(entry as FileSystemDirectoryHandle, subPath);
      results.push(...subResults);
    }
  }

  return results;
}

/** Generate a stable, deterministic ID from the relative path. */
function pathToId(relativePath: string): string {
  // Simple hash to keep IDs short but stable
  let hash = 0;
  for (let i = 0; i < relativePath.length; i++) {
    const ch = relativePath.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  const hashHex = Math.abs(hash).toString(16);
  return `folder-${hashHex}-${relativePath.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40)}`;
}

/** Extract title & author from an EPUB ArrayBuffer using JSZip. */
async function extractMeta(arrayBuffer: ArrayBuffer): Promise<{ title: string; author: string }> {
  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(arrayBuffer);

    const containerFile = zip.file("META-INF/container.xml");
    if (!containerFile) return { title: "", author: "" };

    const containerXml = await containerFile.async("text");
    const parser = new DOMParser();
    const containerDoc = parser.parseFromString(containerXml, "text/xml");
    const rootfile = containerDoc.querySelector(
      'rootfile[media-type="application/oebps-package+xml"]'
    );
    const opfPath = rootfile?.getAttribute("full-path");
    if (!opfPath) return { title: "", author: "" };

    const opfFile = zip.file(opfPath);
    if (!opfFile) return { title: "", author: "" };

    const opfXml = await opfFile.async("text");
    const opfDoc = parser.parseFromString(opfXml, "text/xml");

    const title = opfDoc.querySelector("title")?.textContent?.trim() || "";
    const author = opfDoc.querySelector("creator")?.textContent?.trim() || "";

    return { title, author };
  } catch {
    return { title: "", author: "" };
  }
}

// ─── In-memory state ─────────────────────────────────────────────

let currentDirHandle: FileSystemDirectoryHandle | null = null;
let folderBooks: FolderBookEntry[] = [];
/** Map of bookId -> FileSystemFileHandle for on-demand reading */
const fileHandleMap = new Map<string, FileSystemFileHandle>();

// ─── Public API ──────────────────────────────────────────────────

/** Check whether the File System Access API is supported. */
export function isFolderAccessSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/** Whether a folder is currently connected. */
export function isConnected(): boolean {
  return currentDirHandle !== null;
}

/** Get the name of the connected folder. */
export function getFolderName(): string | null {
  return currentDirHandle?.name ?? null;
}

/**
 * Prompt the user to pick a folder, then scan it for EPUBs.
 * Returns the discovered books.
 */
export async function connectFolder(): Promise<Book[]> {
  if (!isFolderAccessSupported()) {
    throw new Error("Your browser does not support the File System Access API. Please use Chrome or Edge.");
  }

  const handle = await (window as any).showDirectoryPicker({ mode: "read" });
  currentDirHandle = handle;
  await saveDirectoryHandle(handle);
  return scanAndBuild(handle);
}

/**
 * Try to reconnect a previously saved folder.
 * Returns books if permission is granted, null if no saved handle,
 * or throws if permission is denied.
 */
export async function reconnectFolder(): Promise<Book[] | null> {
  const handle = await loadDirectoryHandle();
  if (!handle) return null;

  // Check / request permission
  const opts = { mode: "read" as const };
  let permission = await (handle as any).queryPermission(opts);
  if (permission === "prompt") {
    permission = await (handle as any).requestPermission(opts);
  }
  if (permission !== "granted") {
    return null; // User denied — we keep the handle saved for next attempt
  }

  currentDirHandle = handle;
  return scanAndBuild(handle);
}

/**
 * Check if there's a saved folder handle (without requesting permission).
 */
export async function hasSavedFolder(): Promise<boolean> {
  const handle = await loadDirectoryHandle();
  return handle !== null;
}

/**
 * Disconnect the folder — clears the saved handle and in-memory state.
 */
export async function disconnectFolder(): Promise<void> {
  currentDirHandle = null;
  folderBooks = [];
  fileHandleMap.clear();
  await removeDirectoryHandle();
}

/**
 * Re-scan the connected folder for any new/removed EPUBs.
 */
export async function rescanFolder(): Promise<Book[]> {
  if (!currentDirHandle) return [];
  return scanAndBuild(currentDirHandle);
}

/**
 * Get an ArrayBuffer for a folder-sourced book by reading it from disk.
 */
export async function getFolderBookArrayBuffer(bookId: string): Promise<ArrayBuffer | null> {
  const handle = fileHandleMap.get(bookId);
  if (!handle) return null;

  try {
    const file = await handle.getFile();
    return await file.arrayBuffer();
  } catch (err) {
    console.error("[FolderLibrary] Failed to read file:", err);
    return null;
  }
}

/**
 * Get current folder books as Book[].
 */
export function getFolderBooks(): Book[] {
  return folderBooks.map((entry) => {
    const id = pathToId(entry.relativePath);
    return {
      id,
      title: entry.title || entry.relativePath.replace(/\.epub$/i, "").split("/").pop() || "Unknown",
      author: entry.author || "Unknown Author",
      epubUrl: `folder://${entry.relativePath}`, // virtual URL — actual reading uses getFolderBookArrayBuffer
      source: "local" as const,
    };
  });
}

// ─── Internal ────────────────────────────────────────────────────

async function scanAndBuild(handle: FileSystemDirectoryHandle): Promise<Book[]> {
  const epubFiles = await scanForEpubs(handle);
  console.log(`[FolderLibrary] Found ${epubFiles.length} EPUB(s) in "${handle.name}"`);

  folderBooks = [];
  fileHandleMap.clear();

  // Process files — extract metadata in parallel (batched to avoid overwhelming)
  const BATCH_SIZE = 5;
  for (let i = 0; i < epubFiles.length; i += BATCH_SIZE) {
    const batch = epubFiles.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async ({ relativePath, handle: fh }) => {
        const id = pathToId(relativePath);
        fileHandleMap.set(id, fh);

        let title = "";
        let author = "";
        try {
          const file = await fh.getFile();
          const buf = await file.arrayBuffer();
          const meta = await extractMeta(buf);
          title = meta.title;
          author = meta.author;
        } catch (err) {
          console.warn(`[FolderLibrary] Could not read metadata for ${relativePath}:`, err);
        }

        folderBooks.push({
          relativePath,
          title: title || relativePath.replace(/\.epub$/i, "").split("/").pop() || "Unknown",
          author: author || "Unknown Author",
          fileHandle: fh,
        });
      })
    );
  }

  return getFolderBooks();
}
