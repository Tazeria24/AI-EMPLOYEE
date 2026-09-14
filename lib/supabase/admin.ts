import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getPublicSupabaseConfig, getServiceRoleKey } from "@/lib/env";

/**
 * Service-role Supabase client. **This bypasses RLS.**
 *
 * The planning audit (finding #7) called out exactly this risk: reaching for
 * the service-role key for convenience silently removes the tenant boundary.
 * So its use is restricted to background jobs that have no user session and
 * therefore cannot use the request-scoped client — today that is only the
 * automations cron runner.
 *
 * Rules for any code that uses this client:
 *   1. Never call it from a request handler that acts on behalf of a user.
 *   2. Filter EVERY query by organization_id explicitly. RLS is not there to
 *      catch a mistake, so the scoping has to be written out.
 */
export function createServiceRoleClient() {
  const { url } = getPublicSupabaseConfig();
  return createSupabaseClient(url, getServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
