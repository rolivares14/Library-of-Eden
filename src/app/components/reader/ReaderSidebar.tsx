import { X, BookOpen, ChevronRight } from "lucide-react";

interface TocItem {
  id: string;
  href: string;
  label: string;
  subitems?: TocItem[];
}

interface ReaderSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  toc: TocItem[];
  currentChapter: string;
  onNavigate: (href: string) => void;
  accentColor?: string;
}

export function ReaderSidebar({
  isOpen,
  onClose,
  toc,
  currentChapter,
  onNavigate,
  accentColor = "var(--primary)",
}: ReaderSidebarProps) {
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
            <h3 className="text-foreground text-base font-medium">Table of Contents</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-accent transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* TOC List */}
        <div className="flex-1 overflow-y-auto py-2 px-2">
          {toc.length > 0 ? (
            <ul className="space-y-0.5">
              {toc.map((item) => renderTocItem(item))}
            </ul>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No table of contents available
            </div>
          )}
        </div>
      </div>
    </>
  );
}
