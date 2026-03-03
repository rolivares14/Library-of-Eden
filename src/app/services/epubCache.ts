import { parseEpubMetadata } from "./epubParser";
import { Book } from "../types/book";

// In-memory cache for EPUB metadata
const metadataCache = new Map<string, { coverUrl?: string }>();

/**
 * Preloads EPUB metadata for all books and caches cover URLs.
 * Now passes bookId so the parser can check IndexedDB first.
 */
export async function preloadBookCovers(books: Book[]): Promise<void> {
  const promises = books.map(async (book) => {
    // Skip if already cached
    if (metadataCache.has(book.id)) return;

    try {
      const metadata = await parseEpubMetadata(book.epubUrl, book.id);
      if (metadata?.coverImageUrl) {
        metadataCache.set(book.id, { coverUrl: metadata.coverImageUrl });
      }
    } catch (error) {
      // Silently ignore - EPUB files may not be available yet
    }
  });

  await Promise.all(promises);
}

/**
 * Gets cached cover URL for a book
 */
export function getCachedCover(bookId: string): string | undefined {
  return metadataCache.get(bookId)?.coverUrl;
}
