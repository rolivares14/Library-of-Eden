import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "../services/supabaseClient";
import { checkAdminStatus } from "../services/adminApi";
import type { User, Session } from "@supabase/supabase-js";

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  displayName: string | null;
  isAdmin: boolean;
}

interface AuthContextType extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    displayName: null,
    isAdmin: false,
  });

  // Check admin status whenever session changes
  useEffect(() => {
    if (state.session?.access_token) {
      checkAdminStatus(state.session.access_token).then((isAdmin) => {
        setState((prev) => ({ ...prev, isAdmin }));
      });
    } else {
      setState((prev) => ({ ...prev, isAdmin: false }));
    }
  }, [state.session?.access_token]);

  useEffect(() => {
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState((prev) => ({
        ...prev,
        user: session?.user ?? null,
        session,
        loading: false,
        displayName: session?.user?.user_metadata?.name ?? null,
      }));
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setState((prev) => ({
          ...prev,
          user: session?.user ?? null,
          session,
          loading: false,
          displayName: session?.user?.user_metadata?.name ?? null,
        }));
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.error("Sign in error:", error.message);
      return { error: error.message };
    }
    return { error: null };
  };

  const signUp = async (email: string, password: string, name: string) => {
    try {
      const { serverUrl } = await import("../services/supabaseClient");
      const res = await fetch(`${serverUrl}/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${(await import("/utils/supabase/info")).publicAnonKey}`,
        },
        body: JSON.stringify({ email, password, name }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("Sign up error:", data.error);
        return { error: data.error || "Failed to create account" };
      }

      // Auto sign in after successful signup
      const signInResult = await signIn(email, password);
      return signInResult;
    } catch (err: any) {
      console.error("Sign up network error:", err);
      return { error: "Network error. Please try again." };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ ...state, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}