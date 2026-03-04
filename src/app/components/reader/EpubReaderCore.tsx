import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  List,
  Settings,
  Maximize,
  Minimize,
  Loader2,
  Bookmark,
  BookmarkCheck,
} from "lucide-react";
import ePub from "epubjs";
import { toast } from "sonner";
import { ReaderSidebar } from "./ReaderSidebar";
import { ReaderSettings, ReadingTheme, getThemeStyles } from "./ReaderSettings";
import { saveProgress, loadProgress } from "../../services/readingProgress";
import { saveBookmark, loadBookmark, deleteBookmark, Bookmark as BookmarkData } from "../../services/bookmarkService";

interface TocItem {
  id: string;
  href: string;
  label: string;
  subitems?: TocItem[];
}

interface FlatTocEntry {
  href: string;
  label: string;
  basePath: string;   // href without fragment
  fragment: string | null; // the #anchor part (without #)
}

interface EpubReaderCoreProps {
  bookId: string;
  title: string;
  author: string;
  arrayBuffer: ArrayBuffer;
  backPath: string;
  onBack: () => void;
  accessToken?: string | null;
  accentColor?: string;
  icon?: React.ReactNode;
}

const SETTINGS_KEY = "reader-settings";
const HIDDEN_ATTR = "data-ch-hidden";

// ── Helpers ────────────────────────────────────────────────────────

function loadSettingsFromStorage(): { fontSize: number; theme: ReadingTheme } {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        fontSize: typeof parsed.fontSize === "number" ? parsed.fontSize : 16,
        theme: ["light", "sepia", "dark"].includes(parsed.theme) ? parsed.theme : "light",
      };
    }
  } catch {}
  return { fontSize: 16, theme: "light" };
}

function persistSettings(fontSize: number, theme: ReadingTheme) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ fontSize, theme })); } catch {}
}

function getFragment(href: string): string | null {
  const i = href.indexOf("#");
  return i >= 0 ? href.substring(i + 1) : null;
}

function getBasePath(href: string): string {
  const i = href.indexOf("#");
  return i >= 0 ? href.substring(0, i) : href;
}

function flattenToc(items: TocItem[]): FlatTocEntry[] {
  const result: FlatTocEntry[] = [];
  for (const item of items) {
    result.push({
      href: item.href,
      label: item.label.trim(),
      basePath: getBasePath(item.href),
      fragment: getFragment(item.href),
    });
    if (item.subitems?.length) {
      result.push(...flattenToc(item.subitems));
    }
  }
  return result;
}

// ── DOM isolation — hide content outside chapter boundaries ───────

function clearIsolation(doc: Document) {
  doc.querySelectorAll(`[${HIDDEN_ATTR}]`).forEach((el) => {
    (el as HTMLElement).style.display = "";
    el.removeAttribute(HIDDEN_ATTR);
  });
}

function hideElement(el: Element) {
  (el as HTMLElement).style.display = "none";
  el.setAttribute(HIDDEN_ATTR, "1");
}

/**
 * Walk up from `el` to `body`, hiding all previous siblings at every
 * level.  This makes everything *before* `el` invisible while keeping
 * `el` and its ancestor chain visible.
 */
function hideBeforeElement(el: Element, body: Element) {
  let current: Element | null = el;
  while (current && current !== body) {
    let sib = current.previousElementSibling;
    while (sib) {
      hideElement(sib);
      sib = sib.previousElementSibling;
    }
    current = current.parentElement;
  }
}

/**
 * Hide `el` itself plus everything after it, walking up to `body` and
 * hiding subsequent siblings at every level.
 */
function hideFromElement(el: Element, body: Element) {
  // Hide el and all its next siblings
  let sib: Element | null = el;
  while (sib) {
    hideElement(sib);
    sib = sib.nextElementSibling;
  }
  // Walk up, hiding next siblings of ancestors
  let parent = el.parentElement;
  while (parent && parent !== body) {
    sib = parent.nextElementSibling;
    while (sib) {
      hideElement(sib);
      sib = sib.nextElementSibling;
    }
    parent = parent.parentElement;
  }
}

/**
 * Given the current and (optionally) next TOC entry, hide everything
 * in the rendered iframe that falls outside the current chapter.
 */
