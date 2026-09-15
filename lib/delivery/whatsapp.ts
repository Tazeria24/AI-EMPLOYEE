import type { SupabaseClient } from "@supabase/supabase-js";
import { sendTextMessage } from "@/lib/whatsapp/client";
import { normalizeWaId } from "@/lib/whatsapp/validation";
import { isWithinServiceWindow } from "@/lib/whatsapp/window";
import type { DeliveryProvider, DeliveryResult, DeliveryTarget } from "./types";

/**
 * Delivers a follow-up over WhatsApp — the first channel that reaches a
 * customer who has closed the browser (ADR-050's gap, narrowed here).
 *
 * Two gates, in this order, before anything is sent:
 *
 *  1. **The integration must be enabled**, with credentials present. Connecting
 *     production WhatsApp is a founder decision, so a disabled integration is
 *     a refusal, not a fallback.
 *  2. **The 24-hour customer service window must be open.** Meta only allows
 *     free-form text within 24 hours of the customer's last inbound message;
 *     outside it a pre-approved template is required, which this milestone
 *     does not send. So an out-of-window follow-up is refused and recorded
 *     rather than attempted and rejected by Meta.
 */
export const whatsappDelivery: DeliveryProvider = {
  channel: "whatsapp",

  canDeliver(target: DeliveryTarget): boolean {
    return Boolean(target.customerWaId);
  },

  async send(
    supabase: SupabaseClient,
    target: DeliveryTarget,
    message: string,
  ): Promise<DeliveryResult> {
    const waId = target.customerWaId ? normalizeWaId(target.customerWaId) : "";
    if (!waId) {
      return { ok: false, error: "This customer has no WhatsApp number." };
    }

    // Service-role path: scope by organization_id explicitly (ADR-048 rule 2).
    const { data: integration } = await supabase
      .from("whatsapp_integrations")
      .select("phone_number_id, access_token, enabled")
      .eq("organization_id", target.organizationId)
      .maybeSingle();

    const typed = integration as
      | { phone_number_id: string | null; access_token: string | null; enabled: boolean }
      | null;

    if (!typed?.enabled || !typed.phone_number_id || !typed.access_token) {
      return { ok: false, error: "WhatsApp is not connected for this business." };
    }

    if (!isWithinServiceWindow(target.lastInboundAt)) {
      return {
        ok: false,
        error:
          "Outside WhatsApp's 24-hour reply window — a message template would be required.",
      };
    }

    const result = await sendTextMessage(
      { phoneNumberId: typed.phone_number_id, accessToken: typed.access_token },
      waId,
      message,
    );
    if (!result.ok) {
      return { ok: false, error: `Could not send the WhatsApp message (${result.error}).` };
    }

    // Mirror it into the conversation so the inbox shows what the customer saw.
    if (target.conversationId) {
      await supabase.from("messages").insert({
        organization_id: target.organizationId,
        conversation_id: target.conversationId,
        sender_type: "ai",
        content: message,
        metadata: { automated_follow_up: true, channel: "whatsapp" },
      });
    }

    return { ok: true, channel: "whatsapp", reference: result.externalId };
  },
};
