import { describe, expect, it } from "vitest";
import { REDACTED, isSensitiveKey, redact, redactText } from "./redact";

describe("redactText", () => {
  it.each([
    ["an email", "contact ada@example.com about it"],
    ["a phone number", "call +234 811 111 1111 today"],
    ["a bare long number", "number 2348111111111 please"],
    ["a token-shaped string", `key sk_live_${"a".repeat(40)} here`],
  ])("removes %s", (_label, text) => {
    const result = redactText(text);
    expect(result).toContain(REDACTED);
    expect(result).not.toMatch(/example\.com|811 111|sk_live_a/);
  });

  it("leaves ordinary prose and short numbers alone", () => {
    const text = "Order 4821 failed after 3 retries in 250ms";
    expect(redactText(text)).toBe(text);
  });
});

describe("isSensitiveKey", () => {
  it.each([
    "password",
    "accessToken",
    "SUPABASE_SERVICE_ROLE_KEY",
    "authorization",
    "app_secret",
    "customerEmail",
    "phone",
    "wa_id",
    "SENTRY_DSN",
  ])("flags %s", (key) => {
    expect(isSensitiveKey(key)).toBe(true);
  });

  it.each(["organizationId", "status", "count", "durationMs", "plan"])(
    "allows %s",
    (key) => {
      expect(isSensitiveKey(key)).toBe(false);
    },
  );
});

describe("redact", () => {
  it("replaces sensitive keys wholesale, whatever the value", () => {
    const result = redact({
      organizationId: "org-1",
      access_token: "EAAG-short",
      nested: { password: "hunter2", plan: "growth" },
    }) as Record<string, unknown>;

    expect(result.organizationId).toBe("org-1");
    expect(result.access_token).toBe(REDACTED);
    expect((result.nested as Record<string, unknown>).password).toBe(REDACTED);
    expect((result.nested as Record<string, unknown>).plan).toBe("growth");
  });

  it("scrubs PII that appears in values under innocuous keys", () => {
    // The case key-based redaction alone misses.
    const result = redact({ note: "customer ada@example.com asked" }) as Record<
      string,
      unknown
    >;
    expect(result.note).toBe(`customer ${REDACTED} asked`);
  });

  it("redacts an Error's message and stack", () => {
    const error = new Error("failed for ada@example.com");
    const result = redact(error) as { message: string; name: string };
    expect(result.name).toBe("Error");
    expect(result.message).toBe(`failed for ${REDACTED}`);
  });

  // A logger that throws while logging an error is worse than no logger.
  it("survives a circular structure", () => {
    const node: Record<string, unknown> = { name: "node" };
    node.self = node;
    expect(() => redact(node)).not.toThrow();
    expect((redact(node) as Record<string, unknown>).self).toBe("[circular]");
  });

  it("truncates beyond a sane depth", () => {
    let deep: Record<string, unknown> = { value: "bottom" };
    for (let i = 0; i < 12; i += 1) deep = { child: deep };
    expect(JSON.stringify(redact(deep))).toContain("[truncated]");
  });

  it("caps long arrays", () => {
    const result = redact(Array.from({ length: 200 }, (_, i) => i)) as unknown[];
    expect(result).toHaveLength(50);
  });

  it.each([
    [null, null],
    [undefined, undefined],
    [42, 42],
    [true, true],
  ])("passes %s through", (input, expected) => {
    expect(redact(input)).toBe(expected);
  });
});
