import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from "./kv_store.tsx";

const app = new Hono();

// Enable logger
app.use("*", logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "X-Pirate-Password", "X-User-Token"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  })
);

// ─── Helpers ─────────────────────────────────────────────────────

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL"),
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  );
}

async function getAuthUser(c: any) {
  const supabase = getSupabase();
  // User's JWT is passed via X-User-Token (Authorization carries the anon key for the gateway)
  const accessToken = c.req.header("X-User-Token") || c.req.header("Authorization")?.split(" ")[1];
  if (!accessToken) return null;

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);
  if (error || !user?.id) return null;
  return user;
}

function isAdminUser(user: any): boolean {
  const adminEmails = Deno.env.get("ADMIN_EMAILS") || "";
  const admins = adminEmails
    .split(",")
    .map((e: string) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes((user.email || "").toLowerCase());
}

const LIBRARY_BUCKET = "make-31dd8e3b-library";
const PIRATE_BUCKET = "make-31dd8e3b-pirate";

// ─── Bucket initialization ──────────────────────────────────────

async function ensureBuckets() {
  const supabase = getSupabase();
  const { data: buckets } = await supabase.storage.listBuckets();

  const libraryExists = buckets?.some(
    (bucket: any) => bucket.name === LIBRARY_BUCKET
  );
  if (!libraryExists) {
    await supabase.storage.createBucket(LIBRARY_BUCKET, { public: false });
    console.log("Created library bucket:", LIBRARY_BUCKET);
  }

  const pirateExists = buckets?.some(
    (bucket: any) => bucket.name === PIRATE_BUCKET
  );
  if (!pirateExists) {
    await supabase.storage.createBucket(PIRATE_BUCKET, { public: false });
    console.log("Created pirate bucket:", PIRATE_BUCKET);
  }
}

// Initialize buckets on startup
ensureBuckets().catch((err) =>
  console.log("Bucket init error (non-fatal):", err.message)
);

// ─── Health ──────────────────────────────────────────────────────

app.get("/make-server-31dd8e3b/health", (c) => {
  return c.json({ status: "ok" });
});

// ─── Admin Check ─────────────────────────────────────────────────

app.get("/make-server-31dd8e3b/admin/check", async (c) => {
  const accessToken = c.req.header("X-User-Token");
  if (!accessToken) {
    return c.json({ isAdmin: false });
  }

  const supabase = getSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user?.id) {
    console.log("Admin check auth error:", error?.message);
    return c.json({ isAdmin: false });
  }

  return c.json({ isAdmin: isAdminUser(user) });
});

// ─── Auth: Sign Up ───────────────────────────────────────────────

app.post("/make-server-31dd8e3b/signup", async (c) => {
  try {
    const { email, password, name } = await c.req.json();

    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    const supabase = getSupabase();

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name: name || "Reader" },
      // Automatically confirm the user's email since an email server hasn't been configured.
      email_confirm: true,
    });

    if (error) {
      console.log("Signup error:", error.message);
      return c.json({ error: error.message }, 400);
    }

    console.log("User created successfully:", data.user.id);
    return c.json({ user: { id: data.user.id, email: data.user.email } });
  } catch (err: any) {
    console.log("Signup exception:", err.message);
    return c.json({ error: "Failed to create account: " + err.message }, 500);
  }
});

// ─── User Profile ────────────────────────────────────────────────

app.get("/make-server-31dd8e3b/profile", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const profile = await kv.get(`profile:${user.id}`);
    return c.json({
      id: user.id,
      email: user.email,
      name: user.user_metadata?.name || "Reader",
      ...profile,
    });
  } catch (err: any) {
    console.log("Profile fetch error:", err.message);
    return c.json({
      id: user.id,
      email: user.email,
      name: user.user_metadata?.name || "Reader",
    });
  }
});

// ─── Reading Progress: Save ──────────────────────────────────────

