import { createClient } from "@/lib/supabase/server";
import type { IntegrationEvent, WhatsAppIntegrationStatus } from "./types";

/**
 * The tenant's WhatsApp connection, read through
 * `whatsapp_integration_status` — a view that reports whether each credential
 * is set without ever returning one. The dashboard has no read privilege on
 * the secret columns themselves (migration 0009).
 */
export async function getWhatsAppStatus(): Promise<WhatsAppIntegrationStatus | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("whatsapp_integration_status")
    .select(
      "organization_id, phone_number_id, waba_id, display_phone_number, enabled, has_verify_token, has_app_secret, has_access_token, updated_at",
    )
    .maybeSingle();
  return (data as WhatsAppIntegrationStatus | null) ?? null;
}

/** Recent webhook deliveries, newest first (RLS-scoped). */
export async function listIntegrationEvents(limit = 20): Promise<IntegrationEvent[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("integration_events")
    .select("id, provider, external_event_id, event_type, status, error, processed_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as IntegrationEvent[] | null) ?? [];
}
