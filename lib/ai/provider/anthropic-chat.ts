import Anthropic from "@anthropic-ai/sdk";
import type {
  ChatProvider,
  ChatRequest,
  ChatResponse,
  ChatToolUse,
} from "./types";

/** Claude Sonnet 5 (ADR-008): chosen over Opus 5 on per-conversation cost. */
const MODEL = "claude-sonnet-5";

/**
 * Deliberately modest: customer replies are short, and output tokens are the
 * expensive half of the bill. Raise only with a measured reason.
 */
const DEFAULT_MAX_TOKENS = 2048;

function toMessages(request: ChatRequest): Anthropic.MessageParam[] {
  return request.messages.map((turn): Anthropic.MessageParam => {
    if (turn.role === "assistant") {
      // Replayed verbatim — thinking blocks must survive unchanged.
      return {
        role: "assistant",
        content: turn.assistantRaw as Anthropic.ContentBlockParam[],
      };
    }
    if ("toolResults" in turn) {
      return {
        role: "user",
        content: turn.toolResults.map((result) => ({
          type: "tool_result" as const,
          tool_use_id: result.toolUseId,
          content: result.content,
          ...(result.isError ? { is_error: true } : {}),
        })),
      };
    }
    return { role: "user", content: turn.text };
  });
}

export function createAnthropicChatProvider(): ChatProvider {
  return {
    id: "anthropic",
    model: MODEL,

    async complete(request: ChatRequest): Promise<ChatResponse> {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error(
          "ANTHROPIC_API_KEY is not set. Required when AI_PROVIDER=anthropic.",
        );
      }
      // Constructed per call so importing this module never needs a key.
      const client = new Anthropic();

      // Stable prefix first with the cache breakpoint after it: the system
      // prompt and business profile repeat on every turn, so caching them is
      // the main lever on per-conversation cost.
      const system: Anthropic.TextBlockParam[] = [
        {
          type: "text",
          text: request.systemStable,
          cache_control: { type: "ephemeral" },
        },
      ];
      if (request.systemVolatile) {
        system.push({ type: "text", text: request.systemVolatile });
      }

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
        // Sonnet 5's only on-mode; budget_tokens is rejected on this model.
        thinking: { type: "adaptive" },
        system,
        messages: toMessages(request),
        tools: request.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
          // Guarantees tool arguments validate against the schema.
          strict: true,
        })),
      });

      let text = "";
      const toolUses: ChatToolUse[] = [];
      for (const block of response.content) {
        if (block.type === "text") {
          text += block.text;
        } else if (block.type === "tool_use") {
          toolUses.push({
            id: block.id,
            name: block.name,
            input: block.input,
          });
        }
      }

      return {
        text,
        toolUses,
        assistantRaw: response.content,
        stopReason: response.stop_reason,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        },
      };
    },
  };
}
