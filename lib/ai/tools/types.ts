import type { ChatToolSpec } from "@/lib/ai/provider/types";

/**
 * Server-derived execution context. The model never supplies a tenant id —
 * organizationId always comes from the authenticated session, and RLS enforces
 * the same boundary independently.
 */
export interface ToolContext {
  organizationId: string;
  userId: string;
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
