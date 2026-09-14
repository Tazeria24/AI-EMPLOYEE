export type DeliveryChannel = "conversation" | "email";

export interface DeliveryTarget {
  organizationId: string;
  /** Present when the lead came from a conversation. */
  conversationId: string | null;
  customerEmail: string | null;
  customerName: string | null;
  businessName: string;
}

export type DeliveryResult =
  | { ok: true; channel: DeliveryChannel; reference: string | null }
  | { ok: false; error: string };

import type { SupabaseClient } from "@supabase/supabase-js";

export interface DeliveryProvider {
  readonly channel: DeliveryChannel;
  /** Whether this provider can reach this particular target. */
  canDeliver(target: DeliveryTarget): boolean;
  /**
   * `supabase` is injected because delivery can run from a background job with
   * no user session (the automations cron), where the request-scoped client is
   * unavailable.
   */
  send(
    supabase: SupabaseClient,
    target: DeliveryTarget,
    message: string,
  ): Promise<DeliveryResult>;
}
