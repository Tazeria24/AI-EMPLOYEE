import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatToolSpec } from "@/lib/ai/provider/types";

/**
 * Server-derived execution context. The model never supplies a tenant id —
 * organizationId always comes from the authenticated session, and RLS enforces
 * the same boundary independently.
 */
export interface ToolContext {
  organizationId: string;
  userId: string;
  /** Set when the agent runs inside a conversation, so captured leads link to it. */
  conversationId?: string;
  /**
   * Injected when the agent runs without a user session (the public widget),
   * where the request-scoped client would see nothing. The organization id
   * above is resolved server-side from a validated session, never from input.
   */
  client?: SupabaseClient;
}

export interface ToolOutcome {
  /** Text handed back to the model as the tool result. */
  content: string;
  isError?: boolean;
  /** Set when the tool represents a handoff. */
  escalated?: boolean;
}

export interface AgentTool extends ChatToolSpec {
  handler(input: unknown, context: ToolContext): Promise<ToolOutcome>;
}