app.post("/make-server-31dd8e3b/progress", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const { bookId, cfi, tocIndex, scrollFraction } = await c.req.json();
    if (!bookId) {
      return c.json({ error: "bookId is required" }, 400);
    }

    await kv.set(`progress:${user.id}:${bookId}`, {
      cfi,
      tocIndex,
      scrollFraction,
      updatedAt: new Date().toISOString(),
    });

    return c.json({ success: true });
  } catch (err: any) {
    console.log("Save progress error:", err.message);
    return c.json({ error: "Failed to save progress: " + err.message }, 500);
  }
});

// ─── Reading Progress: Get for a book ────────────────────────────

app.get("/make-server-31dd8e3b/progress/:bookId", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const bookId = c.req.param("bookId");
    const progress = await kv.get(`progress:${user.id}:${bookId}`);
    return c.json(progress || { cfi: null });
  } catch (err: any) {
    console.log("Get progress error:", err.message);
    return c.json({ cfi: null });
  }
});

// ─── Reading Progress: Get all for a user ────────────────────────

app.get("/make-server-31dd8e3b/progress", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const allProgress = await kv.getByPrefix(`progress:${user.id}:`);
    return c.json(allProgress || []);
  } catch (err: any) {
    console.log("Get all progress error:", err.message);
    return c.json([]);
  }
});

// ─── Bookmarks: Save (upsert — one bookmark per user+book) ──────

app.post("/make-server-31dd8e3b/bookmark", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const { bookId, cfi, tocIndex, chapterLabel, percentage } = await c.req.json();
    if (!bookId) {
      return c.json({ error: "bookId is required" }, 400);
    }

    // Single kv.set — overwrites any existing bookmark for this user+book
    await kv.set(`bookmark:${user.id}:${bookId}`, {
      cfi,
      tocIndex,
      chapterLabel,
      percentage,
      updatedAt: new Date().toISOString(),
    });

    return c.json({ success: true });
  } catch (err: any) {
    console.log("Save bookmark error:", err.message);
    return c.json({ error: "Failed to save bookmark: " + err.message }, 500);
  }
});

// ─── Bookmarks: Get for a book ───────────────────────────────────

app.get("/make-server-31dd8e3b/bookmark/:bookId", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const bookId = c.req.param("bookId");
    const bookmark = await kv.get(`bookmark:${user.id}:${bookId}`);
    return c.json(bookmark || { cfi: null });
  } catch (err: any) {
    console.log("Get bookmark error:", err.message);
    return c.json({ cfi: null });
  }
});

// ─── Bookmarks: Delete ───────────────────────────────────────────

app.delete("/make-server-31dd8e3b/bookmark/:bookId", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const bookId = c.req.param("bookId");
    await kv.del(`bookmark:${user.id}:${bookId}`);
    return c.json({ success: true });
  } catch (err: any) {
    console.log("Delete bookmark error:", err.message);
    return c.json({ error: "Failed to delete bookmark: " + err.message }, 500);
  }
});

// ═════════════════════════════════════════════════════════════════
// ─── LIBRARY (Public Books in Supabase Storage) ─────────────────
// ═════════════════════════════════════════════════════════════════

/**
 * GET /library/books — List all library books (public, no auth required)
 */
app.get("/make-server-31dd8e3b/library/books", async (c) => {
  try {
    const books = await kv.getByPrefix("library:book:");
    // getByPrefix returns array of { key, value } pairs
    const bookList = (books || []).map((entry: any) => entry.value || entry);
    return c.json({ books: bookList });
  } catch (err: any) {
    console.log("Library list error:", err.message);
    return c.json({ books: [], error: "Failed to list library books: " + err.message });
  }
});

/**
 * POST /library/upload — Upload an EPUB to the public library (admin only)
 */
