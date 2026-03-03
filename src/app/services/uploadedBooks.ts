import { Book } from "../types/book";
import {
  cacheEpub,
  saveBookMeta,
  loadBookMetasByOwner,
  getCachedEpub,
  removeBookMeta,
  removeCachedEpub,
} from "./epubIndexedDB";

// In-memory list of books for the current owner
let uploadedBooks: Book[] = [];
let currentOwnerId: string | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Initializes the book list from IndexedDB for a specific owner.
 * Re-runs when the owner changes (sign in / sign out).
 */
export async function initBooks(ownerId: string): Promise<void> {
  // If same owner already loaded, skip
  if (currentOwnerId === ownerId && uploadedBooks.length >= 0 && initPromise === null) {
    // Already initialized for this owner — but let's still return if in progress
  }

  // If owner changed, reset
  if (currentOwnerId !== ownerId) {
    currentOwnerId = ownerId;
    uploadedBooks = [];
    initPromise = null;
  }

  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const metas = await loadBookMetasByOwner(ownerId);
      uploadedBooks = metas.map((m) => ({
        id: m.id,
        title: m.title,
        author: m.author,
        epubUrl: m.epubUrl,
      }));
      console.log(`Loaded ${uploadedBooks.length} book(s) from IndexedDB for owner "${ownerId}"`);
    } catch (err) {
      console.error("Failed to load books from IndexedDB:", err);
    }
    initPromise = null;
  })();

  return initPromise;
}

/**
 * Forces a re-initialization for a new owner (e.g. on sign in/out).
 */
export async function reinitBooks(ownerId: string): Promise<void> {
  currentOwnerId = null;
  initPromise = null;
  uploadedBooks = [];
  await initBooks(ownerId);
}

/**
 * Adds an uploaded EPUB file to the library.
 * Stores the ArrayBuffer in IndexedDB tagged with the owner.
 */
export async function addUploadedBook(file: File, ownerId: string): Promise<Book | null> {
  try {
    console.log("Starting upload for:", file.name, "owner:", ownerId);

    const arrayBuffer = await file.arrayBuffer();
    console.log("Read file:", (arrayBuffer.byteLength / 1024 / 1024).toFixed(2), "MB");

    const title = await extractTitleFromBuffer(arrayBuffer);
    const author = await extractAuthorFromBuffer(arrayBuffer);

    console.log("Extracted metadata - Title:", title, "Author:", author);

    const bookId = `uploaded-${Date.now()}-${file.name.replace(/\.epub$/i, "")}`;

    const blob = new Blob([arrayBuffer], { type: "application/epub+zip" });
    const blobUrl = URL.createObjectURL(blob);

    const book: Book = {
      id: bookId,
      title: title || file.name.replace(/\.epub$/i, ""),
      author: author || "Unknown Author",
      epubUrl: blobUrl,
    };

    // Store in IndexedDB tagged with owner
    await cacheEpub(bookId, arrayBuffer);
    await saveBookMeta({
      id: bookId,
      title: book.title,
      author: book.author,
      epubUrl: blobUrl,
      ownerId,
      cachedAt: new Date().toISOString(),
    });

    uploadedBooks.push(book);
    console.log("Book added and cached successfully:", book.title, "for owner:", ownerId);
    return book;
  } catch (error) {
    console.error("Error adding uploaded book:", error);
    return null;
  }
}

/**
 * Gets all uploaded books for the current owner (in-memory list).
 * Call initBooks(ownerId) first to populate from IndexedDB.
 */
export function getUploadedBooks(): Book[] {
  return uploadedBooks;
}

/**
 * Removes a book from the library and IndexedDB.
 */
export async function removeUploadedBook(bookId: string): Promise<void> {
  uploadedBooks = uploadedBooks.filter((b) => b.id !== bookId);
  await removeBookMeta(bookId);
  await removeCachedEpub(bookId);
  console.log("Book removed:", bookId);
}

/**
 * Gets the EPUB ArrayBuffer for a book.
 * Checks IndexedDB cache first, falls back to fetching the URL.
 */
export async function getEpubArrayBuffer(bookId: string): Promise<ArrayBuffer | null> {
  const cached = await getCachedEpub(bookId);
  if (cached) return cached;

  const book = uploadedBooks.find((b) => b.id === bookId);
  if (!book?.epubUrl) return null;

  try {
    console.log("Cache miss — fetching from URL:", book.epubUrl);
    const response = await fetch(book.epubUrl);
    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength === 0) return null;

    await cacheEpub(bookId, arrayBuffer);
    return arrayBuffer;
  } catch (err) {
    console.error("Failed to fetch EPUB:", err);
    return null;
  }
}

// ─── Internal helpers ────────────────────────────────────────────

async function extractTitleFromBuffer(arrayBuffer: ArrayBuffer): Promise<string | null> {
  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(arrayBuffer);

    const containerFile = zip.file("META-INF/container.xml");
    if (!containerFile) return null;

    const containerXml = await containerFile.async("text");
    const parser = new DOMParser();
    const containerDoc = parser.parseFromString(containerXml, "text/xml");
    const rootfile = containerDoc.querySelector(
      'rootfile[media-type="application/oebps-package+xml"]'
    );
    const opfPath = rootfile?.getAttribute("full-path");
    if (!opfPath) return null;

    const opfFile = zip.file(opfPath);
    if (!opfFile) return null;

    const opfXml = await opfFile.async("text");
    const opfDoc = parser.parseFromString(opfXml, "text/xml");
    const titleNode = opfDoc.querySelector("title");
    return titleNode?.textContent?.trim() || null;
  } catch {
    return null;
  }
}

async function extractAuthorFromBuffer(arrayBuffer: ArrayBuffer): Promise<string | null> {
  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(arrayBuffer);

    const containerFile = zip.file("META-INF/container.xml");
    if (!containerFile) return null;

    const containerXml = await containerFile.async("text");
    const parser = new DOMParser();
    const containerDoc = parser.parseFromString(containerXml, "text/xml");
    const rootfile = containerDoc.querySelector(
      'rootfile[media-type="application/oebps-package+xml"]'
    );
    const opfPath = rootfile?.getAttribute("full-path");
    if (!opfPath) return null;

    const opfFile = zip.file(opfPath);
    if (!opfFile) return null;

    const opfXml = await opfFile.async("text");
    const opfDoc = parser.parseFromString(opfXml, "text/xml");
    const creatorNode = opfDoc.querySelector("creator");
    return creatorNode?.textContent?.trim() || null;
  } catch {
    return null;
  }
}
