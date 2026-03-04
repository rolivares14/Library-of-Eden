import { serverUrl } from "./supabaseClient";
import { publicAnonKey } from "/utils/supabase/info";

export interface Bookmark {
  cfi: string | null;
  tocIndex: number;
  chapterLabel: string;
  percentage: number;
  updatedAt?: string;
}

/**
 * Save (upsert) a bookmark for a book. Requires auth.
 * Overwrites any existing bookmark for this user+book.
 */
export async function saveBookmark(
  bookId: string,
  bookmark: Omit<Bookmark, "updatedAt">,
  accessToken: string
): Promise<boolean> {
  try {
    const res = await fetch(`${serverUrl}/bookmark`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${publicAnonKey}`,
        "X-User-Token": accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ bookId, ...bookmark }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error("Failed to save bookmark:", data.error || res.statusText);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Failed to save bookmark:", err);
    return false;
  }
}

/**
 * Load the bookmark for a book. Returns null if none exists or not logged in.
 */
export async function loadBookmark(
  bookId: string,
  accessToken: string
): Promise<Bookmark | null> {
  try {
    const res = await fetch(`${serverUrl}/bookmark/${bookId}`, {
      headers: {
        Authorization: `Bearer ${publicAnonKey}`,
        "X-User-Token": accessToken,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.cfi) return null;
    return data as Bookmark;
  } catch (err) {
    console.error("Failed to load bookmark:", err);
    return null;
  }
}

/**
 * Delete the bookmark for a book.
 */
export async function deleteBookmark(
  bookId: string,
  accessToken: string
): Promise<boolean> {
  try {
    const res = await fetch(`${serverUrl}/bookmark/${bookId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${publicAnonKey}`,
        "X-User-Token": accessToken,
      },
    });
    return res.ok;
  } catch (err) {
    console.error("Failed to delete bookmark:", err);
    return false;
  }
}
