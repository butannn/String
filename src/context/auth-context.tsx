import {
  type PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AuthApiError, type Session, type User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { normalizeUsername, usernameToEmail } from "@/lib/auth";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION immediately in Supabase v2,
    // so getSession() is redundant and can cause race-condition state flips.
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      isLoading,
      async signIn(username: string, password: string) {
        const email = usernameToEmail(username);
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          throw error;
        }
      },
      async signUp(username: string, password: string) {
        const email = usernameToEmail(username);
        const cleanUsername = normalizeUsername(username);
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) {
          if (
            error instanceof AuthApiError &&
            error.code === "over_email_send_rate_limit"
          ) {
            throw new Error(
              'Signup is temporarily rate-limited by Supabase email sending. For username-only auth, disable "Confirm email" in Supabase Dashboard > Authentication > Providers > Email and retry.',
            );
          }
          throw error;
        }

        // If session is null after signup, email confirmation is still required.
        // Sign out immediately to cancel any temporary session Supabase may have
        // created (which would cause a SIGNED_IN → SIGNED_OUT flash/redirect loop).
        if (!data.session) {
          await supabase.auth.signOut();
          throw new Error(
            'Account created but sign-in requires email confirmation. Disable "Confirm email" in Supabase Dashboard > Authentication > Providers > Email for username-only auth.',
          );
        }

        const newUser = data.user;
        if (newUser) {
          const { error: profileError } = await supabase
            .from("profiles")
            .upsert({ id: newUser.id, username: cleanUsername });

          if (profileError) {
            throw profileError;
          }
        }
      },
      async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) {
          throw error;
        }
      },
    }),
    [isLoading, session, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
