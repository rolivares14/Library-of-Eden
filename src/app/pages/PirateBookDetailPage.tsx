import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { ArrowLeft, BookOpen, User, Loader2, Skull } from "lucide-react";
import { BookCover } from "../components/BookCover";
import { toast } from "sonner";

export function PirateBookDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [book, setBook] = useState<{
    id: string;
    title: string;
    author: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const password = sessionStorage.getItem("pirate-password");
    if (!password) {
      toast.error("Access denied — enter the Pirate Isle password first");
      navigate("/pirate");
      return;
    }

    async function loadBook() {
      try {
        const { fetchPirateBooks } = await import("../services/pirateApi");
        const books = await fetchPirateBooks(password!);
        const found = books.find((b) => b.id === id);
        if (found) {
          setBook({ id: found.id, title: found.title, author: found.author });
        }
      } catch (err) {
        console.error("Failed to load pirate book:", err);
      }
      setLoading(false);
    }

    loadBook();
  }, [id, navigate]);

  if (loading) {
    return (
      <main className="container mx-auto px-6 py-8">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-[#d4a832] animate-spin" />
        </div>
      </main>
    );
  }

  if (!book) {
    return (
      <main className="container mx-auto px-6 py-8">
        <div className="text-center space-y-4">
          <h2 className="text-foreground">Book Not Found</h2>
          <Link to="/pirate" className="text-[#d4a832] hover:underline">
            Return to Pirate Isle
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container mx-auto px-6 py-8">
      <button
        onClick={() => navigate("/pirate")}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Pirate Isle
      </button>

      <div className="grid md:grid-cols-[300px_1fr] gap-8 mb-8">
        {/* Cover */}
        <div className="space-y-4">
          <div className="aspect-[2/3] overflow-hidden rounded-lg bg-secondary border border-[#8b6914]/30">
            <BookCover title={book.title} />
          </div>

          <Link
            to={`/pirate/read/${book.id}`}
            className="w-full bg-[#8b6914] text-white py-3 px-4 rounded-lg flex items-center justify-center gap-2 hover:bg-[#a67b1a] transition-colors"
          >
            <BookOpen className="w-5 h-5" />
            Start Reading
          </Link>
        </div>

        {/* Info */}
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Skull className="w-5 h-5 text-[#d4a832]" />
              <span className="text-xs text-[#d4a832] uppercase tracking-wider font-semibold">
                Pirate Isle
              </span>
            </div>
            <h1 className="text-foreground mb-2">{book.title}</h1>
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="w-4 h-4" />
              <span className="text-lg">{book.author}</span>
            </div>
          </div>

          <div className="bg-card border border-[#8b6914]/30 rounded-lg p-4 space-y-2">
            <h3 className="text-foreground mb-3">Book Information</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <span className="text-muted-foreground">Author:</span>
              <span className="text-foreground">{book.author}</span>

              <span className="text-muted-foreground">Format:</span>
              <span className="text-foreground">EPUB</span>

              <span className="text-muted-foreground">Collection:</span>
              <span className="text-[#d4a832]">Pirate Isle</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
