import { captureLead } from "@/lib/leads/service";
import { parseLeadCapture } from "@/lib/leads/validation";
import type { AgentTool } from "./types";

export const createLeadTool: AgentTool = {
  name: "create_lead",
  description:
    "Record a sales lead when the customer shows buying intent AND has volunteered a way to contact them. Only pass details the customer actually gave you — never invent or guess contact details.",
  inputSchema: {
    type: "object",
    properties: {
      contact_name: { type: "string", description: "Customer's name, if given." },
      contact_email: { type: "string", description: "Email, if given." },
      contact_phone: { type: "string", description: "Phone number, if given." },
      intent: {
        type: "string",
        description: "What they want to buy, e.g. 'red dress size 12'.",
      },
      notes: {
        type: "string",
        description: "Useful context: preferences, sizes, timeline.",
      },
    },
    required: [],
    additionalProperties: false,
  },

  async handler(input, context) {
    const parsed = parseLeadCapture((input ?? {}) as Record<string, unknown>);
    if (!parsed.ok) {
      return { content: parsed.error, isError: true };
    }

    const result = await captureLead(
      context.organizationId,
      parsed.data,
      "ai_agent",
    );
    if (!result.ok) {
      return {
        content: `${result.error} Do not tell the customer their details were saved.`,
        isError: true,
      };
    }

    return {
      content: JSON.stringify({ saved: true, lead_id: result.leadId }),
    };
  },
};