function isolateChapter(
  rendition: any,
  current: FlatTocEntry,
  next: FlatTocEntry | null
) {
  const contents = rendition.getContents();
  if (!contents?.length) return;

  const doc: Document = contents[0].document ?? contents[0].doc;
  const body = doc?.body;
  if (!body) return;

  clearIsolation(doc);

  // Hide everything BEFORE the current chapter's anchor
  if (current.fragment) {
    const startEl = doc.getElementById(current.fragment);
    if (startEl) {
      hideBeforeElement(startEl, body);
    }
  }

  // Hide everything FROM the next chapter's anchor onward
  // (only when the next chapter is inside the same spine file)
  if (next && next.basePath === current.basePath && next.fragment) {
    const endEl = doc.getElementById(next.fragment);
    if (endEl) {
      hideFromElement(endEl, body);
    }
  }

  // Scroll to the top of the visible area
  const container = rendition.manager?.container;
  if (container) container.scrollTop = 0;

  // Also scroll the wrapper div and iframe to top
  const wrapper = container?.parentElement?.parentElement;
  if (wrapper) wrapper.scrollTop = 0;

  const win = contents[0].window ?? contents[0].document?.defaultView;
  if (win) win.scrollTo(0, 0);
}

// ── Component ────────────────────────────────────────────────────

