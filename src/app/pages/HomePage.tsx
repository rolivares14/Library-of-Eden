import { useState, useMemo, useEffect } from "react";
import { SearchBar } from "../components/SearchBar";
import { BookGrid } from "../components/BookGrid";
import { UploadButton } from "../components/UploadButton";
import { preloadBookCovers } from "../services/epubCache";
import { addUploadedBook, getUploadedBooks, reinitBooks } from "../services/uploadedBooks";
import { fetchLibraryBooks, uploadLibraryBook } from "../services/libraryApi";
import {
  isFolderAccessSupported,
  getFolderName,
  connectFolder,
  reconnectFolder,
  disconnectFolder,
  rescanFolder,
  getFolderBooks,
  hasSavedFolder,
} from "../services/folderLibrary";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { Book } from "../types/book";
import {
  Upload,
  Loader2,
  Library,
  BookOpen,
  FolderOpen,
  FolderSync,
  Unplug,
  RefreshCw,
} from "lucide-react";

function getOwnerId(userId: string | null | undefined): string {
  return userId || "anonymous";
}

export function HomePage() {
  const { user, loading: authLoading, session, isAdmin } = useAuth();
  const ownerId = getOwnerId(user?.id);

  const [searchQuery, setSearchQuery] = useState("");
  const [localBooks, setLocalBooks] = useState<Book[]>([]);
  const [libraryBooks, setLibraryBooks] = useState<Book[]>([]);
  const [folderBooksList, setFolderBooksList] = useState<Book[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Folder state
  const [folderConnected, setFolderConnected] = useState(false);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [hasSavedFolderHandle, setHasSavedFolderHandle] = useState(false);

  const showFolderSupport = isFolderAccessSupported();

  // Check for saved folder handle on mount
  useEffect(() => {
    hasSavedFolder().then(setHasSavedFolderHandle).catch(() => {});
  }, []);

  // Try to reconnect a previously saved folder
  useEffect(() => {
    if (!hasSavedFolderHandle || folderConnected) return;

    async function tryReconnect() {
      try {
        setIsScanning(true);
        const books = await reconnectFolder();
        if (books) {
          setFolderBooksList(books);
          setFolderConnected(true);
          setFolderName(getFolderName());
          toast.success(`Reconnected to folder "${getFolderName()}" — ${books.length} book(s) found`);
        }
      } catch {
        // Permission denied — user can click "Connect Folder" manually
      } finally {
        setIsScanning(false);
      }
    }

    tryReconnect();
  }, [hasSavedFolderHandle, folderConnected]);

  // Load local books from IndexedDB when auth state changes
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLocalBooks([]);
      setIsInitialized(true);
      return;
    }

    async function init() {
      setIsInitialized(false);
      await reinitBooks(ownerId);
      setLocalBooks(
        getUploadedBooks().map((b) => ({ ...b, source: "local" as const }))
      );
      setIsInitialized(true);
    }
    init();
  }, [ownerId, authLoading, user]);

  // Load library books from Supabase
  useEffect(() => {
    async function loadLibrary() {
      const books = await fetchLibraryBooks();
      setLibraryBooks(books);
    }
    loadLibrary();
  }, []);

  // Combined personal books = uploaded + folder
  const myBooks = useMemo(() => {
    return [...localBooks, ...folderBooksList];
  }, [localBooks, folderBooksList]);

  const allBooks = useMemo(() => {
    return [...libraryBooks, ...myBooks];
  }, [libraryBooks, myBooks]);

  // Preload book covers after init
  useEffect(() => {
    if (!isInitialized || allBooks.length === 0) return;
    preloadBookCovers(allBooks);
  }, [allBooks, isInitialized]);

  // ─── Handlers ──────────────────────────────────────────────────

  const handleUpload = async (file: File) => {
    if (!user) return;
    setIsUploading(true);
    try {
      const book = await addUploadedBook(file, ownerId);
      if (book) {
        setLocalBooks(
          getUploadedBooks().map((b) => ({ ...b, source: "local" as const }))
        );
        await preloadBookCovers([book]);
        toast.success(`Uploaded: ${book.title}`);
      } else {
        toast.error("Failed to upload book.");
      }
    } catch (error) {
      console.error("Error in handleUpload:", error);
      toast.error("Error uploading book.");
    } finally {
      setIsUploading(false);
    }
  };

  const [isLibraryUploading, setIsLibraryUploading] = useState(false);

  const handleLibraryUpload = async (file: File) => {
    if (!session?.access_token) {
      toast.error("You must be signed in to upload to the library");
      return;
    }
    setIsLibraryUploading(true);
    try {
      const { extractTitleAndAuthor } = await import("../services/epubMetaExtractor");
      const meta = await extractTitleAndAuthor(file);
      const title = meta.title || file.name.replace(/\.epub$/i, "");
      const author = meta.author || "Unknown Author";
      const book = await uploadLibraryBook(file, title, author, session.access_token);
      if (book) {
        setLibraryBooks((prev) => [...prev, book]);
        toast.success(`Uploaded to Library: ${book.title}`);
      } else {
        toast.error("Failed to upload to library. You may not have permission.");
      }
    } catch (error) {
      console.error("Error in handleLibraryUpload:", error);
      toast.error("Error uploading to library.");
    } finally {
      setIsLibraryUploading(false);
    }
  };

  const handleConnectFolder = async () => {
    try {
      setIsScanning(true);
      const books = await connectFolder();
      setFolderBooksList(books);
      setFolderConnected(true);
      setFolderName(getFolderName());
      toast.success(`Connected "${getFolderName()}" — ${books.length} book(s) found`);
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        console.error("Error connecting folder:", err);
        toast.error(err.message || "Failed to connect folder");
      }
    } finally {
      setIsScanning(false);
    }
  };

  const handleRescan = async () => {
    try {
      setIsScanning(true);
      const books = await rescanFolder();
      setFolderBooksList(books);
      toast.success(`Rescanned — ${books.length} book(s) found`);
    } catch (err) {
      console.error("Error rescanning folder:", err);
      toast.error("Failed to rescan folder");
    } finally {
      setIsScanning(false);
    }
  };

  const handleDisconnect = async () => {
    await disconnectFolder();
    setFolderBooksList([]);
    setFolderConnected(false);
    setFolderName(null);
    setHasSavedFolderHandle(false);
    toast.success("Folder disconnected");
  };

  // ─── Filtered lists ────────────────────────────────────────────

  const filteredLibraryBooks = useMemo(() => {
    if (!searchQuery.trim()) return libraryBooks;
    const q = searchQuery.toLowerCase();
    return libraryBooks.filter(
      (b) => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q)
    );
  }, [searchQuery, libraryBooks]);

  const filteredMyBooks = useMemo(() => {
    if (!searchQuery.trim()) return myBooks;
    const q = searchQuery.toLowerCase();
    return myBooks.filter(
      (b) => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q)
    );
  }, [searchQuery, myBooks]);

  // ─── Render ────────────────────────────────────────────────────

  return (
    <main className="container mx-auto px-6 py-8 space-y-10">
      {/* Welcome Section */}
      <div className="text-center space-y-3 py-8">
        <h2 className="text-foreground">Welcome to the Library of Eden</h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Explore our collection of classic literature. All books are free to read online.
          {!user && " Sign in to upload your own books and save reading progress."}
        </p>
      </div>

      {/* Search */}
      <SearchBar value={searchQuery} onChange={setSearchQuery} />

      {/* ═══ Library Section ═══ */}
      <section className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2.5 rounded-lg">
              <Library className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-foreground text-lg">Library</h3>
              <p className="text-sm text-muted-foreground">
                {libraryBooks.length} {libraryBooks.length === 1 ? "book" : "books"} — free for everyone
              </p>
            </div>
          </div>

          {isAdmin && (
            <div>
              <input
                type="file"
                accept=".epub"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && file.name.endsWith(".epub")) {
                    handleLibraryUpload(file);
                    e.target.value = "";
                  } else if (file) {
                    toast.error("Please upload a valid EPUB file");
                  }
                }}
                className="hidden"
                id="library-upload"
                disabled={isLibraryUploading}
              />
              <label
                htmlFor="library-upload"
                className={`inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg cursor-pointer hover:bg-primary/90 transition-colors text-sm ${
                  isLibraryUploading ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                {isLibraryUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Upload to Library
                  </>
                )}
              </label>
            </div>
          )}
        </div>

        {searchQuery && (
          <p className="text-sm text-muted-foreground">
            {filteredLibraryBooks.length}{" "}
            {filteredLibraryBooks.length === 1 ? "match" : "matches"}
          </p>
        )}

        {filteredLibraryBooks.length > 0 ? (
          <BookGrid books={filteredLibraryBooks} />
        ) : (
          <div className="text-center py-12 border border-dashed border-border rounded-lg">
            <Library className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-muted-foreground text-sm">
              {searchQuery
                ? "No library books match your search."
                : "No books in the library yet."}
            </p>
          </div>
        )}
      </section>

      {/* ═══ My Books Section (uploaded + folder) ═══ */}
      {user && (
        <section className="space-y-5">
          {/* Header row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2.5 rounded-lg">
                <BookOpen className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-foreground text-lg">My Books</h3>
                <p className="text-sm text-muted-foreground">
                  {myBooks.length} {myBooks.length === 1 ? "book" : "books"} — stored on this device
                  {folderConnected && folderName && (
                    <span className="text-primary"> (incl. folder "{folderName}")</span>
                  )}
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <UploadButton onUpload={handleUpload} isUploading={isUploading} />

              {showFolderSupport && !folderConnected && (
                <button
                  onClick={handleConnectFolder}
                  disabled={isScanning}
                  className={`inline-flex items-center gap-2 px-4 py-2 bg-secondary text-foreground border border-border rounded-lg hover:bg-accent transition-colors text-sm ${
                    isScanning ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                >
                  {isScanning ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <FolderOpen className="w-4 h-4" />
                      Connect Folder
                    </>
                  )}
                </button>
              )}

              {folderConnected && (
                <>
                  <button
                    onClick={handleRescan}
                    disabled={isScanning}
                    className={`inline-flex items-center gap-2 px-3 py-2 bg-secondary text-foreground border border-border rounded-lg hover:bg-accent transition-colors text-sm ${
                      isScanning ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                    title="Rescan folder for new books"
                  >
                    {isScanning ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    <span className="hidden sm:inline">Rescan</span>
                  </button>
                  <button
                    onClick={handleDisconnect}
                    className="inline-flex items-center gap-2 px-3 py-2 text-destructive border border-destructive/30 rounded-lg hover:bg-destructive/10 transition-colors text-sm"
                    title="Disconnect folder"
                  >
                    <Unplug className="w-4 h-4" />
                    <span className="hidden sm:inline">Disconnect</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Connected folder banner */}
          {folderConnected && folderName && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-primary/5 border border-primary/20 rounded-lg text-sm">
              <FolderSync className="w-4 h-4 text-primary shrink-0" />
              <span className="text-muted-foreground">
                Reading from <span className="text-foreground font-medium">{folderName}/</span>
                {" — "}
                {folderBooksList.length} {folderBooksList.length === 1 ? "EPUB" : "EPUBs"} found.
                Books are read directly from your disk.
              </span>
            </div>
          )}

          {/* Saved folder that needs permission re-grant */}
          {!folderConnected && hasSavedFolderHandle && !isScanning && (
            <div className="flex items-center gap-3 px-4 py-3 bg-secondary/50 border border-border rounded-lg text-sm">
              <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">
                A folder was previously connected. Click{" "}
                <button
                  onClick={handleConnectFolder}
                  className="text-primary hover:underline font-medium"
                >
                  Connect Folder
                </button>
                {" "}to reconnect and grant permission.
              </span>
            </div>
          )}

          {searchQuery && (
            <p className="text-sm text-muted-foreground">
              {filteredMyBooks.length}{" "}
              {filteredMyBooks.length === 1 ? "match" : "matches"}
            </p>
          )}

          {filteredMyBooks.length > 0 ? (
            <BookGrid books={filteredMyBooks} />
          ) : (
            <div className="text-center py-12 border border-dashed border-border rounded-lg">
              <BookOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-muted-foreground text-sm">
                {searchQuery
                  ? "No personal books match your search."
                  : showFolderSupport
                    ? "Upload an EPUB or connect a folder to start your collection."
                    : "Upload an EPUB to start your personal collection."}
              </p>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
