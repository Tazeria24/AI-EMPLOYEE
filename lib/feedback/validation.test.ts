import { describe, expect, it } from "vitest";
import { MAX_FEEDBACK_LENGTH, isFeedbackKind, parseFeedback } from "./validation";

describe("parseFeedback", () => {
  it("accepts a normal report", () => {
    const result = parseFeedback({
      kind: "bug",
      message: "The AI said we deliver on Sundays, but we don't.",
      page: "/dashboard/conversations",
    });
    expect(result).toEqual({
      ok: true,
      data: {
        kind: "bug",
        message: "The AI said we deliver on Sundays, but we don't.",
        page: "/dashboard/conversations",
      },
    });
  });

  it("falls back to `general` for an unknown kind rather than refusing", () => {
    // Losing a bug report over a bad radio value would be the wrong trade.
    const result = parseFeedback({ kind: "urgent!!", message: "something broke" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.kind).toBe("general");
  });

  it.each([
    ["empty", ""],
    ["whitespace only", "   \n  "],
    ["missing", undefined],
  ])("rejects a %s message", (_label, message) => {
    expect(parseFeedback({ message }).ok).toBe(false);
  });

  it("rejects an over-long message", () => {
    expect(parseFeedback({ message: "x".repeat(MAX_FEEDBACK_LENGTH + 1) }).ok).toBe(
      false,
    );
  });

  it.each([
    ["an absolute url", "https://evil.example/x"],
    ["a protocol-relative url", "//evil.example"],
    ["a bare word", "conversations"],
    ["an over-long path", `/${"a".repeat(250)}`],
  ])("drops %s as the page", (_label, page) => {
    const result = parseFeedback({ message: "hi", page });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.page).toBeNull();
  });

  it("trims the message", () => {
    const result = parseFeedback({ message: "  it broke  " });
    if (result.ok) expect(result.data.message).toBe("it broke");
  });
});

describe("isFeedbackKind", () => {
  it.each(["problem", "bug", "idea", "general"])("accepts %s", (kind) => {
    expect(isFeedbackKind(kind)).toBe(true);
  });

  it.each([null, 1, "", "BUG", "other"])("rejects %s", (value) => {
    expect(isFeedbackKind(value)).toBe(false);
  });
});
