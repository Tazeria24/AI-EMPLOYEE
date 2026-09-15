import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getPublicSupabaseConfig } from "@/lib/env";

/**
 * Anon-key Supabase client with no session, for the public widget endpoints.
 *
 * The `anon` role has no table privileges at all (migration 0008) — only
 * EXECUTE on the three widget functions. So this client can do exactly what
 * those functions allow and nothing else, which is why the public path uses it
 * rather than the service-role client.
 */
export function createPublicClient() {
  const { url, anonKey } = getPublicSupabaseConfig();
  return createSupabaseClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
