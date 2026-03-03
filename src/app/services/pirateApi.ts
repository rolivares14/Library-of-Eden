import { serverUrl } from "./supabaseClient";
import { publicAnonKey } from "/utils/supabase/info";
import { Book } from "../types/book";

/**
 * Verifies the pirate password against the server.
 */
export async function verifyPiratePassword(password: string): Promise<boolean> {
  try {
    const res = await fetch(`${serverUrl}/pirate/verify`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${publicAnonKey}`,
        "X-Pirate-Password": password,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const data = await res.json();
    return data.valid === true;
  } catch (err) {
    console.error("Error verifying pirate password:", err);
    return false;
  }
}

/**
 * Fetches all pirate isle books. Requires the pirate password.
 */
export async function fetchPirateBooks(password: string): Promise<Book[]> {
  try {
    const res = await fetch(`${serverUrl}/pirate/books`, {
      headers: {
        Authorization: `Bearer ${publicAnonKey}`,
        "X-Pirate-Password": password,
      },
    });

    if (!res.ok) {
      console.error("Failed to fetch pirate books:", res.status);
      return [];
    }

    const data = await res.json();
    return (data.books || []).map((b: any) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      epubUrl: "",
      source: "pirate" as const,
    }));
  } catch (err) {
    console.error("Error fetching pirate books:", err);
    return [];
  }
}

/**
 * Gets a signed URL for reading a pirate book.
 */
export async function getPirateBookUrl(
  bookId: string,
  password: string
): Promise<string | null> {
  try {
    const res = await fetch(`${serverUrl}/pirate/book/${bookId}/url`, {
      headers: {
        Authorization: `Bearer ${publicAnonKey}`,
        "X-Pirate-Password": password,
      },
    });

    if (!res.ok) {
      console.error("Failed to get pirate book URL:", res.status);
      return null;
    }

    const data = await res.json();
    return data.url || null;
  } catch (err) {
    console.error("Error getting pirate book URL:", err);
    return null;
  }
}

/**
 * Uploads an EPUB to Pirate Isle. Requires pirate password + auth.
 */
export async function uploadPirateBook(
  file: File,
  title: string,
  author: string,
  password: string,
  accessToken: string
): Promise<Book | null> {
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title);
    formData.append("author", author);

    const res = await fetch(`${serverUrl}/pirate/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${publicAnonKey}`,
        "X-Pirate-Password": password,
        "X-User-Token": accessToken,
      },
      body: formData,
    });

    if (!res.ok) {
      const data = await res.json();
      console.error("Pirate upload failed:", data.error);
      return null;
    }

    const data = await res.json();
    return {
      id: data.book.id,
      title: data.book.title,
      author: data.book.author,
      epubUrl: "",
      source: "pirate" as const,
    };
  } catch (err) {
    console.error("Error uploading pirate book:", err);
    return null;
  }
}

/**
 * Deletes a pirate book. Requires pirate password + auth.
 */
export async function deletePirateBook(
  bookId: string,
  password: string,
  accessToken: string
): Promise<boolean> {
  try {
    const res = await fetch(`${serverUrl}/pirate/book/${bookId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${publicAnonKey}`,
        "X-Pirate-Password": password,
        "X-User-Token": accessToken,
      },
    });
    return res.ok;
  } catch (err) {
    console.error("Error deleting pirate book:", err);
    return false;
  }
}