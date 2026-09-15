import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getPublicSupabaseConfig, getServiceRoleKey } from "@/lib/env";

/**
 * Service-role Supabase client. **This bypasses RLS.**
 *
 * The planning audit (finding #7) called out exactly this risk: reaching for
 * the service-role key for convenience silently removes the tenant boundary.
 * So its use is restricted to code paths that cannot use the request-scoped
 * client, and they fall into exactly two shapes:
 *
 *   **A. Background jobs with no session at all**
 *     - app/api/cron/automations  (follow-up scheduling and sending)
 *     - app/api/cron/retention    (the NDPR retention sweep)
 *
 *   **B. Request handlers whose caller has no account, where the tenant is
 *        resolved BY THE DATABASE rather than named by the caller**
 *     - app/api/widget/message     (org resolved from a session token)
 *     - app/api/webhooks/whatsapp  (org resolved from phone_number_id)
 *     - app/api/webhooks/payments  (org echoed back, then confirmed to exist)
 *
 * Shape B is the one to be careful about, because these ARE request handlers.
 * What makes them safe is the resolution rule, not their number: a caller
 * hands over an opaque credential, the database says which organization that
 * belongs to, and only that id is used. Earlier ADRs tried to cap the count
 * ("the second and last"); the count kept moving and the rule did not, so the
 * rule is what this comment states.
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
