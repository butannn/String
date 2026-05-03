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

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
