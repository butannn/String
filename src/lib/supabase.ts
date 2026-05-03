import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

if (
  supabaseAnonKey === "YOUR_SUPABASE_ANON_KEY" ||
  supabaseAnonKey.startsWith("YOUR_")
) {
  throw new Error(
    "Invalid Supabase anon key in .env. Replace VITE_SUPABASE_ANON_KEY with your real anon public key from Supabase Project Settings > API, then restart the dev server.",
  );
}

// Use a promise-queue lock instead of the Web Locks API to prevent orphaned
// locks caused by React Strict Mode double-mounting components.
const pendingLocks = new Map<string, Promise<unknown>>();
function promiseLock<T>(
  name: string,
  _acquireTimeout: number,
  fn: () => Promise<T>,
): Promise<T> {
  const current = pendingLocks.get(name) ?? Promise.resolve();
  const next = current.then(fn);
  pendingLocks.set(name, next.catch(() => {}));
  return next;
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { lock: promiseLock },
});
