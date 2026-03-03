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
} from "lucide-react";
import ePub from "epubjs";
import { toast } from "sonner";
import { ReaderSidebar } from "./ReaderSidebar";
import { ReaderSettings, ReadingTheme, getThemeStyles } from "./ReaderSettings";
import { saveProgress, loadProgress } from "../../services/readingProgress";

interface TocItem {
  id: string;
  href: string;
  label: string;
  subitems?: TocItem[];
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
  } catch (e) {
    // localStorage may not be available
  }
  return { fontSize: 16, theme: "light" };
}

function persistSettings(fontSize: number, theme: ReadingTheme) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ fontSize, theme }));
  } catch {}
}

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

  // Progress
  const [percentage, setPercentage] = useState(0);
  const [currentLocation, setCurrentLocation] = useState("");
  const [totalLocations, setTotalLocations] = useState(0);
  const [currentLocationIndex, setCurrentLocationIndex] = useState(0);

  // Settings
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fontSize, setFontSize] = useState(() => loadSettingsFromStorage().fontSize);
  const [readingTheme, setReadingTheme] = useState<ReadingTheme>(() => loadSettingsFromStorage().theme);

  // Fullscreen
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Track toolbar visibility (auto-hide in fullscreen)
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Navigation
  const goToPrevPage = useCallback(() => {
    if (renditionRef.current && isReady) {
      try { renditionRef.current.prev(); } catch {}
    }
  }, [isReady]);

  const goToNextPage = useCallback(() => {
    if (renditionRef.current && isReady) {
      try { renditionRef.current.next(); } catch {}
    }
  }, [isReady]);

  // Apply theme and font size to rendition
  const applyStyles = useCallback((rendition: any, fs: number, theme: ReadingTheme) => {
    const styles = getThemeStyles(theme);
    rendition.themes.default({
      "body": {
        "font-size": `${fs}px !important`,
        "line-height": "1.7 !important",
        "color": `${styles.fg} !important`,
        "background-color": `${styles.bg} !important`,
        "padding": "0 16px !important",
      },
      "p": {
        "font-size": `${fs}px !important`,
        "line-height": "1.7 !important",
        "color": `${styles.fg} !important`,
      },
      "a": {
        "color": `${styles.linkColor} !important`,
      },
      "h1, h2, h3, h4, h5, h6": {
        "color": `${styles.fg} !important`,
      },
      "span, div, li, td, th, blockquote, em, strong, i, b": {
        "color": `${styles.fg} !important`,
      },
    });
  }, []);

  // Font size change handler
  const handleFontSizeChange = useCallback((newSize: number) => {
    setFontSize(newSize);
    persistSettings(newSize, readingTheme);
    if (renditionRef.current) {
      applyStyles(renditionRef.current, newSize, readingTheme);
    }
  }, [readingTheme, applyStyles]);

  // Theme change handler
  const handleThemeChange = useCallback((newTheme: ReadingTheme) => {
    setReadingTheme(newTheme);
    persistSettings(fontSize, newTheme);
    if (renditionRef.current) {
      applyStyles(renditionRef.current, fontSize, newTheme);
    }
  }, [fontSize, applyStyles]);

  // Fullscreen toggle — uses CSS-based fullscreen (fixed positioning)
  // because the native Fullscreen API is blocked inside iframes.
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  // Resize rendition when fullscreen changes
  useEffect(() => {
    if (renditionRef.current) {
      // Small delay to let CSS transition apply before resizing
      const timer = setTimeout(() => {
        try { renditionRef.current?.resize(); } catch (e) { /* ignore */ }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isFullscreen]);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Show toolbar on mouse move, auto-hide in fullscreen
  const showToolbar = useCallback(() => {
    setToolbarVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (isFullscreen) {
      hideTimerRef.current = setTimeout(() => setToolbarVisible(false), 3000);
    }
  }, [isFullscreen]);

  // Auto-save progress (debounced)
  const debouncedSave = useCallback((cfi: string, pct: number) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveProgress(bookId, cfi, pct, accessToken);
    }, 1500);
  }, [bookId, accessToken]);

  // Load and render the EPUB
  useEffect(() => {
    if (!viewerRef.current) return;
    let cancelled = false;

    async function loadBook() {
      try {
        setIsLoading(true);
        setError(null);

        const bookInstance = ePub(arrayBuffer as any);
        bookInstanceRef.current = bookInstance;

        const rendition = bookInstance.renderTo(viewerRef.current!, {
          width: "100%",
          height: "100%",
          spread: "none",
          flow: "paginated",
        });
        renditionRef.current = rendition;

        // Apply initial styles
        applyStyles(rendition, fontSize, readingTheme);

        // Arrow keys inside iframe
        rendition.on("keydown", (e: KeyboardEvent) => {
          if (e.key === "ArrowLeft") { e.preventDefault(); rendition.prev(); }
          else if (e.key === "ArrowRight") { e.preventDefault(); rendition.next(); }
        });

        // Touch swipe support
        let touchStartX = 0;
        let touchStartY = 0;
        rendition.on("touchstart", (e: TouchEvent) => {
          touchStartX = e.changedTouches[0].screenX;
          touchStartY = e.changedTouches[0].screenY;
        });
        rendition.on("touchend", (e: TouchEvent) => {
          const dx = e.changedTouches[0].screenX - touchStartX;
          const dy = e.changedTouches[0].screenY - touchStartY;
          if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
            if (dx > 0) rendition.prev();
            else rendition.next();
          }
        });

        // Load TOC
        const nav = await bookInstance.loaded.navigation;
        if (nav?.toc) {
          const tocItems: TocItem[] = nav.toc.map((item: any) => ({
            id: item.id || item.href,
            href: item.href,
            label: item.label,
            subitems: item.subitems?.map((sub: any) => ({
              id: sub.id || sub.href,
              href: sub.href,
              label: sub.label,
            })) || [],
          }));
          setToc(tocItems);
        }

        // Generate locations for progress tracking
        await bookInstance.ready;
        // Generate locations with a reasonable char count per page
        await bookInstance.locations.generate(1024);
        setTotalLocations(bookInstance.locations.length());

        // Track location changes
        rendition.on("relocated", (location: any) => {
          if (cancelled) return;

          // Update percentage
          const pct = location.start?.percentage ?? 0;
          setPercentage(Math.round(pct * 100));

          // Update location index
          const locIndex = bookInstance.locations.locationFromCfi(location.start.cfi);
          setCurrentLocationIndex(locIndex !== undefined && locIndex !== -1 ? locIndex + 1 : 0);

          // Update current CFI
          setCurrentLocation(location.start.cfi);

          // Find current chapter
          if (location.start?.href) {
            setCurrentChapter(location.start.href);
          }

          // Auto-save progress
          debouncedSave(location.start.cfi, pct);
        });

        // Restore saved progress or display first page
        const progress = await loadProgress(bookId, accessToken);
        if (progress?.cfi) {
          await rendition.display(progress.cfi);
          toast("Restored your reading position", { duration: 3000, icon: "📖" });
        } else {
          await rendition.display();
        }

        if (cancelled) return;
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
      try { renditionRef.current?.destroy(); } catch {}
      try { bookInstanceRef.current?.destroy(); } catch {}
    };
  }, [arrayBuffer]);

  // TOC navigation
  const handleTocNavigate = useCallback((href: string) => {
    if (renditionRef.current) {
      renditionRef.current.display(href);
    }
  }, []);

  // Keyboard navigation (parent window)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "ArrowLeft") { e.preventDefault(); goToPrevPage(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); goToNextPage(); }
      else if (e.key === "f" && !e.ctrlKey && !e.metaKey) { toggleFullscreen(); }
      else if (e.key === "t" && !e.ctrlKey && !e.metaKey) { setSidebarOpen((p) => !p); }
      else if (e.key === "Escape") {
        if (isFullscreen) setIsFullscreen(false);
        else if (sidebarOpen) setSidebarOpen(false);
        else if (settingsOpen) setSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [isReady, goToPrevPage, goToNextPage, toggleFullscreen, sidebarOpen, settingsOpen, isFullscreen]);

  // Get reading theme background for the container
  const themeStyles = getThemeStyles(readingTheme);

  return (
    <div
      ref={containerRef}
      className={`flex flex-col bg-background ${
        isFullscreen
          ? "fixed inset-0 z-[9999]"
          : "min-h-screen"
      }`}
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

          {/* Center: Book info */}
          <div className="flex items-center gap-2 min-w-0 flex-1 justify-center">
            {icon || <BookOpen className="w-4 h-4 shrink-0" style={{ color: accentColor }} />}
            <div className="text-sm truncate text-center">
              <span className="text-foreground font-medium">{title}</span>
              <span className="text-muted-foreground hidden sm:inline"> — {author}</span>
            </div>
          </div>

          {/* Right: Controls */}
          <div className="flex items-center gap-1">
            {/* Page navigation */}
            <button
              onClick={goToPrevPage}
              className="p-2 hover:bg-accent rounded-md transition-colors disabled:opacity-30"
              disabled={!isReady}
              title="Previous page (←)"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={goToNextPage}
              className="p-2 hover:bg-accent rounded-md transition-colors disabled:opacity-30"
              disabled={!isReady}
              title="Next page (→)"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            <div className="w-px h-6 bg-border hidden sm:block" />

            {/* Settings */}
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

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="p-2 hover:bg-accent rounded-md transition-colors"
              title="Fullscreen (F)"
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Reader Content */}
      <main className="flex-1 flex items-stretch justify-center relative" style={{ backgroundColor: themeStyles.bg }}>
        {/* Left click zone */}
        {isReady && (
          <button
            onClick={goToPrevPage}
            className="absolute left-0 top-0 bottom-12 w-[15%] z-10 cursor-w-resize opacity-0 hover:opacity-100 transition-opacity"
            aria-label="Previous page"
          >
            <div className="h-full flex items-center justify-center">
              <div className="bg-black/5 rounded-r-lg p-3">
                <ChevronLeft className="w-6 h-6" style={{ color: themeStyles.fg, opacity: 0.3 }} />
              </div>
            </div>
          </button>
        )}

        {/* EPUB Viewer */}
        <div className="w-full max-w-4xl flex flex-col">
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

        {/* Right click zone */}
        {isReady && (
          <button
            onClick={goToNextPage}
            className="absolute right-0 top-0 bottom-12 w-[15%] z-10 cursor-e-resize opacity-0 hover:opacity-100 transition-opacity"
            aria-label="Next page"
          >
            <div className="h-full flex items-center justify-center">
              <div className="bg-black/5 rounded-l-lg p-3">
                <ChevronRight className="w-6 h-6" style={{ color: themeStyles.fg, opacity: 0.3 }} />
              </div>
            </div>
          </button>
        )}

        {/* Loading overlay */}
        {isLoading && !error && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: themeStyles.bg }}>
            <div className="text-center space-y-4">
              <Loader2 className="w-10 h-10 animate-spin mx-auto" style={{ color: accentColor }} />
              <div>
                <p className="text-foreground font-medium">Loading book…</p>
                <p className="text-muted-foreground text-sm mt-1">Preparing pages and table of contents</p>
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
          {/* Thin progress line */}
          <div className="h-1 w-full bg-secondary">
            <div
              className="h-full transition-all duration-500 ease-out rounded-r"
              style={{ width: `${percentage}%`, backgroundColor: accentColor }}
            />
          </div>

          <div className="flex items-center justify-between px-4 sm:px-6 py-2 max-w-7xl mx-auto">
            <div className="text-xs text-muted-foreground">
              {currentLocationIndex > 0 && totalLocations > 0 ? (
                <span>
                  Location {currentLocationIndex} of {totalLocations}
                </span>
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
                ← → navigate · T contents · F fullscreen
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}