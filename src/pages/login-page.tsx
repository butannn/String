import { useMemo, useState } from "react";
import { Navigate } from "@tanstack/react-router";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginPage() {
  const auth = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const title = useMemo(
    () => (mode === "login" ? "Welcome back" : "Create account"),
    [mode],
  );

  if (auth.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center">Loading...</div>
    );
  }

  if (auth.user) {
    return <Navigate to="/app" />;
  }

  return (
    <main className="grid min-h-screen place-items-center bg-zinc-100 p-4">
      <section className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <p className="mb-2 font-serif text-sm tracking-[0.2em] text-zinc-500">
          STRING
        </p>
        <h1 className="mb-2 font-serif text-3xl text-zinc-900">{title}</h1>
        <p className="mb-6 text-sm text-zinc-600">
          Minimal username and password access.
        </p>

        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            setIsSubmitting(true);
            try {
              if (mode === "login") {
                await auth.signIn(username, password);
              } else {
                await auth.signUp(username, password);
              }
            } catch (submissionError) {
              const message =
                submissionError instanceof Error
                  ? submissionError.message
                  : "Unexpected authentication error";
              setError(message);
            } finally {
              setIsSubmitting(false);
            }
          }}
        >
          <Input
            placeholder="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
          />
          <Input
            type="password"
            placeholder="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            required
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting
              ? "Please wait..."
              : mode === "login"
                ? "Login"
                : "Register"}
          </Button>
        </form>

        <Button
          variant="ghost"
          className="mt-3 w-full"
          onClick={() => {
            setError(null);
            setMode((previousMode) =>
              previousMode === "login" ? "register" : "login",
            );
          }}
        >
          {mode === "login"
            ? "Need an account? Register"
            : "Already have an account? Login"}
        </Button>
      </section>
    </main>
  );
}
