import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeliveryProvider, DeliveryResult, DeliveryTarget } from "./types";

const RESEND_URL = "https://api.resend.com/emails";

/**
 * Email follow-up via Resend (CLAUDE.md's chosen email vendor).
 *
 * The API key is read lazily at send time, like the other providers, so
 * importing this module never requires configuration.
 */
export const emailDelivery: DeliveryProvider = {
  channel: "email",

  canDeliver(target: DeliveryTarget): boolean {
    return Boolean(target.customerEmail);
  },

  async send(
    _supabase: SupabaseClient,
    target: DeliveryTarget,
    message: string,
  ): Promise<DeliveryResult> {
    void _supabase;
    if (!target.customerEmail) {
      return { ok: false, error: "This lead has no email address." };
    }

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.FOLLOW_UP_FROM_EMAIL;
    if (!apiKey || !from) {
      return {
        ok: false,
        error:
          "Email follow-up is not configured (RESEND_API_KEY / FOLLOW_UP_FROM_EMAIL).",
      };
    }

    try {
      const response = await fetch(RESEND_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from,
          to: [target.customerEmail],
          subject: `Following up — ${target.businessName}`,
          text: message,
        }),
      });

      if (!response.ok) {
        // Never surface the provider body: it can echo recipient details.
        return { ok: false, error: `Email delivery failed (${response.status}).` };
      }

      const payload = (await response.json()) as { id?: string };
      return { ok: true, channel: "email", reference: payload.id ?? null };
    } catch {
      return { ok: false, error: "Email delivery failed." };
    }
  },
};
