import { serverUrl } from "./supabaseClient";
import { publicAnonKey } from "/utils/supabase/info";

/**
 * Checks if the currently authenticated user is an admin.
 */
export async function checkAdminStatus(accessToken: string): Promise<boolean> {
  try {
    const res = await fetch(`${serverUrl}/admin/check`, {
      headers: {
        Authorization: `Bearer ${publicAnonKey}`,
        "X-User-Token": accessToken,
      },
    });

    if (!res.ok) {
      console.error("Admin check failed:", res.status);
      return false;
    }

    const data = await res.json();
    return data.isAdmin === true;
  } catch (err) {
    console.error("Error checking admin status:", err);
    return false;
  }
}