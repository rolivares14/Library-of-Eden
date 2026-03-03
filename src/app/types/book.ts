export interface Book {
  id: string;
  title: string;
  author: string;
  epubUrl: string;
  source?: "local" | "library" | "pirate";
}

export interface BookMetadata {
  summary: string;
  tags: string[];
  publishedYear: string;
  subjects: string[];
  coverImageUrl?: string;
}
