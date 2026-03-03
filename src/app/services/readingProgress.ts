import { serverUrl } from "./supabaseClient";
import { publicAnonKey } from "/utils/supabase/info";

interface ReadingProgress {
  cfi: string | null;
  percentage: number;
  updatedAt?: string;
}

const LOCAL_KEY_PREFIX = "reading-progress:";

/**
 * Save reading progress. Server for logged-in users, localStorage fallback.
 */
export async function saveProgress(
  bookId: string,
  cfi: string,
  percentage: number,
  accessToken?: string | null
): Promise<void> {
  // Always save locally as immediate fallback
  const data: ReadingProgress = {
    cfi,
    percentage,
    updatedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(`${LOCAL_KEY_PREFIX}${bookId}`, JSON.stringify(data));
  } catch {}

  // If logged in, also save to server
  if (accessToken) {
    try {
      await fetch(`${serverUrl}/progress`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-User-Token": accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ bookId, cfi, percentage }),
      });
    } catch (err) {
      console.error("Failed to save progress to server:", err);
    }
  }
}

/**
 * Load reading progress. Tries server first for logged-in users, then localStorage.
 */
export async function loadProgress(
  bookId: string,
  accessToken?: string | null
): Promise<ReadingProgress | null> {
  let serverProgress: ReadingProgress | null = null;
  let localProgress: ReadingProgress | null = null;

  // Try local first (fast)
  try {
    const raw = localStorage.getItem(`${LOCAL_KEY_PREFIX}${bookId}`);
    if (raw) localProgress = JSON.parse(raw);
  } catch {}

  // Try server for logged-in users
  if (accessToken) {
    try {
      const res = await fetch(`${serverUrl}/progress/${bookId}`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-User-Token": accessToken,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.cfi) serverProgress = data;
      }
    } catch (err) {
      console.error("Failed to load progress from server:", err);
    }
  }

  // Return whichever is more recent
  if (serverProgress && localProgress) {
    const serverDate = new Date(serverProgress.updatedAt || 0).getTime();
    const localDate = new Date(localProgress.updatedAt || 0).getTime();
    return serverDate >= localDate ? serverProgress : localProgress;
  }

  return serverProgress || localProgress;
}
