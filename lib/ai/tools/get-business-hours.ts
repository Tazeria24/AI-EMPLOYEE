import { getBusinessProfile } from "@/lib/organizations/service";
import type { AgentTool } from "./types";

export const getBusinessHoursTool: AgentTool = {
  name: "get_business_hours",
  description:
    "Get this business's opening hours, location, timezone and contact details.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },

  async handler(_input, context) {
    void _input;
    try {
      const profile = await getBusinessProfile(
        context.organizationId,
        context.client,
      );
      if (!profile) {
        return {
          content: "No business profile is configured. Offer a human instead of guessing.",
        };
      }
      return {
        content: JSON.stringify({
          business_hours: profile.business_hours ?? null,
          location: profile.location,
          phone: profile.phone,
          timezone: profile.timezone,
          website: profile.website,
        }),
      };
    } catch {
      return {
        content: "The business profile lookup failed. Offer the customer a human.",
        isError: true,
      };
    }
  },
};
