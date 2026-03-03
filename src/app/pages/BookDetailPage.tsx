import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { getUploadedBooks, initBooks } from "../services/uploadedBooks";
import { fetchLibraryBooks } from "../services/libraryApi";
import { parseEpubMetadata } from "../services/epubParser";
import { getFolderBooks, getFolderBookArrayBuffer } from "../services/folderLibrary";
import { BookMetadata, Book } from "../types/book";
import { ArrowLeft, BookOpen, Calendar, User, Loader2, Library } from "lucide-react";
import { BookCover } from "../components/BookCover";
import { useAuth } from "../contexts/AuthContext";

export function BookDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const ownerId = user?.id || "anonymous";

  const [book, setBook] = useState<Book | undefined>(undefined);
  const [metadata, setMetadata] = useState<BookMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Find the book — check local uploads first, then library
  useEffect(() => {
    if (authLoading) return;

    async function findBook() {
      // Check local uploads
      await initBooks(ownerId);
      const localBook = getUploadedBooks().find((b) => b.id === id);
      if (localBook) {
        setBook({ ...localBook, source: "local" });
        return;
      }

      // Check folder books
      const folderBook = getFolderBooks().find((b) => b.id === id);
      if (folderBook) {
        setBook({ ...folderBook, source: "local" });
        return;
      }

      // Check library books
      const libBooks = await fetchLibraryBooks();
      const libBook = libBooks.find((b) => b.id === id);
      if (libBook) {
        setBook(libBook);
        return;
      }

      // Not found
      setBook(undefined);
      setLoading(false);
    }

    findBook();
  }, [id, ownerId, authLoading]);

  useEffect(() => {
    if (!book) return;

    async function loadMetadata() {
      setLoading(true);
      setError(null);

      if (book.source === "library") {
        // For library books, we need to fetch via signed URL to parse metadata
        try {
          const { getLibraryBookUrl } = await import("../services/libraryApi");
          const url = await getLibraryBookUrl(book.id);
          if (url) {
            const data = await parseEpubMetadata(url, book.id);
            if (data) {
              setMetadata(data);
              setLoading(false);
              return;
            }
          }
        } catch (err) {
          console.error("Failed to load library book metadata:", err);
        }

        // Fallback
        setMetadata({
          summary: "A book from the Library of Eden collection.",
          tags: [],
          publishedYear: "Unknown",
          subjects: [],
        });
      } else {
        // Local book — try existing parser first; if URL is virtual (folder://), read from folder handle
        if (book.epubUrl.startsWith("folder://")) {
          try {
            const buf = await getFolderBookArrayBuffer(book.id);
            if (buf) {
              const blob = new Blob([buf], { type: "application/epub+zip" });
              const blobUrl = URL.createObjectURL(blob);
              const data = await parseEpubMetadata(blobUrl, book.id);
              URL.revokeObjectURL(blobUrl);
              if (data) {
                setMetadata(data);
                setLoading(false);
                return;
              }
            }
          } catch (err) {
            console.error("Failed to parse folder book metadata:", err);
          }
          setMetadata({
            summary: "A book from your connected folder.",
            tags: [],
            publishedYear: "Unknown",
            subjects: [],
          });
        } else {
          const data = await parseEpubMetadata(book.epubUrl, book.id);
          if (data) {
            setMetadata(data);
          } else {
            setMetadata({
              summary:
                "EPUB file not found. Please ensure the book file is available.",
              tags: [],
              publishedYear: "Unknown",
              subjects: [],
            });
          }
        }
      }

      setLoading(false);
    }

    loadMetadata();
  }, [book]);

  if (!book && !loading) {
    return (
      <main className="container mx-auto px-6 py-8">
        <div className="text-center space-y-4">
          <h2 className="text-foreground">Book Not Found</h2>
          <Link to="/" className="text-primary hover:underline">
            Return to Library
          </Link>
        </div>
      </main>
    );
  }

  if (!book) {
    return (
      <main className="container mx-auto px-6 py-8">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      </main>
    );
  }

  return (
    <main className="container mx-auto px-6 py-8">
      {/* Back Button */}
      <button
        onClick={() => navigate("/")}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Library
      </button>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="text-center py-8">
          <p className="text-red-500">{error}</p>
        </div>
      )}

      {/* Book Details */}
      {!loading && metadata && (
        <div className="grid md:grid-cols-[300px_1fr] gap-8 mb-8">
          {/* Cover */}
          <div className="space-y-4">
            <div className="aspect-[2/3] overflow-hidden rounded-lg bg-secondary border border-border">
              <BookCover
                title={book.title}
                coverUrl={metadata.coverImageUrl}
              />
            </div>

            {/* Read Button */}
            <Link
              to={`/read/${book.id}`}
              className="w-full bg-primary text-primary-foreground py-3 px-4 rounded-lg flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
            >
              <BookOpen className="w-5 h-5" />
              Start Reading
            </Link>
          </div>

          {/* Info */}
          <div className="space-y-6">
            <div>
              {book.source === "library" && (
                <div className="flex items-center gap-2 mb-2">
                  <Library className="w-4 h-4 text-primary" />
                  <span className="text-xs text-primary uppercase tracking-wider font-semibold">
                    Library Collection
                  </span>
                </div>
              )}
              <h1 className="text-foreground mb-2">{book.title}</h1>
              <div className="flex items-center gap-2 text-muted-foreground mb-4">
                <User className="w-4 h-4" />
                <span className="text-lg">{book.author}</span>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  <span>Published {metadata.publishedYear}</span>
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="space-y-2">
              <h3 className="text-foreground">Summary</h3>
              <p className="text-muted-foreground leading-relaxed">
                {metadata.summary}
              </p>
            </div>

            {/* Tags */}
            {metadata.tags.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-foreground">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {metadata.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 bg-secondary border border-border text-foreground text-sm rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Book Details */}
            <div className="bg-card border border-border rounded-lg p-4 space-y-2">
              <h3 className="text-foreground mb-3">Book Information</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <span className="text-muted-foreground">Author:</span>
                <span className="text-foreground">{book.author}</span>

                <span className="text-muted-foreground">Published:</span>
                <span className="text-foreground">
                  {metadata.publishedYear}
                </span>

                <span className="text-muted-foreground">Format:</span>
                <span className="text-foreground">EPUB</span>

                <span className="text-muted-foreground">Source:</span>
                <span className="text-foreground">
                  {book.source === "library"
                    ? "Library Collection"
                    : book.epubUrl.startsWith("folder://")
                      ? "Connected Folder"
                      : "Personal Upload"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}