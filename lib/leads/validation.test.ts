import { describe, it, expect } from "vitest";
import { parseLeadCapture } from "@/lib/leads/validation";

describe("parseLeadCapture", () => {
  it("accepts a lead with a phone number", () => {
    const result = parseLeadCapture({
      contact_name: "  Ada  ",
      contact_phone: "+234 802 111 2222",
      intent: "red dress size 12",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.contactName).toBe("Ada");
      expect(result.data.contactEmail).toBeNull();
    }
  });

  it("rejects a lead with no contact details at all", () => {
    expect(parseLeadCapture({ intent: "a dress" }).ok).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(parseLeadCapture({ contact_email: "not-an-email" }).ok).toBe(false);
  });

  it("rejects an invalid phone number", () => {
    expect(parseLeadCapture({ contact_phone: "call me!" }).ok).toBe(false);
  });

  it("handles non-string input safely", () => {
    expect(parseLeadCapture({ contact_name: 42, contact_phone: null }).ok).toBe(false);
  });
});
