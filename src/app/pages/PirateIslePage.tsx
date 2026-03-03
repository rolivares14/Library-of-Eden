import { useState, useMemo, useEffect } from "react";
import { Skull, Lock, Upload, Loader2, ArrowLeft, User, Eye, EyeOff } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import {
  verifyPiratePassword,
  fetchPirateBooks,
  uploadPirateBook,
} from "../services/pirateApi";
import { Book } from "../types/book";
import { SearchBar } from "../components/SearchBar";
import { BookCover } from "../components/BookCover";
import { preloadBookCovers } from "../services/epubCache";

export function PirateIslePage() {
  const { user, session, isAdmin } = useAuth();
  const navigate = useNavigate();

  // Password gate state
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [storedPassword, setStoredPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Book state
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  // Check if password was stored in sessionStorage
  useEffect(() => {
    const saved = sessionStorage.getItem("pirate-password");
    if (saved) {
      setStoredPassword(saved);
      setPassword(saved);
      setIsUnlocked(true);
    }
  }, []);

  // Load books once unlocked
  useEffect(() => {
    if (!isUnlocked || !storedPassword) return;

    async function loadBooks() {
      setLoading(true);
      const pirateBooks = await fetchPirateBooks(storedPassword);
      setBooks(pirateBooks);
      if (pirateBooks.length > 0) {
        await preloadBookCovers(pirateBooks);
      }
      setLoading(false);
    }

    loadBooks();
  }, [isUnlocked, storedPassword]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setVerifying(true);
    const valid = await verifyPiratePassword(password);
    setVerifying(false);

    if (valid) {
      setIsUnlocked(true);
      setStoredPassword(password);
      sessionStorage.setItem("pirate-password", password);
      toast.success("Welcome aboard, pirate!");
    } else {
      toast.error("Wrong password, landlubber!");
    }
  };

  const handleUpload = async (file: File) => {
    if (!user || !session?.access_token) {
      toast.error("Sign in to upload books to Pirate Isle");
      return;
    }

    setIsUploading(true);

    try {
      // Parse metadata from the EPUB on the client side
      const { extractTitleAndAuthor } = await import("../services/epubMetaExtractor");
      const meta = await extractTitleAndAuthor(file);
      const title = meta.title || file.name.replace(/\.epub$/i, "");
      const author = meta.author || "Unknown Author";

      const book = await uploadPirateBook(
        file,
        title,
        author,
        storedPassword,
        session.access_token
      );

      if (book) {
        setBooks((prev) => [...prev, book]);
        toast.success(`Uploaded: ${book.title}`);
      } else {
        toast.error("Failed to upload book");
      }
    } catch (err) {
      console.error("Pirate upload error:", err);
      toast.error("Error uploading book");
    } finally {
      setIsUploading(false);
    }
  };

  const filteredBooks = useMemo(() => {
    if (!searchQuery.trim()) return books;
    const q = searchQuery.toLowerCase();
    return books.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q)
    );
  }, [searchQuery, books]);

  // ─── Password Gate ────────────────────────────────────────────

  if (!isUnlocked) {
    return (
      <main className="container mx-auto px-6 py-8">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Library
        </button>

        <div className="max-w-md mx-auto mt-16">
          <div className="text-center space-y-4 mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-[#2a1a0a] border-2 border-[#8b6914]">
              <Skull className="w-10 h-10 text-[#d4a832]" />
            </div>
            <h2 className="text-foreground">Pirate Isle</h2>
            <p className="text-muted-foreground">
              Enter the password to access the hidden collection.
            </p>
          </div>

          <form onSubmit={handleUnlock} className="space-y-4">
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password..."
                className="w-full pl-10 pr-10 py-3 bg-input-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#8b6914]"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            <button
              type="submit"
              disabled={verifying || !password.trim()}
              className="w-full py-3 bg-[#8b6914] text-white rounded-lg hover:bg-[#a67b1a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {verifying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <Skull className="w-4 h-4" />
                  Unlock
                </>
              )}
            </button>
          </form>
        </div>
      </main>
    );
  }

  // ─── Unlocked View ────────────────────────────────────────────

  return (
    <main className="container mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Library
        </button>
      </div>

      {/* Title */}
      <div className="text-center space-y-3 py-4">
        <div className="flex items-center justify-center gap-3">
          <Skull className="w-8 h-8 text-[#d4a832]" />
          <h2 className="text-foreground">Pirate Isle</h2>
        </div>
        <p className="text-muted-foreground max-w-lg mx-auto">
          The hidden collection. These books are stored securely and only accessible with the password.
        </p>
      </div>

      {/* Stats + Upload */}
      <div className="flex items-center justify-between">
        <div className="bg-card border border-[#8b6914]/30 rounded-lg p-4 flex items-center gap-4">
          <div className="bg-[#8b6914]/20 p-3 rounded-lg">
            <Skull className="w-6 h-6 text-[#d4a832]" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Pirate Books</p>
            <p className="text-2xl text-foreground">{books.length}</p>
          </div>
        </div>

        {isAdmin && user && (
          <div>
            <input
              type="file"
              accept=".epub"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && file.name.endsWith(".epub")) {
                  handleUpload(file);
                  e.target.value = "";
                } else if (file) {
                  toast.error("Please upload a valid EPUB file");
                }
              }}
              className="hidden"
              id="pirate-upload"
              disabled={isUploading}
            />
            <label
              htmlFor="pirate-upload"
              className={`inline-flex items-center gap-2 px-4 py-2 bg-[#8b6914] text-white rounded-lg cursor-pointer hover:bg-[#a67b1a] transition-colors ${
                isUploading ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Upload EPUB
                </>
              )}
            </label>
          </div>
        )}
      </div>

      {/* Search */}
      <SearchBar value={searchQuery} onChange={setSearchQuery} />

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-[#d4a832] animate-spin" />
        </div>
      )}

      {/* Books Grid */}
      {!loading && filteredBooks.length === 0 && (
        <div className="text-center py-16">
          <Skull className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <p className="text-muted-foreground">
            {searchQuery
              ? "No pirate books match your search."
              : "No books in Pirate Isle yet. Upload an EPUB to get started!"}
          </p>
        </div>
      )}

      {!loading && filteredBooks.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredBooks.map((book) => (
            <Link
              key={book.id}
              to={`/pirate/book/${book.id}`}
              className="block bg-card border border-[#8b6914]/30 rounded-lg overflow-hidden hover:border-[#d4a832]/60 transition-colors"
            >
              <div className="aspect-[2/3] overflow-hidden bg-secondary">
                <BookCover title={book.title} />
              </div>
              <div className="p-4 space-y-3">
                <div className="space-y-1">
                  <h3 className="text-foreground line-clamp-2">{book.title}</h3>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <User className="w-3.5 h-3.5" />
                    <span className="line-clamp-1">{book.author}</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}