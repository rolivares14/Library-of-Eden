import { Outlet } from "react-router";
import { Header } from "../components/Header";

export function RootLayout() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <Outlet />
      
      {/* Footer */}
      <footer className="border-t border-border mt-16 py-8">
        <div className="container mx-auto px-6 text-center">
          <p className="text-sm text-muted-foreground">
            Library of Eden - Free Digital Library for Everyone
          </p>
        </div>
      </footer>
    </div>
  );
}