export function EpubReaderCore({
  bookId,
  title,
  author,
  arrayBuffer,
  backPath,
  onBack,
  accessToken,
  accentColor = "var(--primary)",
  icon,
}: EpubReaderCoreProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<any>(null);
  const bookInstanceRef = useRef<any>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  // TOC
  const [toc, setToc] = useState<TocItem[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentChapter, setCurrentChapter] = useState("");
  const [currentChapterLabel, setCurrentChapterLabel] = useState("");

  // Flat TOC for chapter‑by‑chapter navigation
  const flatTocRef = useRef<FlatTocEntry[]>([]);
  const currentTocIndexRef = useRef(0);

  // Progress
  const [percentage, setPercentage] = useState(0);
  const [totalLocations, setTotalLocations] = useState(0);
  const [currentLocationIndex, setCurrentLocationIndex] = useState(0);

  // Settings
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fontSize, setFontSize] = useState(() => loadSettingsFromStorage().fontSize);
  const [readingTheme, setReadingTheme] = useState<ReadingTheme>(
    () => loadSettingsFromStorage().theme
  );

  // Fullscreen (CSS‑based)
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Toolbar auto‑hide
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bookmark (one per user+book, stored in Supabase KV)
  const [currentBookmark, setCurrentBookmark] = useState<BookmarkData | null>(null);

  // ── Scroll position tracking ──────────────────────────────────
  // Primary restore: tocIndex + scrollFraction (reliable in scrolled-doc mode).
  // CFI is saved alongside but epub.js currentLocation() in scrolled-doc mode
  // only returns the spine-item start, not the actual scroll position,
  // so scrollFraction is used as the primary positional mechanism.
  const scrollListenerCleanupRef = useRef<(() => void) | null>(null);

  // Stable refs so the useEffect closure always calls the latest version
  const bookIdRef = useRef(bookId);
  const accessTokenRef = useRef(accessToken);
  useEffect(() => { bookIdRef.current = bookId; }, [bookId]);
  useEffect(() => { accessTokenRef.current = accessToken; }, [accessToken]);

  /**
   * Get the manager container — the element epubjs creates with
   * overflow:auto in scrolled-doc mode.
   */
  const getMgrContainer = useCallback((): HTMLElement | null => {
    return renditionRef.current?.manager?.container ?? null;
  }, []);

  /** Get scroll fraction (0-1) for server saves (fallback only) */
  const getScrollFraction = useCallback((): number => {
    const mgr = getMgrContainer();
    if (mgr) {
      const max = mgr.scrollHeight - mgr.clientHeight;
      if (max > 1) return mgr.scrollTop / max;
    }
    const wrapper = viewerRef.current?.parentElement;
    if (wrapper) {
      const max = wrapper.scrollHeight - wrapper.clientHeight;
      if (max > 1) return wrapper.scrollTop / max;
    }
    return 0;
  }, [getMgrContainer]);

  /**
   * Restore scroll position within a chapter using scrollFraction (0-1).
   *
   * In scrolled-doc mode, epub.js `currentLocation()` always returns the
   * spine-item start CFI — it does NOT track how far the user has scrolled.
   * So scrollFraction is the *primary* positional mechanism.  We poll until
   * a scrollable container exists, then set scrollTop = fraction * maxScroll.
   */
  const restoreScrollFraction = useCallback((fraction: number) => {
    if (!fraction || fraction <= 0) return;

    let attempts = 0;
    const maxAttempts = 25; // up to ~2.5s

    const tryRestore = () => {
      attempts++;
      const mgr = getMgrContainer();
      const wrapper = viewerRef.current?.parentElement;

      // Pick whichever container is actually scrollable
      const el = (mgr && mgr.scrollHeight > mgr.clientHeight + 5) ? mgr
               : (wrapper && wrapper.scrollHeight > wrapper.clientHeight + 5) ? wrapper
               : null;

      if (!el) {
        if (attempts < maxAttempts) {
          setTimeout(tryRestore, 100);
        } else {
          console.log("[Scroll] Gave up waiting for scrollable container after", attempts, "attempts");
        }
        return;
      }

      const max = el.scrollHeight - el.clientHeight;
      if (max <= 1) {
        // Content not tall enough yet — keep trying
        if (attempts < maxAttempts) {
          setTimeout(tryRestore, 100);
        }
        return;
      }

      const targetTop = Math.round(fraction * max);
      el.scrollTop = targetTop;
      console.log(`[Scroll] Restored scrollFraction=${fraction.toFixed(4)} → scrollTop=${targetTop} (attempt ${attempts}, container=${el === mgr ? "manager" : "wrapper"})`);

      // Re-apply after a beat in case the browser resets scrollTop
      setTimeout(() => {
        if (Math.abs(el.scrollTop - targetTop) > 30 && targetTop > 20) {
          el.scrollTop = targetTop;
          console.log("[Scroll] Re-applied scrollFraction after reset:", targetTop);
        }
      }, 250);
    };

    // Small initial delay for layout to settle after isolation
    setTimeout(tryRestore, 120);
  }, [getMgrContainer]);

  // ── Progress auto‑save (debounced) ─────────────────────────────
  // IMPORTANT: debouncedSave must be declared BEFORE setupScrollListeners

  const debouncedSave = useCallback(
    (cfi: string) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const tocIdx = currentTocIndexRef.current;
        const scrollFrac = getScrollFraction();
        console.log("[Progress] Saving — tocIndex:", tocIdx, "scrollFraction:", scrollFrac, "cfi:", cfi?.slice(0, 40));
        saveProgress(bookIdRef.current, {
          cfi,
          tocIndex: tocIdx,
          scrollFraction: scrollFrac,
        }, accessTokenRef.current);
      }, 1500);
    },
    [getScrollFraction]
  );

  /**
   * Attach scroll listeners to ALL possible containers.
   * On scroll, trigger the debounced server save with current CFI.
   */
  const setupScrollListeners = useCallback(() => {
    // Clean up previous
    if (scrollListenerCleanupRef.current) {
      scrollListenerCleanupRef.current();
      scrollListenerCleanupRef.current = null;
    }

    const mgr = getMgrContainer();
    const wrapper = viewerRef.current?.parentElement;
    const cleanups: (() => void)[] = [];

    let timer: ReturnType<typeof setTimeout> | null = null;
    const handler = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const rendition = renditionRef.current;
        if (!rendition) return;
        const loc = rendition.currentLocation();
        if (loc?.start?.cfi) {
          debouncedSave(loc.start.cfi);
        }
      }, 250);
    };

    // Listen on manager container
    if (mgr) {
      mgr.addEventListener("scroll", handler, { passive: true });
      cleanups.push(() => mgr.removeEventListener("scroll", handler));
    }

    // Listen on wrapper
    if (wrapper) {
      wrapper.addEventListener("scroll", handler, { passive: true });
      cleanups.push(() => wrapper.removeEventListener("scroll", handler));
    }

    // Listen on iframe window
    try {
      const contents = renditionRef.current?.getContents?.() || [];
      if (contents.length > 0) {
        const win = contents[0].window ?? contents[0].document?.defaultView;
        if (win) {
          win.addEventListener("scroll", handler, { passive: true });
          cleanups.push(() => win.removeEventListener("scroll", handler));
        }
      }
    } catch {}

    scrollListenerCleanupRef.current = () => {
      cleanups.forEach((fn) => fn());
      if (timer) clearTimeout(timer);
    };

    console.log("[Scroll] Listeners attached to:", cleanups.length, "containers");
  }, [getMgrContainer, debouncedSave]);

  // ── Navigate to a TOC index ──────────────────────────────────────

  const navigateToTocIndex = useCallback(async (index: number) => {
    const flat = flatTocRef.current;
    const rendition = renditionRef.current;
    if (!rendition || flat.length === 0) return;

    // Fire a save of current position before leaving the chapter
    try {
      const loc = rendition.currentLocation();
      if (loc?.start?.cfi) {
        debouncedSave(loc.start.cfi);
      }
    } catch {}

    const clamped = Math.max(0, Math.min(flat.length - 1, index));
    currentTocIndexRef.current = clamped;

    const entry = flat[clamped];
    const nextEntry = clamped + 1 < flat.length ? flat[clamped + 1] : null;

    setCurrentChapterLabel(entry.label);

    try {
      await rendition.display(entry.href);
      // Small delay to ensure DOM is ready before we manipulate it
      requestAnimationFrame(() => {
        isolateChapter(rendition, entry, nextEntry);
        // Also scroll the outer viewer wrapper to top
        if (viewerRef.current?.parentElement) {
          viewerRef.current.parentElement.scrollTop = 0;
        }
        // And scroll the page itself to top
        window.scrollTo(0, 0);

        // Re-attach scroll listeners (iframe may have changed)
        setupScrollListeners();
      });
    } catch (err) {
      console.error("Error navigating to chapter:", err);
    }
  }, [setupScrollListeners, debouncedSave]);

  // ── Bookmark handlers ────────────────────────────────────────────

  const handleSetBookmark = useCallback(async () => {
    if (!accessToken) {
      toast("Sign in to save bookmarks", { duration: 3000 });
      return;
    }
    const rendition = renditionRef.current;
    if (!rendition) return;

    const loc = rendition.currentLocation();
    const cfi = loc?.start?.cfi || null;
    const tocIdx = currentTocIndexRef.current;
    const label = flatTocRef.current[tocIdx]?.label || "Unknown chapter";
    const pct = percentage;

    const bm: BookmarkData = { cfi, tocIndex: tocIdx, chapterLabel: label, percentage: pct };
    const ok = await saveBookmark(bookId, bm, accessToken);
    if (ok) {
      setCurrentBookmark({ ...bm, updatedAt: new Date().toISOString() });
      toast("Bookmark saved", { duration: 2000, icon: "🔖" });
    } else {
      toast.error("Failed to save bookmark");
    }
  }, [accessToken, bookId, percentage]);

  const handleGoToBookmark = useCallback(() => {
    if (!currentBookmark) return;
    if (currentBookmark.tocIndex !== undefined && currentBookmark.tocIndex >= 0) {
      navigateToTocIndex(currentBookmark.tocIndex);
    } else if (currentBookmark.cfi && renditionRef.current) {
      renditionRef.current.display(currentBookmark.cfi);
    }
  }, [currentBookmark, navigateToTocIndex]);

  const handleRemoveBookmark = useCallback(async () => {
    if (!accessToken) return;
    const ok = await deleteBookmark(bookId, accessToken);
    if (ok) {
      setCurrentBookmark(null);
      toast("Bookmark removed", { duration: 2000 });
    } else {
      toast.error("Failed to remove bookmark");
    }
  }, [accessToken, bookId]);

  // Load saved bookmark on mount
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    (async () => {
      const bm = await loadBookmark(bookId, accessToken);
      if (!cancelled) setCurrentBookmark(bm);
    })();
    return () => { cancelled = true; };
  }, [bookId, accessToken]);

  // ── Prev / Next chapter ──────────────────────────────────────────

  const goToPrevChapter = useCallback(() => {
    if (!isReady) return;
    const flat = flatTocRef.current;
    if (flat.length === 0) { try { renditionRef.current?.prev(); } catch {} return; }
    const newIdx = Math.max(0, currentTocIndexRef.current - 1);
    if (newIdx !== currentTocIndexRef.current) navigateToTocIndex(newIdx);
  }, [isReady, navigateToTocIndex]);

  const goToNextChapter = useCallback(() => {
    if (!isReady) return;
    const flat = flatTocRef.current;
    if (flat.length === 0) { try { renditionRef.current?.next(); } catch {} return; }
    const newIdx = Math.min(flat.length - 1, currentTocIndexRef.current + 1);
    if (newIdx !== currentTocIndexRef.current) navigateToTocIndex(newIdx);
  }, [isReady, navigateToTocIndex]);

  // Stable refs for iframe event handlers (never stale)
  const goToPrevRef = useRef(goToPrevChapter);
  const goToNextRef = useRef(goToNextChapter);
  useEffect(() => {
    goToPrevRef.current = goToPrevChapter;
    goToNextRef.current = goToNextChapter;
  }, [goToPrevChapter, goToNextChapter]);

  // ── Apply reading theme + font‑size ──────────────────────────────

  const applyStyles = useCallback(
    (rendition: any, fs: number, theme: ReadingTheme) => {
      const s = getThemeStyles(theme);
      rendition.themes.default({
        body: {
          "font-size": `${fs}px !important`,
          "line-height": "1.7 !important",
          color: `${s.fg} !important`,
          "background-color": `${s.bg} !important`,
          padding: "0 16px !important",
        },
        p: { "font-size": `${fs}px !important`, "line-height": "1.7 !important", color: `${s.fg} !important` },
        a: { color: `${s.linkColor} !important` },
        "h1, h2, h3, h4, h5, h6": { color: `${s.fg} !important` },
        "span, div, li, td, th, blockquote, em, strong, i, b": { color: `${s.fg} !important` },
      });
    },
    []
  );

  const handleFontSizeChange = useCallback(
    (newSize: number) => {
      setFontSize(newSize);
      persistSettings(newSize, readingTheme);
      if (renditionRef.current) applyStyles(renditionRef.current, newSize, readingTheme);
    },
    [readingTheme, applyStyles]
  );

  const handleThemeChange = useCallback(
    (newTheme: ReadingTheme) => {
      setReadingTheme(newTheme);
      persistSettings(fontSize, newTheme);
      if (renditionRef.current) applyStyles(renditionRef.current, fontSize, newTheme);
    },
    [fontSize, applyStyles]
  );

  // ── Fullscreen ──────────────────────────────────────────────────

  const toggleFullscreen = useCallback(() => setIsFullscreen((p) => !p), []);

  useEffect(() => {
    if (renditionRef.current) {
      const t = setTimeout(() => { try { renditionRef.current?.resize(); } catch {} }, 50);
      return () => clearTimeout(t);
    }
  }, [isFullscreen]);

  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  // ── Toolbar auto‑hide ──────────────────────────────────────────

  const showToolbar = useCallback(() => {
    setToolbarVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (isFullscreen) hideTimerRef.current = setTimeout(() => setToolbarVisible(false), 3000);
  }, [isFullscreen]);

  // ── Resolve a CFI / href to the closest TOC index ──────────────

  const resolveTocIndex = useCallback((href: string): number => {
    const flat = flatTocRef.current;
    if (flat.length === 0) return 0;
    const hrefBase = getBasePath(href);
    const hrefFrag = getFragment(href);

    // Exact match (href + fragment)
    let idx = flat.findIndex((e) => e.href === href);
    if (idx !== -1) return idx;

    // Match by fragment within same file
    if (hrefFrag) {
      idx = flat.findIndex((e) => e.basePath === hrefBase && e.fragment === hrefFrag);
      if (idx !== -1) return idx;
    }

    // Match by base path — return the FIRST TOC entry for this spine item
    idx = flat.findIndex((e) => e.basePath === hrefBase);
    if (idx !== -1) return idx;

    return 0;
  }, []);

  // ── Load & render the EPUB ─────────────────────────────────────

  useEffect(() => {
    if (!viewerRef.current) return;
    let cancelled = false;

    async function loadBook() {
      try {
        setIsLoading(true);
        setError(null);

        const bookInstance = ePub(arrayBuffer as any);
        bookInstanceRef.current = bookInstance;

        // scrolled‑doc + default = one spine item at a time, scrollable.
        // We then use DOM manipulation to isolate individual chapters
        // within that spine item.
        const rendition = bookInstance.renderTo(viewerRef.current!, {
          width: "100%",
          height: "100%",
          spread: "none",
          flow: "scrolled-doc",
          manager: "default",
        });
        renditionRef.current = rendition;

        applyStyles(rendition, fontSize, readingTheme);

        // Keyboard nav inside the epub iframe
        rendition.on("keydown", (e: KeyboardEvent) => {
          if (e.key === "ArrowLeft") { e.preventDefault(); goToPrevRef.current(); }
          else if (e.key === "ArrowRight") { e.preventDefault(); goToNextRef.current(); }
        });

        // Touch swipe — horizontal = chapter nav, vertical = scroll
        let touchStartX = 0, touchStartY = 0;
        rendition.on("touchstart", (e: TouchEvent) => {
          touchStartX = e.changedTouches[0].screenX;
          touchStartY = e.changedTouches[0].screenY;
        });
        rendition.on("touchend", (e: TouchEvent) => {
          const dx = e.changedTouches[0].screenX - touchStartX;
          const dy = e.changedTouches[0].screenY - touchStartY;
          if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 60) {
            if (dx > 0) goToPrevRef.current();
            else goToNextRef.current();
          }
        });

        // ── Build TOC ──────────────────────────────────────────
        const nav = await bookInstance.loaded.navigation;
        let flatEntries: FlatTocEntry[] = [];
        if (nav?.toc) {
          const tocItems: TocItem[] = nav.toc.map((item: any) => ({
            id: item.id || item.href,
            href: item.href,
            label: item.label,
            subitems:
              item.subitems?.map((sub: any) => ({
                id: sub.id || sub.href,
                href: sub.href,
                label: sub.label,
              })) || [],
          }));
          setToc(tocItems);
          flatEntries = flattenToc(tocItems);
          flatTocRef.current = flatEntries;
        }

        // ── Locations for progress tracking ────────────────────
        await bookInstance.ready;
        await bookInstance.locations.generate(1024);
        setTotalLocations(bookInstance.locations.length());

        // ── Track location changes ─────────────────────────────
        rendition.on("relocated", (location: any) => {
          if (cancelled) return;
          const pct = location.start?.percentage ?? 0;
          setPercentage(Math.round(pct * 100));

          const locIdx = bookInstance.locations.locationFromCfi(location.start.cfi);
          setCurrentLocationIndex(locIdx !== undefined && locIdx !== -1 ? locIdx + 1 : 0);

          if (location.start?.href) {
            setCurrentChapter(location.start.href);
          }

          debouncedSave(location.start.cfi);
        });

        // ── Initial display ────────────────────────────────────
        const progress = await loadProgress(bookId, accessToken);
        const savedScrollFraction = progress?.scrollFraction ?? 0;
        const savedTocIndex = progress?.tocIndex;
        const hasSavedProgress = !!(progress && (progress.cfi || (savedTocIndex !== undefined && savedTocIndex > 0) || savedScrollFraction > 0));

        if (hasSavedProgress) {
          // Use tocIndex for precise chapter navigation if available
          if (savedTocIndex !== undefined && savedTocIndex >= 0 && savedTocIndex < flatEntries.length) {
            const entry = flatEntries[savedTocIndex];
            await rendition.display(entry.href);
          } else if (progress?.cfi) {
            await rendition.display(progress.cfi);
          } else {
            await rendition.display();
          }
          toast("Restored your reading position", { duration: 3000, icon: "📖" });
        } else {
          await rendition.display();
        }

        if (cancelled) return;

        // Determine which TOC entry we're on and apply isolation
        if (flatEntries.length > 0) {
          // Prefer savedTocIndex, fall back to resolving from current location
          let tocIdx: number;
          if (hasSavedProgress && savedTocIndex !== undefined && savedTocIndex >= 0 && savedTocIndex < flatEntries.length) {
            tocIdx = savedTocIndex;
          } else {
            const loc = rendition.currentLocation();
            const startHref = loc?.start?.href || flatEntries[0].href;
            tocIdx = resolveTocIndex(startHref);
          }
          currentTocIndexRef.current = tocIdx;
          setCurrentChapterLabel(flatEntries[tocIdx].label);

          // Apply isolation then restore scroll position
          requestAnimationFrame(() => {
            const entry = flatEntries[tocIdx];
            const nextEntry = tocIdx + 1 < flatEntries.length ? flatEntries[tocIdx + 1] : null;
            isolateChapter(rendition, entry, nextEntry);

            // Set up scroll listeners on all containers
            setupScrollListeners();

            // Restore scroll position using scrollFraction (primary mechanism)
            if (savedScrollFraction > 0) {
              restoreScrollFraction(savedScrollFraction);
            }
          });
        }

        // Also attach scroll listener as fallback if no TOC
        if (flatEntries.length === 0) {
          setTimeout(() => {
            setupScrollListeners();
          }, 300);
        }

        setIsLoading(false);
        setIsReady(true);
      } catch (err: any) {
        if (cancelled) return;
        console.error("Error loading EPUB:", err);
        setError(err.message || "Failed to load EPUB file.");
        setIsLoading(false);
      }
    }

    loadBook();

    return () => {
      cancelled = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

      // Final save of reading position on unmount (CFI + tocIndex + scrollFraction)
      try {
        const tocIdx = currentTocIndexRef.current;
        const scrollFrac = getScrollFraction();
        const loc = renditionRef.current?.currentLocation?.();
        if (loc?.start?.cfi) {
          console.log("[Scroll] Final save on unmount — tocIndex:", tocIdx, "cfi:", loc.start.cfi?.slice(0, 40));
          saveProgress(bookIdRef.current, {
            cfi: loc.start.cfi,
            tocIndex: tocIdx,
            scrollFraction: scrollFrac,
          }, accessTokenRef.current);
        }
      } catch {}

      if (scrollListenerCleanupRef.current) scrollListenerCleanupRef.current();
      try { renditionRef.current?.destroy(); } catch {}
      try { bookInstanceRef.current?.destroy(); } catch {}
    };
  }, [arrayBuffer]);

  // ── TOC sidebar navigation ────────────────────────────────────

  const handleTocNavigate = useCallback(
    (href: string) => {
      const flat = flatTocRef.current;
      const idx = flat.findIndex((e) => e.href === href);
      if (idx !== -1) {
        navigateToTocIndex(idx);
      } else if (renditionRef.current) {
        renditionRef.current.display(href);
      }
    },
    [navigateToTocIndex]
  );

  // ── Keyboard navigation (parent window) ────────────────────────

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); goToPrevRef.current(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); goToNextRef.current(); }
      else if (e.key === "f" && !e.ctrlKey && !e.metaKey) toggleFullscreen();
      else if (e.key === "t" && !e.ctrlKey && !e.metaKey) setSidebarOpen((p) => !p);
      else if (e.key === "b" && !e.ctrlKey && !e.metaKey) handleSetBookmark();
      else if (e.key === "Escape") {
        if (isFullscreen) setIsFullscreen(false);
        else if (sidebarOpen) setSidebarOpen(false);
        else if (settingsOpen) setSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [toggleFullscreen, sidebarOpen, settingsOpen, isFullscreen, handleSetBookmark]);

  // ── Render ─────────────────────────────────────────────────────

  const themeStyles = getThemeStyles(readingTheme);

  return (
    <div
      ref={containerRef}
      className={`flex flex-col bg-background ${isFullscreen ? "fixed inset-0 z-[9999]" : "min-h-screen"}`}
      onMouseMove={showToolbar}
    >
      {/* TOC Sidebar */}
      <ReaderSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        toc={toc}
        currentChapter={currentChapter}
        onNavigate={handleTocNavigate}
        accentColor={accentColor}
        bookmark={currentBookmark}
        onGoToBookmark={handleGoToBookmark}
        onSetBookmark={handleSetBookmark}
        onRemoveBookmark={handleRemoveBookmark}
        isLoggedIn={!!accessToken}
        currentChapterLabel={currentChapterLabel}
      />

      {/* Top Toolbar */}
      <header
        className={`bg-card border-b border-border px-4 sm:px-6 py-3 sticky top-0 z-30 transition-transform duration-300 ${
          toolbarVisible ? "translate-y-0" : "-translate-y-full"
        }`}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          {/* Left: Back + TOC */}
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors p-2 rounded-md hover:bg-accent"
              title="Back"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline text-sm">Back</span>
            </button>
            <div className="w-px h-6 bg-border hidden sm:block" />
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors p-2 rounded-md hover:bg-accent"
              title="Table of Contents (T)"
            >
              <List className="w-4 h-4" />
              <span className="hidden sm:inline text-sm">Contents</span>
            </button>
          </div>

          {/* Center: Book info + chapter label */}
          <div className="flex flex-col items-center min-w-0 flex-1 justify-center">
            <div className="flex items-center gap-2">
              {icon || <BookOpen className="w-4 h-4 shrink-0" style={{ color: accentColor }} />}
              <div className="text-sm truncate text-center">
                <span className="text-foreground font-medium">{title}</span>
                <span className="text-muted-foreground hidden sm:inline"> — {author}</span>
              </div>
            </div>
            {currentChapterLabel && (
              <span className="text-xs text-muted-foreground truncate max-w-[250px]">
                {currentChapterLabel}
              </span>
            )}
          </div>

          {/* Right: Controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => goToPrevRef.current()}
              className="p-2 hover:bg-accent rounded-md transition-colors disabled:opacity-30"
              disabled={!isReady}
              title="Previous chapter (←)"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => goToNextRef.current()}
              className="p-2 hover:bg-accent rounded-md transition-colors disabled:opacity-30"
              disabled={!isReady}
              title="Next chapter (→)"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            <div className="w-px h-6 bg-border hidden sm:block" />

            <div className="relative">
              <button
                onClick={() => setSettingsOpen(!settingsOpen)}
                className="p-2 hover:bg-accent rounded-md transition-colors"
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
              <ReaderSettings
                isOpen={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                fontSize={fontSize}
                onFontSizeChange={handleFontSizeChange}
                theme={readingTheme}
                onThemeChange={handleThemeChange}
                accentColor={accentColor}
              />
            </div>

            <button
              onClick={toggleFullscreen}
              className="p-2 hover:bg-accent rounded-md transition-colors"
              title="Fullscreen (F)"
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>

            {/* Bookmark quick-toggle */}
            <button
              onClick={handleSetBookmark}
              className="p-2 hover:bg-accent rounded-md transition-colors"
              title={currentBookmark ? "Update bookmark (B)" : "Set bookmark (B)"}
              disabled={!isReady}
            >
              {currentBookmark ? (
                <BookmarkCheck className="w-4 h-4" style={{ color: accentColor }} />
              ) : (
                <Bookmark className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Reader Content */}
      <main
        className="flex-1 flex items-stretch justify-center relative overflow-hidden"
        style={{ backgroundColor: themeStyles.bg }}
      >
        {/* EPUB Viewer — scrollable within the chapter */}
        <div className="w-full max-w-4xl flex flex-col overflow-y-auto">
          <div
            ref={viewerRef}
            className="flex-1"
            style={{
              backgroundColor: themeStyles.bg,
              visibility: !isLoading && !error ? "visible" : "hidden",
              minHeight: isFullscreen ? "calc(100vh - 100px)" : "calc(100vh - 140px)",
            }}
          />
        </div>

        {/* Loading overlay */}
        {isLoading && !error && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: themeStyles.bg }}>
            <div className="text-center space-y-4">
              <Loader2 className="w-10 h-10 animate-spin mx-auto" style={{ color: accentColor }} />
              <div>
                <p className="text-foreground font-medium">Loading book…</p>
                <p className="text-muted-foreground text-sm mt-1">Preparing chapters and table of contents</p>
              </div>
            </div>
          </div>
        )}

        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-card p-8">
            <div className="text-center space-y-4 max-w-md">
              <BookOpen className="w-16 h-16 mx-auto" style={{ color: accentColor }} />
              <h3 className="text-foreground">Failed to Load</h3>
              <p className="text-muted-foreground">{error}</p>
              <button
                onClick={onBack}
                className="px-4 py-2 rounded-md text-white transition-colors"
                style={{ backgroundColor: accentColor }}
              >
                Go Back
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Progress Bar */}
      {isReady && (
        <div
          className={`sticky bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur transition-transform duration-300 ${
            toolbarVisible ? "translate-y-0" : "translate-y-full"
          }`}
        >
          <div className="h-1 w-full bg-secondary">
            <div
              className="h-full transition-all duration-500 ease-out rounded-r"
              style={{ width: `${percentage}%`, backgroundColor: accentColor }}
            />
          </div>

          <div className="flex items-center justify-between px-4 sm:px-6 py-2 max-w-7xl mx-auto">
            <div className="text-xs text-muted-foreground">
              {currentChapterLabel ? (
                <span className="truncate max-w-[200px] inline-block align-bottom">
                  {currentChapterLabel}
                </span>
              ) : currentLocationIndex > 0 && totalLocations > 0 ? (
                <span>Location {currentLocationIndex} of {totalLocations}</span>
              ) : (
                <span>Reading…</span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-medium" style={{ color: accentColor }}>
                {percentage}%
              </span>
            </div>

            <div className="text-xs text-muted-foreground hidden sm:block">
              <span className="opacity-60">
                Scroll to read · ← → chapters · T contents · B bookmark · F fullscreen
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}