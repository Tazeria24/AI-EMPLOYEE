"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentContext, getBusinessProfile } from "@/lib/organizations/service";
import { canManageOrg } from "@/lib/organizations/validation";
import { getChatProvider } from "@/lib/ai/provider";
import { buildSystemPrompt } from "@/lib/ai/prompts/system";
import { runAgentTurn } from "./run";

export interface AskAgentState {
  question: string;
  reply: string | null;
  escalated: boolean;
  error: string | null;
}

/**
 * Dashboard playground: ask the agent one question as the signed-in business.
 * Every turn is logged to agent_runs (tasks/05 logging requirement).
 */
export async function askAgent(
  _previous: AskAgentState,
  formData: FormData,
): Promise<AskAgentState> {
  const raw = formData.get("message");
  const question = typeof raw === "string" ? raw.trim().slice(0, 2000) : "";
  const base: AskAgentState = {
    question,
    reply: null,
    escalated: false,
    error: null,
  };

  if (question.length === 0) {
    return { ...base, error: "Type a question first." };
  }

  const ctx = await getCurrentContext();
  if (!ctx) return { ...base, error: "You are not signed in." };
  if (!canManageOrg(ctx.role)) {
    return { ...base, error: "You do not have permission to use the assistant." };
  }

  let provider;
  try {
    provider = getChatProvider();
  } catch {
    return {
      ...base,
      error:
        "The AI provider is not configured. Set ANTHROPIC_API_KEY to enable the assistant.",
    };
  }

  const profile = await getBusinessProfile(ctx.organizationId);
  const systemPrompt = buildSystemPrompt(ctx.organization.name, profile);

  const startedAt = Date.now();
  try {
    const result = await runAgentTurn(
      provider,
      { organizationId: ctx.organizationId, userId: ctx.userId },
      { systemPrompt, userMessage: question },
    );

    const supabase = await createClient();
    await supabase.from("agent_runs").insert({
      organization_id: ctx.organizationId,
      model: provider.model,
      user_message: question,
      reply: result.reply,
      tool_calls: result.toolCalls,
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      latency_ms: Date.now() - startedAt,
      escalated: result.escalated,
      blocked_reason: result.blockedReason,
      status: result.status,
    });

    return {
      question,
      reply: result.reply,
      escalated: result.escalated,
      error: null,
    };
  } catch {
    const supabase = await createClient();
    await supabase.from("agent_runs").insert({
      organization_id: ctx.organizationId,
      model: provider.model,
      user_message: question,
      latency_ms: Date.now() - startedAt,
      status: "error",
    });
    return {
      ...base,
      error: "The assistant could not answer right now. Please try again.",
    };
  }
}
