import { searchKnowledge } from "@/lib/knowledge/service";
import { wrapUntrusted } from "@/lib/ai/guardrails/untrusted";
import type { AgentTool } from "./types";

const MAX_RESULTS = 5;

export const searchKnowledgeTool: AgentTool = {
  name: "search_knowledge",
  description:
    "Search this business's approved knowledge (FAQs, policies, delivery and returns terms). Use for any policy or process question.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The customer's question, in their own words.",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },

  async handler(input, context) {
    const query =
      typeof (input as { query?: unknown })?.query === "string"
        ? (input as { query: string }).query.trim()
        : "";
    if (query.length === 0) {
      return { content: "No search query supplied.", isError: true };
    }

    try {
      const matches = await searchKnowledge(
        context.organizationId,
        query,
        MAX_RESULTS,
      );
      if (matches.length === 0) {
        return {
          content: `No knowledge matched "${query}". Say the information isn't available and offer a human.`,
        };
      }

      // Retrieved documents are data, not instructions.
      const body = matches
        .map((match, index) => `[${index + 1}] ${match.content}`)
        .join("\n\n");
      return { content: wrapUntrusted("knowledge base", body) };
    } catch {
      return {
        content: "The knowledge lookup failed. Offer the customer a human instead of guessing.",
        isError: true,
      };
    }
  },
};
