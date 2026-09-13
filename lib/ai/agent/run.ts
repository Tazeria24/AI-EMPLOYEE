import type {
  ChatProvider,
  ChatTurn,
  ChatToolResult,
} from "@/lib/ai/provider/types";
import { AGENT_TOOLS, getTool, type ToolContext } from "@/lib/ai/tools";
import { wrapUntrusted } from "@/lib/ai/guardrails/untrusted";
import { checkGrounding, UNGROUNDED_FALLBACK } from "@/lib/ai/guardrails/grounding";

/**
 * Hard ceiling on tool round-trips for a single customer turn. Protects against
 * a loop that keeps calling tools and burning tokens (see the cost-amplification
 * risk in the planning audit).
 */
export const MAX_TOOL_ITERATIONS = 4;

export interface AgentTurnInput {
  systemPrompt: string;
  userMessage: string;
  /** Prior turns, already in provider-native form. */
  history?: ChatTurn[];
}

export interface AgentToolCallLog {
  name: string;
  ok: boolean;
}

export interface AgentTurnResult {
  reply: string;
  escalated: boolean;
  blockedReason: string | null;
  status: "ok" | "blocked" | "error";
  toolCalls: AgentToolCallLog[];
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
  messages: ChatTurn[];
}

/**
 * Run one customer turn: let the model call tools, then verify the draft reply
 * is grounded in what those tools actually returned before it is allowed out.
 *
 * The loop is written out rather than delegated to an SDK helper so that
 * authorization, the iteration cap and logging stay explicit and auditable.
 */
export async function runAgentTurn(
  provider: ChatProvider,
  toolContext: ToolContext,
  input: AgentTurnInput,
): Promise<AgentTurnResult> {
  const messages: ChatTurn[] = [
    ...(input.history ?? []),
    // The customer's own words are untrusted data.
    { role: "user", text: wrapUntrusted("customer message", input.userMessage) },
  ];

  const toolCalls: AgentToolCallLog[] = [];
  const evidence: string[] = [];
  let escalated = false;
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };

  for (let iteration = 0; iteration <= MAX_TOOL_ITERATIONS; iteration += 1) {
    const response = await provider.complete({
      systemStable: input.systemPrompt,
      messages,
      tools: AGENT_TOOLS.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    });

    usage.inputTokens += response.usage.inputTokens;
    usage.outputTokens += response.usage.outputTokens;
    usage.cacheReadTokens += response.usage.cacheReadTokens;
    messages.push({ role: "assistant", assistantRaw: response.assistantRaw });

    if (response.toolUses.length === 0) {
      const reply = response.text.trim();

      // Nothing to say and no tool called — do not invent a reply.
      if (reply.length === 0) {
        return {
          reply: UNGROUNDED_FALLBACK,
          escalated: true,
          blockedReason: "empty_reply",
          status: "blocked",
          toolCalls,
          usage,
          messages,
        };
      }

      const grounding = checkGrounding(reply, evidence.join("\n"));
      if (!grounding.ok) {
        return {
          reply: UNGROUNDED_FALLBACK,
          escalated: true,
          blockedReason: `ungrounded_claims: ${grounding.violations
            .map((violation) => `${violation.kind}=${violation.value}`)
            .join(", ")}`,
          status: "blocked",
          toolCalls,
          usage,
          messages,
        };
      }

      return {
        reply,
        escalated,
        blockedReason: null,
        status: "ok",
        toolCalls,
        usage,
        messages,
      };
    }

    // Budget exhausted while the model still wants tools: stop and hand off
    // rather than keep spending.
    if (iteration === MAX_TOOL_ITERATIONS) {
      return {
        reply: UNGROUNDED_FALLBACK,
        escalated: true,
        blockedReason: "tool_iteration_limit",
        status: "blocked",
        toolCalls,
        usage,
        messages,
      };
    }

    const toolResults: ChatToolResult[] = [];
    for (const toolUse of response.toolUses) {
      const tool = getTool(toolUse.name);
      if (!tool) {
        toolCalls.push({ name: toolUse.name, ok: false });
        toolResults.push({
          toolUseId: toolUse.id,
          content: `Unknown tool "${toolUse.name}".`,
          isError: true,
        });
        continue;
      }

      let outcome;
      try {
        outcome = await tool.handler(toolUse.input, toolContext);
      } catch {
        outcome = {
          content: "The tool failed unexpectedly. Offer the customer a human.",
          isError: true,
        };
      }

      toolCalls.push({ name: tool.name, ok: !outcome.isError });
      if (outcome.escalated) escalated = true;
      if (!outcome.isError) evidence.push(outcome.content);

      toolResults.push({
        toolUseId: toolUse.id,
        content: outcome.content,
        isError: outcome.isError,
      });
    }

    // All results for one assistant turn go back in a single user message.
    messages.push({ role: "user", toolResults });
  }

  // Unreachable: the loop returns on the final iteration.
  return {
    reply: UNGROUNDED_FALLBACK,
    escalated: true,
    blockedReason: "tool_iteration_limit",
    status: "blocked",
    toolCalls,
    usage,
    messages,
  };
}
