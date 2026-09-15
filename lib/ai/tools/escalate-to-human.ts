import type { AgentTool } from "./types";

export const escalateToHumanTool: AgentTool = {
  name: "escalate_to_human",
  description:
    "Hand the conversation to a human. Use when the customer asks for a person, is upset or complaining, raises a payment/account/order issue, or when you cannot answer from verified information.",
  inputSchema: {
    type: "object",
    properties: {
      reason: {
        type: "string",
        description: "Short reason for the handoff, for the human picking it up.",
      },
    },
    required: ["reason"],
    additionalProperties: false,
  },

  async handler(input, context) {
    void context;
    const reason =
      typeof (input as { reason?: unknown })?.reason === "string"
        ? (input as { reason: string }).reason.trim().slice(0, 500)
        : "unspecified";

    // Routing to a specific human arrives with the inbox in Milestone 06; for
    // now the handoff is recorded on the run and surfaced in the dashboard.
    return {
      content: JSON.stringify({
        escalated: true,
        reason,
        note: "Tell the customer a colleague will follow up. Do not attempt to answer the question yourself.",
      }),
      escalated: true,
    };
  },
};
