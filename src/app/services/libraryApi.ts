import { serverUrl } from "./supabaseClient";
import { publicAnonKey } from "/utils/supabase/info";
import { Book } from "../types/book";

/**
 * Fetches all public library books from Supabase.
 */
export async function fetchLibraryBooks(): Promise<Book[]> {
  try {
    const res = await fetch(`${serverUrl}/library/books`, {
      headers: {
        Authorization: `Bearer ${publicAnonKey}`,
      },
    });

    if (!res.ok) {
      console.error("Failed to fetch library books:", res.status);
      return [];
    }

    const data = await res.json();
    return (data.books || []).map((b: any) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      epubUrl: "", // fetched on demand via signed URL
      source: "library" as const,
    }));
  } catch (err) {
    console.error("Error fetching library books:", err);
    return [];
  }
}

/**
 * Gets a signed URL for reading a library book.
 */
export async function getLibraryBookUrl(bookId: string): Promise<string | null> {
  try {
    const res = await fetch(`${serverUrl}/library/book/${bookId}/url`, {
      headers: {
        Authorization: `Bearer ${publicAnonKey}`,
      },
    });

    if (!res.ok) {
      console.error("Failed to get library book URL:", res.status);
      return null;
    }

    const data = await res.json();
    return data.url || null;
  } catch (err) {
    console.error("Error getting library book URL:", err);
    return null;
  }
}

/**
 * Uploads an EPUB to the public library.
 * Requires auth — pass the access token.
 */
export async function uploadLibraryBook(
  file: File,
  title: string,
  author: string,
  accessToken: string
): Promise<Book | null> {
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title);
    formData.append("author", author);

    const res = await fetch(`${serverUrl}/library/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${publicAnonKey}`,
        "X-User-Token": accessToken,
      },
      body: formData,
    });

    if (!res.ok) {
      const data = await res.json();
      console.error("Library upload failed:", data.error);
      return null;
    }

    const data = await res.json();
    return {
      id: data.book.id,
      title: data.book.title,
      author: data.book.author,
      epubUrl: "",
      source: "library" as const,
    };
  } catch (err) {
    console.error("Error uploading library book:", err);
    return null;
  }
}

/**
 * Deletes a library book. Requires auth.
 */
export async function deleteLibraryBook(
  bookId: string,
  accessToken: string
): Promise<boolean> {
  try {
    const res = await fetch(`${serverUrl}/library/book/${bookId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${publicAnonKey}`,
        "X-User-Token": accessToken,
      },
    });
    return res.ok;
  } catch (err) {
    console.error("Error deleting library book:", err);
    return false;
  }
}