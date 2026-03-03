import { X, Minus, Plus, Sun, Moon, Coffee } from "lucide-react";

export type ReadingTheme = "light" | "sepia" | "dark";

interface ReaderSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  theme: ReadingTheme;
  onThemeChange: (theme: ReadingTheme) => void;
  accentColor?: string;
}

const FONT_SIZE_MIN = 12;
const FONT_SIZE_MAX = 28;
const FONT_SIZE_STEP = 2;

const themes: { id: ReadingTheme; label: string; icon: typeof Sun; bg: string; fg: string }[] = [
  { id: "light", label: "Light", icon: Sun, bg: "#ffffff", fg: "#1a1a1a" },
  { id: "sepia", label: "Sepia", icon: Coffee, bg: "#f4ecd8", fg: "#5b4636" },
  { id: "dark", label: "Dark", icon: Moon, bg: "#0a1612", fg: "#e8f0ec" },
];

export function ReaderSettings({
  isOpen,
  onClose,
  fontSize,
  onFontSizeChange,
  theme,
  onThemeChange,
  accentColor = "var(--primary)",
}: ReaderSettingsProps) {
  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-4 top-14 w-72 bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h4 className="text-foreground text-sm font-medium">Reading Settings</h4>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-accent transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* Font Size */}
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground uppercase tracking-wider">
              Font Size
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => onFontSizeChange(Math.max(FONT_SIZE_MIN, fontSize - FONT_SIZE_STEP))}
                disabled={fontSize <= FONT_SIZE_MIN}
                className="p-2 rounded-md border border-border hover:bg-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Minus className="w-4 h-4" />
              </button>
              <div className="flex-1 text-center">
                <span className="text-foreground font-medium">{fontSize}px</span>
              </div>
              <button
                onClick={() => onFontSizeChange(Math.min(FONT_SIZE_MAX, fontSize + FONT_SIZE_STEP))}
                disabled={fontSize >= FONT_SIZE_MAX}
                className="p-2 rounded-md border border-border hover:bg-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            {/* Font size preview */}
            <div className="text-center py-2 rounded bg-secondary/50">
              <span style={{ fontSize: `${fontSize}px` }} className="text-foreground">
                Aa
              </span>
            </div>
          </div>

          {/* Reading Theme */}
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground uppercase tracking-wider">
              Reading Theme
            </label>
            <div className="grid grid-cols-3 gap-2">
              {themes.map((t) => {
                const Icon = t.icon;
                const isActive = theme === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => onThemeChange(t.id)}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all"
                    style={{
                      borderColor: isActive ? accentColor : "var(--border)",
                      backgroundColor: isActive ? `color-mix(in srgb, ${accentColor} 10%, transparent)` : undefined,
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-full border border-border flex items-center justify-center"
                      style={{ backgroundColor: t.bg }}
                    >
                      <Icon className="w-4 h-4" style={{ color: t.fg }} />
                    </div>
                    <span className={`text-xs ${isActive ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                      {t.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export function getThemeStyles(theme: ReadingTheme): { bg: string; fg: string; linkColor: string } {
  switch (theme) {
    case "light":
      return { bg: "#ffffff", fg: "#1a1a1a", linkColor: "#2563eb" };
    case "sepia":
      return { bg: "#f4ecd8", fg: "#5b4636", linkColor: "#8b5e3c" };
    case "dark":
      return { bg: "#0a1612", fg: "#e8f0ec", linkColor: "#5a9e7a" };
  }
}