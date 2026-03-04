import { useState } from "react";
import { X, BookOpen, ChevronRight, Bookmark, BookmarkCheck } from "lucide-react";

interface TocItem {
  id: string;
  href: string;
  label: string;
  subitems?: TocItem[];
}

export interface BookmarkData {
  cfi: string | null;
  tocIndex: number;
  chapterLabel: string;
  percentage: number;
  updatedAt?: string;
}

type SidebarTab = "toc" | "bookmark";

interface ReaderSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  toc: TocItem[];
  currentChapter: string;
  onNavigate: (href: string) => void;
  accentColor?: string;
  // Bookmark props
  bookmark: BookmarkData | null;
  onGoToBookmark: () => void;
  onSetBookmark: () => void;
  onRemoveBookmark: () => void;
  isLoggedIn: boolean;
  currentChapterLabel: string;
}

export function ReaderSidebar({
  isOpen,
  onClose,
  toc,
  currentChapter,
  onNavigate,
  accentColor = "var(--primary)",
  bookmark,
  onGoToBookmark,
  onSetBookmark,
  onRemoveBookmark,
  isLoggedIn,
  currentChapterLabel,
}: ReaderSidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>("toc");

  const renderTocItem = (item: TocItem, depth: number = 0) => {
    const isActive = currentChapter === item.href;
    return (
      <li key={item.id || item.href}>
        <button
          onClick={() => {
            onNavigate(item.href);
            onClose();
          }}
          className="w-full text-left px-4 py-2.5 text-sm transition-colors rounded-md flex items-center gap-2 group"
          style={{
            paddingLeft: `${16 + depth * 16}px`,
            backgroundColor: isActive ? `color-mix(in srgb, ${accentColor} 15%, transparent)` : undefined,
            color: isActive ? accentColor : undefined,
          }}
          title={item.label.trim()}
        >
          {isActive && (
            <ChevronRight className="w-3 h-3 shrink-0" style={{ color: accentColor }} />
          )}
          <span className={`line-clamp-2 ${isActive ? "font-medium" : "text-muted-foreground hover:text-foreground"}`}>
            {item.label.trim()}
          </span>
        </button>
        {item.subitems && item.subitems.length > 0 && (
          <ul>
            {item.subitems.map((sub) => renderTocItem(sub, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed top-0 left-0 h-full w-80 max-w-[85vw] bg-card border-r border-border z-50 flex flex-col transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5" style={{ color: accentColor }} />
            <h3 className="text-foreground text-base font-medium">
              {activeTab === "toc" ? "Table of Contents" : "Bookmark"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-accent transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab("toc")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
              activeTab === "toc"
                ? "border-b-2 text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            style={activeTab === "toc" ? { borderBottomColor: accentColor, color: accentColor } : {}}
          >
            <BookOpen className="w-4 h-4" />
            Contents
          </button>
          <button
            onClick={() => setActiveTab("bookmark")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
              activeTab === "bookmark"
                ? "border-b-2 text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            style={activeTab === "bookmark" ? { borderBottomColor: accentColor, color: accentColor } : {}}
          >
            <Bookmark className="w-4 h-4" />
            Bookmark
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto py-2 px-2">
          {activeTab === "toc" ? (
            /* ── TOC Tab ── */
            toc.length > 0 ? (
              <ul className="space-y-0.5">
                {toc.map((item) => renderTocItem(item))}
              </ul>
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No table of contents available
              </div>
            )
          ) : (
            /* ── Bookmark Tab ── */
            <div className="px-2 py-4 space-y-5">
              {!isLoggedIn ? (
                <div className="text-center py-8 space-y-2">
                  <Bookmark className="w-10 h-10 mx-auto text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground text-sm">
                    Sign in to save bookmarks
                  </p>
                  <p className="text-muted-foreground/60 text-xs">
                    Bookmarks are saved to your account so they persist across devices
                  </p>
                </div>
              ) : (
                <>
                  {/* Current position */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Current Position
                    </h4>
                    <div className="bg-accent/40 rounded-lg px-4 py-3 text-sm">
                      <p className="text-foreground font-medium truncate">
                        {currentChapterLabel || "Loading…"}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        onSetBookmark();
                      }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
                      style={{ backgroundColor: accentColor }}
                    >
                      <Bookmark className="w-4 h-4" />
                      {bookmark ? "Update Bookmark" : "Set Bookmark Here"}
                    </button>
                  </div>

                  {/* Saved bookmark */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Saved Bookmark
                    </h4>
                    {bookmark ? (
                      <div className="border border-border rounded-lg overflow-hidden">
                        <div className="px-4 py-3 space-y-1">
                          <div className="flex items-center gap-2">
                            <BookmarkCheck className="w-4 h-4 shrink-0" style={{ color: accentColor }} />
                            <p className="text-foreground text-sm font-medium truncate">
                              {bookmark.chapterLabel}
                            </p>
                          </div>
                          <p className="text-muted-foreground text-xs">
                            {bookmark.percentage}% through book
                            {bookmark.updatedAt && (
                              <> · saved {new Date(bookmark.updatedAt).toLocaleDateString()}</>
                            )}
                          </p>
                        </div>
                        <div className="flex border-t border-border">
                          <button
                            onClick={() => {
                              onGoToBookmark();
                              onClose();
                            }}
                            className="flex-1 py-2.5 text-sm font-medium transition-colors hover:bg-accent/50 text-white"
                          >
                            Go to bookmark
                          </button>
                          <div className="w-px bg-border" />
                          <button
                            onClick={onRemoveBookmark}
                            className="flex-1 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-6 space-y-2 border border-dashed border-border rounded-lg">
                        <Bookmark className="w-8 h-8 mx-auto text-muted-foreground opacity-30" />
                        <p className="text-muted-foreground text-sm">
                          No bookmark set
                        </p>
                        <p className="text-muted-foreground/60 text-xs">
                          Tap "Set Bookmark Here" to save your spot
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}