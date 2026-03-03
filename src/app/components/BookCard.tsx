import { Book } from "../types/book";
import { User, Library } from "lucide-react";
import { Link } from "react-router";
import { BookCover } from "./BookCover";
import { getCachedCover } from "../services/epubCache";

interface BookCardProps {
  book: Book;
}

export function BookCard({ book }: BookCardProps) {
  const coverUrl = getCachedCover(book.id);

  return (
    <Link 
      to={`/book/${book.id}`} 
      className="block bg-card border border-border rounded-lg overflow-hidden hover:border-primary/50 transition-colors"
    >
      <div className="aspect-[2/3] overflow-hidden bg-secondary relative">
        <BookCover title={book.title} coverUrl={coverUrl} />
        {book.source === "library" && (
          <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 bg-primary/90 text-primary-foreground text-xs rounded-md">
            <Library className="w-3 h-3" />
            Library
          </div>
        )}
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
  );
}