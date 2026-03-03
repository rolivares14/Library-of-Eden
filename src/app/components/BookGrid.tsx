import { Book } from "../types/book";
import { BookCard } from "./BookCard";

interface BookGridProps {
  books: Book[];
}

export function BookGrid({ books }: BookGridProps) {
  if (books.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">No books found matching your search.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {books.map((book) => (
        <BookCard key={book.id} book={book} />
      ))}
    </div>
  );
}
