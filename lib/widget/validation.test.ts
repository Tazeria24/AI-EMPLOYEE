import { describe, it, expect } from "vitest";
import {
  frameAncestors,
  isSessionToken,
  isWidgetKey,
  parseVisitorMessage,
  statusMessage,
} from "@/lib/widget/validation";

describe("identifier validation", () => {
  it("accepts well-formed keys and tokens", () => {
    expect(isWidgetKey("a".repeat(32))).toBe(true);
    expect(isSessionToken("f".repeat(64))).toBe(true);
  });

  it("rejects wrong length, wrong alphabet and non-strings", () => {
    expect(isWidgetKey("a".repeat(31))).toBe(false);
    expect(isWidgetKey("g".repeat(32))).toBe(false);
    expect(isWidgetKey(null)).toBe(false);
    expect(isSessionToken("a".repeat(32))).toBe(false);
  });

  it("rejects SQL-ish and path-ish input outright", () => {
    expect(isWidgetKey("' or 1=1 --")).toBe(false);
    expect(isSessionToken("../../etc/passwd")).toBe(false);
  });
});

describe("parseVisitorMessage", () => {
  it("trims and accepts a normal message", () => {
    expect(parseVisitorMessage("  hello  ")).toEqual({ ok: true, content: "hello" });
  });
  it("rejects empty and whitespace-only", () => {
    expect(parseVisitorMessage("   ").ok).toBe(false);
    expect(parseVisitorMessage("").ok).toBe(false);
  });
  it("rejects an over-long message", () => {
    expect(parseVisitorMessage("x".repeat(2001)).ok).toBe(false);
  });
  it("rejects non-text", () => {
    expect(parseVisitorMessage(42).ok).toBe(false);
    expect(parseVisitorMessage(null).ok).toBe(false);
  });
});

describe("frameAncestors", () => {
  it("allows any site until the business restricts it", () => {
    expect(frameAncestors([])).toBe("frame-ancestors *");
    expect(frameAncestors(null)).toBe("frame-ancestors *");
  });
  it("restricts to the listed origins", () => {
    expect(frameAncestors(["https://adascloset.ng"])).toBe(
      "frame-ancestors 'self' https://adascloset.ng",
    );
  });
  it("drops entries that could break out of the header", () => {
    expect(frameAncestors(["https://ok.ng", "javascript:alert(1)", "https://a b"])).toBe(
      "frame-ancestors 'self' https://ok.ng",
    );
  });
});

describe("statusMessage", () => {
  it("maps every refusal to a visitor-safe message", () => {
    for (const status of ["session_limit", "org_limit", "rate_limited", "unknown_session", "disabled"]) {
      const result = statusMessage(status);
      expect(result.code).toBeGreaterThanOrEqual(400);
      expect(result.message).not.toMatch(/organization|database|sql|token/i);
    }
  });
  it("rate limits report 429", () => {
    expect(statusMessage("session_limit").code).toBe(429);
    expect(statusMessage("org_limit").code).toBe(429);
  });
});
