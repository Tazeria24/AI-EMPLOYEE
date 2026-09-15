import { afterEach, describe, expect, it } from "vitest";
import { RATE_LIMITS, bucketKey, clientIp } from "./rate-limit";

afterEach(() => {
  delete process.env.RATE_LIMIT_PEPPER;
});

describe("bucketKey", () => {
  it("never contains the subject", () => {
    // The whole point: the rate_limits table must record that someone was
    // throttled without recording who.
    const key = bucketKey("signIn", "ada@example.com");
    expect(key).not.toContain("ada");
    expect(key).not.toContain("example.com");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable for the same subject and limit", () => {
    expect(bucketKey("signIn", "ada@example.com")).toBe(
      bucketKey("signIn", "ada@example.com"),
    );
  });

  it("normalizes case and surrounding space", () => {
    expect(bucketKey("signIn", "  Ada@Example.com ")).toBe(
      bucketKey("signIn", "ada@example.com"),
    );
  });

  it("separates limits, so one does not consume another's budget", () => {
    expect(bucketKey("signIn", "ada@example.com")).not.toBe(
      bucketKey("signUp", "ada@example.com"),
    );
  });

  it("changes with the pepper", () => {
    const without = bucketKey("signIn", "ada@example.com");
    process.env.RATE_LIMIT_PEPPER = "a-server-side-pepper";
    expect(bucketKey("signIn", "ada@example.com")).not.toBe(without);
  });
});

describe("clientIp", () => {
  it("takes the first entry of x-forwarded-for", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe(
      "1.2.3.4",
    );
  });

  it("falls back to x-real-ip, then to a constant", () => {
    expect(clientIp(new Headers({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("RATE_LIMITS", () => {
  it("defines a positive limit and window for every entry", () => {
    for (const [name, config] of Object.entries(RATE_LIMITS)) {
      expect(config.limit, name).toBeGreaterThan(0);
      expect(config.windowSeconds, name).toBeGreaterThan(0);
    }
  });

  it("allows more attempts per IP than per email on sign-in", () => {
    // One office behind one IP is many people; one email is one person.
    expect(RATE_LIMITS.signInPerIp.limit).toBeGreaterThan(RATE_LIMITS.signIn.limit);
  });
});
