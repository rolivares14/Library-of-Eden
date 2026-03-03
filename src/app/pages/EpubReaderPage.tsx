import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { getUploadedBooks, getEpubArrayBuffer, initBooks } from "../services/uploadedBooks";
import { fetchLibraryBooks, getLibraryBookUrl } from "../services/libraryApi";
import { cacheEpub, getCachedEpub } from "../services/epubIndexedDB";
import { getFolderBooks, getFolderBookArrayBuffer } from "../services/folderLibrary";
import { useAuth } from "../contexts/AuthContext";
import { Book } from "../types/book";
import { EpubReaderCore } from "../components/reader/EpubReaderCore";
import { BookOpen, Loader2 } from "lucide-react";

export function EpubReaderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading, session } = useAuth();
  const ownerId = user?.id || "anonymous";

  const [book, setBook] = useState<Book | undefined>(undefined);
  const [arrayBuffer, setArrayBuffer] = useState<ArrayBuffer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Find the book metadata
  useEffect(() => {
    if (authLoading) return;

    async function findBook() {
      // Try local uploads first
      await initBooks(ownerId);
      const localFound = getUploadedBooks().find((b) => b.id === id);
      if (localFound) {
        setBook({ ...localFound, source: "local" });
        return;
      }

      // Try folder books
      const folderFound = getFolderBooks().find((b) => b.id === id);
      if (folderFound) {
        setBook({ ...folderFound, source: "local" });
        return;
      }

      // Try library books
      const libBooks = await fetchLibraryBooks();
      const libFound = libBooks.find((b) => b.id === id);
      if (libFound) {
        setBook(libFound);
        return;
      }

      setError("Book not found");
      setIsLoading(false);
    }

    findBook();
  }, [id, ownerId, authLoading]);

  // Load the EPUB data once we have the book
  useEffect(() => {
    if (!book) return;
    let cancelled = false;

    async function loadData() {
      try {
        setIsLoading(true);
        let buffer: ArrayBuffer | null = null;

        if (book!.source === "library") {
          // Check IndexedDB cache first
          buffer = await getCachedEpub(book!.id);

          if (!buffer) {
            const url = await getLibraryBookUrl(book!.id);
            if (!url) throw new Error("Failed to get download URL for library book");

            const res = await fetch(url);
            if (!res.ok) throw new Error("Failed to download library EPUB");

            buffer = await res.arrayBuffer();
            if (!buffer || buffer.byteLength === 0) throw new Error("Downloaded file is empty");

            await cacheEpub(book!.id, buffer);
          }
        } else {
          // Local book — try uploaded books first, then folder books
          buffer = await getEpubArrayBuffer(book!.id);
          if (!buffer || buffer.byteLength === 0) {
            buffer = await getFolderBookArrayBuffer(book!.id);
          }
          if (!buffer || buffer.byteLength === 0) {
            throw new Error("EPUB file not found in local storage");
          }
        }

        if (cancelled) return;
        setArrayBuffer(buffer);
        setIsLoading(false);
      } catch (err: any) {
        if (cancelled) return;
        console.error("Error loading EPUB data:", err);
        setError(err.message || "Failed to load EPUB");
        setIsLoading(false);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, [book]);

  // Loading state
  if (isLoading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading book…</p>
        </div>
      </div>
    );
  }

  // Error / not found
  if (error || !book || !arrayBuffer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <BookOpen className="w-16 h-16 text-primary mx-auto" />
          <h2 className="text-foreground">{error || "Book Not Found"}</h2>
          <button
            onClick={() => navigate("/")}
            className="text-primary hover:underline"
          >
            Return to Library
          </button>
        </div>
      </div>
    );
  }

  return (
    <EpubReaderCore
      bookId={book.id}
      title={book.title}
      author={book.author}
      arrayBuffer={arrayBuffer}
      backPath={`/book/${book.id}`}
      onBack={() => navigate(`/book/${book.id}`)}
      accessToken={session?.access_token}
      accentColor="var(--primary)"
    />
  );
}