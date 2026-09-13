/**
 * Provider-agnostic AI interfaces. Product logic depends on these, never on a
 * specific vendor SDK (ADR-006).
 */

/**
 * Retrieval models embed queries and documents differently. Voyage (and most
 * modern embedding APIs) improve retrieval measurably when told which one this
 * text is, so the distinction is part of the interface rather than a detail of
 * one implementation.
 */
export type EmbeddingInputType = "document" | "query";

export interface EmbeddingProvider {
  /** Stable identifier recorded with stored vectors. */
  readonly id: string;
  /** Vector length this provider emits. Must match the DB vector(n) column. */
  readonly dimensions: number;
  /** Embed a batch of texts, preserving input order. */
  embed(texts: string[], inputType: EmbeddingInputType): Promise<number[][]>;
}

/** A tool the model may call. `inputSchema` is JSON Schema. */
export interface ChatToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ChatToolUse {
  id: string;
  name: string;
  input: unknown;
}

export interface ChatToolResult {
  toolUseId: string;
  content: string;
  isError?: boolean;
}

/**
 * One turn of the conversation. `assistantRaw` carries the provider's own
 * representation of an assistant turn (Anthropic content blocks, including
 * thinking blocks, which must be replayed unchanged on the same model).
 */
export type ChatTurn =
  | { role: "user"; text: string }
  | { role: "user"; toolResults: ChatToolResult[] }
  | { role: "assistant"; assistantRaw: unknown };

export interface ChatRequest {
  /** Stable prefix (system prompt + business context). Cached where supported. */
  systemStable: string;
  /** Volatile system content appended after the cache breakpoint. */
  systemVolatile?: string;
  messages: ChatTurn[];
  tools: ChatToolSpec[];
  maxTokens?: number;
}

export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export interface ChatResponse {
  /** Plain text the model produced this turn (may be empty when calling tools). */
  text: string;
  toolUses: ChatToolUse[];
  /** Provider-native assistant turn, to be replayed verbatim on the next call. */
  assistantRaw: unknown;
  stopReason: string | null;
  usage: ChatUsage;
}

export interface ChatProvider {
  readonly id: string;
  readonly model: string;
  complete(request: ChatRequest): Promise<ChatResponse>;
}