app.post("/make-server-31dd8e3b/library/upload", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized — sign in to upload to the library" }, 401);
  }

  if (!isAdminUser(user)) {
    return c.json({ error: "Forbidden — only admins can upload to the library" }, 403);
  }

  try {
    const formData = await c.req.formData();
    const file = formData.get("file") as File;
    const title = (formData.get("title") as string) || "Untitled";
    const author = (formData.get("author") as string) || "Unknown Author";

    if (!file) {
      return c.json({ error: "No file provided" }, 400);
    }

    const bookId = `lib-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const storagePath = `${bookId}.epub`;

    const supabase = getSupabase();

    // Upload file to Supabase Storage
    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from(LIBRARY_BUCKET)
      .upload(storagePath, arrayBuffer, {
        contentType: "application/epub+zip",
        upsert: false,
      });

    if (uploadError) {
      console.log("Library upload storage error:", uploadError.message);
      return c.json({ error: "Failed to upload file: " + uploadError.message }, 500);
    }

    // Save metadata to KV
    const bookMeta = {
      id: bookId,
      title,
      author,
      storagePath,
      uploadedBy: user.id,
      uploadedAt: new Date().toISOString(),
      source: "library" as const,
    };

    await kv.set(`library:book:${bookId}`, bookMeta);

    console.log("Library book uploaded:", bookId, title);
    return c.json({ book: bookMeta });
  } catch (err: any) {
    console.log("Library upload error:", err.message);
    return c.json({ error: "Upload failed: " + err.message }, 500);
  }
});

/**
 * GET /library/book/:id/url — Get a signed URL for reading a library book
 */
app.get("/make-server-31dd8e3b/library/book/:id/url", async (c) => {
  try {
    const bookId = c.req.param("id");
    const bookMeta: any = await kv.get(`library:book:${bookId}`);

    if (!bookMeta) {
      return c.json({ error: "Book not found" }, 404);
    }

    const supabase = getSupabase();
    const { data, error } = await supabase.storage
      .from(LIBRARY_BUCKET)
      .createSignedUrl(bookMeta.storagePath, 3600); // 1 hour

    if (error) {
      console.log("Library signed URL error:", error.message);
      return c.json({ error: "Failed to generate URL: " + error.message }, 500);
    }

    return c.json({ url: data.signedUrl });
  } catch (err: any) {
    console.log("Library URL error:", err.message);
    return c.json({ error: "Failed to get book URL: " + err.message }, 500);
  }
});

/**
 * DELETE /library/book/:id — Remove a library book (admin only)
 */
app.delete("/make-server-31dd8e3b/library/book/:id", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (!isAdminUser(user)) {
    return c.json({ error: "Forbidden — only admins can delete library books" }, 403);
  }

  try {
    const bookId = c.req.param("id");
    const bookMeta: any = await kv.get(`library:book:${bookId}`);

    if (!bookMeta) {
      return c.json({ error: "Book not found" }, 404);
    }

    const supabase = getSupabase();

    // Remove from storage
    await supabase.storage.from(LIBRARY_BUCKET).remove([bookMeta.storagePath]);

    // Remove metadata
    await kv.del(`library:book:${bookId}`);

    console.log("Library book deleted:", bookId);
    return c.json({ success: true });
  } catch (err: any) {
    console.log("Library delete error:", err.message);
    return c.json({ error: "Failed to delete book: " + err.message }, 500);
  }
});

// ═════════════════════════════════════════════════════════════════
// ─── PIRATE ISLE (Password-locked books in Supabase Storage) ────
// ═════════════════════════════════════════════════════════════════

function verifyPiratePassword(c: any): boolean {
  const password = c.req.header("X-Pirate-Password");
  const expected = Deno.env.get("PIRATE_PASSWORD");
  if (!expected) {
    console.log("PIRATE_PASSWORD env var not set");
    return false;
  }
  return password === expected;
}

/**
 * POST /pirate/verify — Verify the pirate password
 */
app.post("/make-server-31dd8e3b/pirate/verify", async (c) => {
  if (verifyPiratePassword(c)) {
    return c.json({ valid: true });
  }
  return c.json({ valid: false, error: "Wrong password, landlubber!" }, 403);
});

/**
 * GET /pirate/books — List pirate isle books (password required)
 */
app.get("/make-server-31dd8e3b/pirate/books", async (c) => {
  if (!verifyPiratePassword(c)) {
    return c.json({ error: "Access denied" }, 403);
  }

  try {
    const books = await kv.getByPrefix("pirate:book:");
    const bookList = (books || []).map((entry: any) => entry.value || entry);
    return c.json({ books: bookList });
  } catch (err: any) {
    console.log("Pirate list error:", err.message);
    return c.json({ books: [], error: "Failed to list pirate books: " + err.message });
  }
});

/**
 * POST /pirate/upload — Upload to Pirate Isle (password required, admin only)
 */
app.post("/make-server-31dd8e3b/pirate/upload", async (c) => {
  if (!verifyPiratePassword(c)) {
    return c.json({ error: "Access denied" }, 403);
  }

  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized — sign in to upload" }, 401);
  }

  if (!isAdminUser(user)) {
    return c.json({ error: "Forbidden — only admins can upload to Pirate Isle" }, 403);
  }

  try {
    const formData = await c.req.formData();
    const file = formData.get("file") as File;
    const title = (formData.get("title") as string) || "Untitled";
    const author = (formData.get("author") as string) || "Unknown Author";

    if (!file) {
      return c.json({ error: "No file provided" }, 400);
    }

    const bookId = `pirate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const storagePath = `${bookId}.epub`;

    const supabase = getSupabase();

    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from(PIRATE_BUCKET)
      .upload(storagePath, arrayBuffer, {
        contentType: "application/epub+zip",
        upsert: false,
      });

    if (uploadError) {
      console.log("Pirate upload storage error:", uploadError.message);
      return c.json({ error: "Failed to upload file: " + uploadError.message }, 500);
    }

    const bookMeta = {
      id: bookId,
      title,
      author,
      storagePath,
      uploadedBy: user.id,
      uploadedAt: new Date().toISOString(),
      source: "pirate" as const,
    };

    await kv.set(`pirate:book:${bookId}`, bookMeta);

    console.log("Pirate book uploaded:", bookId, title);
    return c.json({ book: bookMeta });
  } catch (err: any) {
    console.log("Pirate upload error:", err.message);
    return c.json({ error: "Upload failed: " + err.message }, 500);
  }
});

