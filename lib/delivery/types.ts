export type DeliveryChannel = "conversation" | "email" | "whatsapp";

export interface DeliveryTarget {
  organizationId: string;
  /** Present when the lead came from a conversation. */
  conversationId: string | null;
  customerEmail: string | null;
  /** The customer's WhatsApp number, when they have reached us that way. */
  customerWaId: string | null;
  /**
   * When the customer last messaged us. WhatsApp only permits free-form
   * replies within 24 hours of this (lib/whatsapp/window.ts).
   */
  lastInboundAt: string | null;
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
