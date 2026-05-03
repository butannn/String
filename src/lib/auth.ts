export function normalizeUsername(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "");
}

export function usernameToEmail(username: string) {
  const clean = normalizeUsername(username);
  if (!clean) {
    throw new Error("Please provide a valid username");
  }

  // Supabase Auth requires an email; use a guaranteed-valid domain for username-only UX.
  return `${clean}@example.com`;
}
