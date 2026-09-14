import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getPublicSupabaseConfig, getServiceRoleKey } from "@/lib/env";

/**
 * Service-role Supabase client. **This bypasses RLS.**
 *
 * The planning audit (finding #7) called out exactly this risk: reaching for
 * the service-role key for convenience silently removes the tenant boundary.
 * So its use is restricted to code paths that have no user session and
 * therefore cannot use the request-scoped client. Today there are exactly two:
 *
 *   - the automations cron runner (app/api/cron/automations), and
 *   - the public widget's AI turn (app/api/widget/message), which answers a
 *     visitor who has no account at all.
 *
 * The widget case is the one to be careful about, because it IS a request
 * handler. What makes it safe is that the tenant is not taken from the
 * request: the visitor sends an opaque session token, the database resolves it
 * to an organization inside widget_send(), and that id — never anything the
 * caller supplied — is what the agent runs against.
 *
 * Rules for any code that uses this client:
 *   1. Never call it from a request handler that acts on behalf of a signed-in
 *      user; use the request-scoped client, so RLS applies.
 *   2. Filter EVERY query by organization_id explicitly. RLS is not there to
 *      catch a mistake, so the scoping has to be written out.
 *   3. Never let a request choose the organization_id it operates on.
 */
export function createServiceRoleClient() {
  const { url } = getPublicSupabaseConfig();
  return createSupabaseClient(url, getServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
