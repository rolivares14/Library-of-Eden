import { useState, useRef, useEffect } from "react";
import { BookOpen, LogIn, LogOut, User, ChevronDown, Skull, Shield } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";

export function Header() {
  const { user, displayName, loading, signOut, isAdmin } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    setMenuOpen(false);
    await signOut();
    toast.success("Signed out successfully");
    navigate("/");
  };

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
      <div className="container mx-auto px-6 py-6 flex items-center justify-between">
        {/* Logo */}
        <Link
          to="/"
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          <BookOpen className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-foreground">Library of Eden</h1>
            <p className="text-sm text-muted-foreground">Free Digital Library</p>
          </div>
        </Link>

        {/* Auth Section */}
        <div className="flex items-center gap-3">
          {loading ? (
            <div className="w-24 h-10 bg-secondary rounded-lg" />
          ) : user ? (
            /* Signed-in user menu */
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((prev) => !prev)}
                className="flex items-center gap-2 px-3 py-2 bg-secondary border border-border rounded-lg hover:bg-accent transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center">
                  <span className="text-xs text-primary-foreground font-semibold">
                    {(displayName || user.email || "U")[0].toUpperCase()}
                  </span>
                </div>
                <span className="text-sm text-foreground hidden sm:inline max-w-[120px] truncate">
                  {displayName || "Reader"}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-card border border-border rounded-lg shadow-xl overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-border">
                    <p className="text-sm text-foreground font-medium truncate">
                      {displayName || "Reader"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {user.email}
                    </p>
                  </div>

                  {/* Admin Badge */}
                  {isAdmin && (
                    <div className="px-4 py-2 border-b border-border flex items-center gap-2">
                      <Shield className="w-3.5 h-3.5 text-primary" />
                      <span className="text-xs text-primary font-medium">Admin</span>
                    </div>
                  )}

                  {/* Pirate Isle Link */}
                  <Link
                    to="/pirate"
                    onClick={() => setMenuOpen(false)}
                    className="w-full flex items-center gap-2 px-4 py-3 text-sm text-[#d4a832] hover:text-[#e8b84a] hover:bg-accent transition-colors border-b border-border"
                  >
                    <Skull className="w-4 h-4" />
                    Pirate Isle
                  </Link>

                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Signed-out buttons */
            <div className="flex items-center gap-2">
              <Link
                to="/signin"
                className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <LogIn className="w-4 h-4" />
                <span className="hidden sm:inline">Sign In</span>
              </Link>
              <Link
                to="/signup"
                className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                <User className="w-4 h-4" />
                <span className="hidden sm:inline">Sign Up</span>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}