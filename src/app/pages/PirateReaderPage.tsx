import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { toast } from "sonner";
import { fetchPirateBooks, getPirateBookUrl } from "../services/pirateApi";
import { cacheEpub, getCachedEpub } from "../services/epubIndexedDB";
import { useAuth } from "../contexts/AuthContext";
import { EpubReaderCore } from "../components/reader/EpubReaderCore";
import { Skull, Loader2 } from "lucide-react";

export function PirateReaderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();

  const [book, setBook] = useState<{ id: string; title: string; author: string } | null>(null);
  const [arrayBuffer, setArrayBuffer] = useState<ArrayBuffer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const password = sessionStorage.getItem("pirate-password");
    if (!password) {
      toast.error("Access denied");
      navigate("/pirate");
      return;
    }

    let cancelled = false;

    async function loadBook() {
      try {
        // Get book metadata
        const books = await fetchPirateBooks(password!);
        const found = books.find((b) => b.id === id);
        if (!found) {
          setError("Book not found in Pirate Isle");
          setIsLoading(false);
          return;
        }

        setBook({ id: found.id, title: found.title, author: found.author });

        // Get EPUB data - check cache first
        let buffer = await getCachedEpub(found.id);
        if (!buffer) {
          const url = await getPirateBookUrl(found.id, password!);
          if (!url) throw new Error("Failed to get download URL");

          const res = await fetch(url);
          if (!res.ok) throw new Error("Failed to download EPUB");

          buffer = await res.arrayBuffer();
          if (!buffer || buffer.byteLength === 0) throw new Error("Downloaded file is empty");

          await cacheEpub(found.id, buffer);
        }

        if (cancelled) return;
        setArrayBuffer(buffer);
        setIsLoading(false);
      } catch (err: any) {
        if (cancelled) return;
        console.error("Error loading pirate EPUB:", err);
        setError(err.message || "Failed to load EPUB");
        setIsLoading(false);
      }
    }

    loadBook();
    return () => { cancelled = true; };
  }, [id, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 animate-spin mx-auto text-[#d4a832]" />
          <p className="text-muted-foreground">Loading pirate book…</p>
        </div>
      </div>
    );
  }

  if (error || !book || !arrayBuffer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Skull className="w-16 h-16 text-[#d4a832] mx-auto" />
          <h2 className="text-foreground">{error || "Book Not Found"}</h2>
          <button
            onClick={() => navigate("/pirate")}
            className="text-[#d4a832] hover:underline"
          >
            Return to Pirate Isle
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
      backPath={`/pirate/book/${book.id}`}
      onBack={() => navigate(`/pirate/book/${book.id}`)}
      accessToken={session?.access_token}
      accentColor="#d4a832"
      icon={<Skull className="w-4 h-4 shrink-0 text-[#d4a832]" />}
    />
  );
}
