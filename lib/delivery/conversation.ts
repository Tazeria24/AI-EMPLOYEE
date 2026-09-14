import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeliveryProvider, DeliveryResult, DeliveryTarget } from "./types";

/**
 * Posts the follow-up into the lead's conversation.
 *
 * IMPORTANT LIMITATION: until the website widget (Milestone 09) or WhatsApp
 * (Milestone 10) exists, there is no channel carrying conversation messages to
 * the customer. A follow-up delivered this way is recorded and visible in the
 * inbox, but the customer does not receive it yet. Email is currently the only
 * channel that actually leaves the building.
 */
export const conversationDelivery: DeliveryProvider = {
  channel: "conversation",

  canDeliver(target: DeliveryTarget): boolean {
    return target.conversationId !== null;
  },

  async send(
    supabase: SupabaseClient,
    target: DeliveryTarget,
    message: string,
  ): Promise<DeliveryResult> {
    if (!target.conversationId) {
      return { ok: false, error: "This lead has no conversation to post into." };
    }

    const { data, error } = await supabase
      .from("messages")
      .insert({
        organization_id: target.organizationId,
        conversation_id: target.conversationId,
        sender_type: "ai",
        content: message,
        metadata: { automated_follow_up: true },
      })
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, error: "Could not post the follow-up message." };
    }

    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", target.conversationId)
      .eq("organization_id", target.organizationId);

    return {
      ok: true,
      channel: "conversation",
      reference: (data as { id: string }).id,
    };
  },
};
