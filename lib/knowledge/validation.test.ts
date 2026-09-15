import { describe, it, expect } from "vitest";
import { parseKnowledgeDocument } from "@/lib/knowledge/validation";

const validContent = "We deliver within Lagos in two working days.";

describe("parseKnowledgeDocument", () => {
  it("accepts and normalizes a valid document", () => {
    const result = parseKnowledgeDocument({
      title: "  Delivery policy  ",
      sourceType: "policy",
      sourceUrl: "https://example.com/policy",
      content: `  ${validContent}  `,
    });
    expect(result).toEqual({
      ok: true,
      data: {
        title: "Delivery policy",
        sourceType: "policy",
        sourceUrl: "https://example.com/policy",
        content: validContent,
      },
    });
  });

  it("defaults an unknown source type to document", () => {
    const result = parseKnowledgeDocument({
      title: "Notes",
      sourceType: "spreadsheet",
      content: validContent,
    });
    expect(result.ok && result.data.sourceType).toBe("document");
  });

  it("requires a title of at least 2 characters", () => {
    expect(parseKnowledgeDocument({ title: "A", content: validContent }).ok).toBe(
      false,
    );
  });

  it("requires meaningful content", () => {
    expect(parseKnowledgeDocument({ title: "Policy", content: "short" }).ok).toBe(
      false,
    );
    expect(parseKnowledgeDocument({ title: "Policy" }).ok).toBe(false);
  });

  it("rejects a source URL without http(s)://", () => {
    const result = parseKnowledgeDocument({
      title: "Policy",
      sourceUrl: "example.com",
      content: validContent,
    });
    expect(result.ok).toBe(false);
  });

  it("handles non-string input safely", () => {
    expect(parseKnowledgeDocument({ title: 7, content: validContent }).ok).toBe(
      false,
    );
  });
});
