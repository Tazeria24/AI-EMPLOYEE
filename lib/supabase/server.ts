import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getPublicSupabaseConfig } from "@/lib/env";

/**
 * Supabase client for server components, route handlers and server actions.
 * Reads/writes the auth session via cookies and uses the public anon key so
 * RLS enforces tenant access on behalf of the authenticated user.
 *
 * Importing next/headers keeps this module server-only.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getPublicSupabaseConfig();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // `setAll` was called from a Server Component. This can be ignored
          // when middleware is responsible for refreshing the session.
        }
      },
    },
  });
}
