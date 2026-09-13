import type { AgentTool } from "./types";
import { searchProductsTool } from "./search-products";
import { searchKnowledgeTool } from "./search-knowledge";
import { getBusinessHoursTool } from "./get-business-hours";
import { createLeadTool } from "./create-lead";
import { escalateToHumanTool } from "./escalate-to-human";

export type { AgentTool, ToolContext, ToolOutcome } from "./types";

/**
 * The MVP tool set (ADR-007). `check_order` stays out until an orders model
 * exists — a tool with no data behind it would have to guess.
 */
export const AGENT_TOOLS: AgentTool[] = [
  searchProductsTool,
  searchKnowledgeTool,
  getBusinessHoursTool,
  createLeadTool,
  escalateToHumanTool,
];

export function getTool(name: string): AgentTool | undefined {
  return AGENT_TOOLS.find((tool) => tool.name === name);
}
