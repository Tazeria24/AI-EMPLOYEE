import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getChatProvider } from "@/lib/ai/provider";
import type { ChatTurn } from "@/lib/ai/provider/types";
import { buildSystemPrompt } from "@/lib/ai/prompts/system";
import { getBusinessProfile } from "@/lib/organizations/service";
import { listMessages } from "@/lib/conversations/service";
import { wrapUntrusted } from "@/lib/ai/guardrails/untrusted";
import { runAgentTurn } from "./run";

export interface RespondResult {
  /** null when the reply was discarded because a human took over. */
  messageId: string | null;
  reply: string;
  discarded: boolean;
  escalated: boolean;
}

/**
 * Produce the AI's next reply in a conversation and persist it atomically.
 *
 * The reply is written through append_ai_message(), which re-checks the
 * conversation state under a row lock. If a human took over while the model
 * was still thinking, the insert does not happen and the reply is DISCARDED
 * rather than posted — the customer never sees two voices. That outcome is
 * recorded on agent_runs so it is visible rather than silent.
 */
export async function respondInConversation(
  conversationId: string,
  organizationId: string,
  userId: string,
  client?: SupabaseClient,
): Promise<RespondResult> {
  const provider = getChatProvider();
  const supabase = client ?? (await createClient());

  const [profile, history] = await Promise.all([
    getBusinessProfile(organizationId, client),
    listMessages(conversationId, client, client ? organizationId : undefined),
  ]);

  const organizationName = profile?.business_name ?? "this business";
  const systemPrompt = buildSystemPrompt(organizationName, profile);

  const lastCustomerMessage = [...history]
    .reverse()
    .find((message) => message.sender_type === "customer");
  if (!lastCustomerMessage) {
    return { messageId: null, reply: "", discarded: false, escalated: false };
  }

  // Earlier turns as plain context. Customer text stays untrusted data.
  const priorTurns: ChatTurn[] = history
    .filter((message) => message.id !== lastCustomerMessage.id)
    .filter((message) => message.sender_type !== "system")
    .map((message) =>
      message.sender_type === "customer"
        ? {
            role: "user" as const,
            text: wrapUntrusted("customer message", message.content),
          }
        : {
            role: "assistant" as const,
            assistantRaw: [{ type: "text", text: message.content }],
          },
    );

  const startedAt = Date.now();
  const result = await runAgentTurn(
    provider,
    { organizationId, userId, conversationId, client },
    {
      systemPrompt,
      userMessage: lastCustomerMessage.content,
      history: priorTurns,
    },
  );

  // Atomic: returns null if the conversation is no longer AI_ACTIVE.
  const { data: messageId } = await supabase.rpc("append_ai_message", {
    p_conversation_id: conversationId,
    p_content: result.reply,
    p_metadata: { escalated: result.escalated, tool_calls: result.toolCalls },
  });

  const discarded = messageId === null || messageId === undefined;

  await supabase.from("agent_runs").insert({
    organization_id: organizationId,
    model: provider.model,
    user_message: lastCustomerMessage.content,
    reply: result.reply,
    tool_calls: result.toolCalls,
    input_tokens: result.usage.inputTokens,
    output_tokens: result.usage.outputTokens,
    latency_ms: Date.now() - startedAt,
    escalated: result.escalated,
    blocked_reason: discarded ? "taken_over" : result.blockedReason,
    status: discarded ? "blocked" : result.status,
  });

  return {
    messageId: (messageId as string | null) ?? null,
    reply: result.reply,
    discarded,
    escalated: result.escalated,
  };
}
