import { afterEach, describe, expect, it } from "vitest";
import { signStubWebhook, stubPaymentProvider } from "./stub";
import { getPaymentProvider } from "./index";

const SECRET = "test-payment-webhook-secret";
const BODY = JSON.stringify({
  id: "evt_1",
  type: "subscription.activated",
  organization_id: "00000000-0000-0000-0000-0000000000aa",
  plan: "growth",
  status: "active",
});

function headers(signature: string): Headers {
  return new Headers({ "x-payment-signature": signature });
}

afterEach(() => {
  delete process.env.PAYMENT_WEBHOOK_SECRET;
  delete process.env.PAYMENT_PROVIDER;
});

describe("verifyWebhook", () => {
  it("accepts a correctly signed body", () => {
    process.env.PAYMENT_WEBHOOK_SECRET = SECRET;
    expect(
      stubPaymentProvider.verifyWebhook(BODY, headers(signStubWebhook(BODY, SECRET))),
    ).toBe(true);
  });

  it("rejects a tampered body", () => {
    // The attack: a captured signature replayed over an upgraded plan.
    process.env.PAYMENT_WEBHOOK_SECRET = SECRET;
    const signature = signStubWebhook(BODY, SECRET);
    const upgraded = BODY.replace('"growth"', '"pro"');
    expect(stubPaymentProvider.verifyWebhook(upgraded, headers(signature))).toBe(false);
  });

  it("rejects a signature from another secret", () => {
    process.env.PAYMENT_WEBHOOK_SECRET = SECRET;
    expect(
      stubPaymentProvider.verifyWebhook(BODY, headers(signStubWebhook(BODY, "other"))),
    ).toBe(false);
  });

  it("fails closed when no secret is configured", () => {
    expect(
      stubPaymentProvider.verifyWebhook(BODY, headers(signStubWebhook(BODY, SECRET))),
    ).toBe(false);
  });

  it.each([
    ["missing", ""],
    ["short", "abcd"],
    ["non-hex", "z".repeat(64)],
  ])("rejects a %s signature", (_label, signature) => {
    process.env.PAYMENT_WEBHOOK_SECRET = SECRET;
    expect(stubPaymentProvider.verifyWebhook(BODY, headers(signature))).toBe(false);
  });
});

describe("parseEvent", () => {
  it("normalizes a subscription event", () => {
    expect(stubPaymentProvider.parseEvent(JSON.parse(BODY))).toMatchObject({
      externalEventId: "evt_1",
      organizationId: "00000000-0000-0000-0000-0000000000aa",
      plan: "growth",
      status: "active",
    });
  });

  it("drops a plan or status it does not recognise", () => {
    // A provider naming a tier we do not sell must not set it.
    const event = stubPaymentProvider.parseEvent({
      id: "evt_2",
      organization_id: "org",
      plan: "enterprise",
      status: "vibes",
    });
    expect(event?.plan).toBeNull();
    expect(event?.status).toBeNull();
  });

  it.each([
    ["null", null],
    ["a string", "nope"],
    ["no id", { organization_id: "org" }],
    ["no organization", { id: "evt_3" }],
  ])("returns null for %s", (_label, body) => {
    expect(stubPaymentProvider.parseEvent(body)).toBeNull();
  });
});

describe("createCheckout", () => {
  it("refuses unless the stub is explicitly selected", async () => {
    // Guards against the stub quietly standing in for a real provider.
    const result = await stubPaymentProvider.createCheckout({
      organizationId: "org",
      plan: "growth",
      returnUrl: "https://example.com/dashboard/billing",
      customerEmail: null,
    });
    expect(result.ok).toBe(false);
  });

  it("returns a local confirmation url when selected", async () => {
    process.env.PAYMENT_PROVIDER = "stub";
    const result = await stubPaymentProvider.createCheckout({
      organizationId: "org",
      plan: "growth",
      returnUrl: "https://example.com/dashboard/billing",
      customerEmail: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url).toContain("stub_checkout=");
  });
});

describe("getPaymentProvider", () => {
  it("defaults to the stub while ADR-010 is undecided", () => {
    expect(getPaymentProvider().name).toBe("stub");
  });

  it("refuses a provider that is not implemented yet", () => {
    process.env.PAYMENT_PROVIDER = "paystack";
    expect(() => getPaymentProvider()).toThrow(/ADR-010/);
  });
});