/**
 * GET /pirate/book/:id/url — Get signed URL for a pirate book (password required)
 */
app.get("/make-server-31dd8e3b/pirate/book/:id/url", async (c) => {
  if (!verifyPiratePassword(c)) {
    return c.json({ error: "Access denied" }, 403);
  }

  try {
    const bookId = c.req.param("id");
    const bookMeta: any = await kv.get(`pirate:book:${bookId}`);

    if (!bookMeta) {
      return c.json({ error: "Book not found" }, 404);
    }

    const supabase = getSupabase();
    const { data, error } = await supabase.storage
      .from(PIRATE_BUCKET)
      .createSignedUrl(bookMeta.storagePath, 3600);

    if (error) {
      console.log("Pirate signed URL error:", error.message);
      return c.json({ error: "Failed to generate URL: " + error.message }, 500);
    }

    return c.json({ url: data.signedUrl });
  } catch (err: any) {
    console.log("Pirate URL error:", err.message);
    return c.json({ error: "Failed to get book URL: " + err.message }, 500);
  }
});

/**
 * DELETE /pirate/book/:id — Remove a pirate book (password + admin only)
 */
app.delete("/make-server-31dd8e3b/pirate/book/:id", async (c) => {
  if (!verifyPiratePassword(c)) {
    return c.json({ error: "Access denied" }, 403);
  }

  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (!isAdminUser(user)) {
    return c.json({ error: "Forbidden — only admins can delete pirate books" }, 403);
  }

  try {
    const bookId = c.req.param("id");
    const bookMeta: any = await kv.get(`pirate:book:${bookId}`);

    if (!bookMeta) {
      return c.json({ error: "Book not found" }, 404);
    }

    const supabase = getSupabase();
    await supabase.storage.from(PIRATE_BUCKET).remove([bookMeta.storagePath]);
    await kv.del(`pirate:book:${bookId}`);

    console.log("Pirate book deleted:", bookId);
    return c.json({ success: true });
  } catch (err: any) {
    console.log("Pirate delete error:", err.message);
    return c.json({ error: "Failed to delete book: " + err.message }, 500);
  }
});

Deno.serve(app.fetch);