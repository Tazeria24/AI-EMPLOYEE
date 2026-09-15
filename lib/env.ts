/**
 * Environment variable access with light validation.
 *
 * Conventions:
 * - NEXT_PUBLIC_* variables are safe to expose to the browser.
 * - Every other variable is a server-only secret and must never be imported
 *   into client components or returned to the client.
 * - Values are read lazily (inside functions) so a missing variable fails at
 *   the point of use with a clear message, and never breaks the build.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** Public Supabase configuration — safe for the browser. */
export function getPublicSupabaseConfig(): { url: string; anonKey: string } {
  return {
    url: required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    anonKey: required(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
  };
}

/**
 * Public Supabase configuration, or null when it is not configured.
 * Used where the app should still boot without Supabase env (e.g. middleware
 * on public pages), rather than throwing.
 */
export function getOptionalPublicSupabaseConfig(): {
  url: string;
  anonKey: string;
} | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/**
 * Server-only. The service-role key bypasses RLS, so it must only be read in
 * trusted server contexts (never in client code or request-scoped handlers
 * that act on behalf of a user). See ADR-011 / docs/SECURITY.md.
 */
export function getServiceRoleKey(): string {
  return required(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
