import { createHmac, timingSafeEqual } from "node:crypto";
import { isPlanId, type PlanId, type SubscriptionStatus } from "@/lib/billing/plans";
import type {
  CheckoutRequest,
  CheckoutResult,
  PaymentEvent,
  PaymentProvider,
} from "./types";

const VALID_STATUSES: SubscriptionStatus[] = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
];

function isStatus(value: unknown): value is SubscriptionStatus {
  return typeof value === "string" && VALID_STATUSES.includes(value as SubscriptionStatus);
}

/**
 * Offline payment provider.
 *
 * ADR-010 — Paystack or Flutterwave — is still the founder's to decide, and
 * CLAUDE.md makes choosing a paid dependency a decision-boundary stop. So this
 * milestone builds everything the choice does not affect and leaves a stub in
 * the provider's place, exactly as Milestone 04 did with embeddings before the
 * Voyage decision.
 *
 * It is not a mock with no teeth: it signs and verifies webhooks with the same
 * raw-body HMAC scheme the real providers use, so the webhook route, the
 * idempotency path and the state machine are all exercised for real. What it
 * does not do is take money — checkout returns a local confirmation URL rather
 * than a hosted payment page.
 *
 * **Never usable in production**: `createCheckout` refuses unless
 * `PAYMENT_PROVIDER=stub` is set explicitly.
 */
export const stubPaymentProvider: PaymentProvider = {
  name: "stub",

  async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    if (process.env.PAYMENT_PROVIDER !== "stub") {
      return {
        ok: false,
        error: "No payment provider is configured yet.",
      };
    }

    const reference = `stub_${request.organizationId}_${Date.now()}`;
    const url = new URL(request.returnUrl);
    url.searchParams.set("stub_checkout", reference);
    url.searchParams.set("plan", request.plan);
    return { ok: true, url: url.toString(), reference };
  },

  verifyWebhook(rawBody: string, headers: Headers): boolean {
    const secret = process.env.PAYMENT_WEBHOOK_SECRET;
    if (!secret) return false;

    const provided = headers.get("x-payment-signature") ?? "";
    if (!/^[0-9a-f]{64}$/i.test(provided)) return false;

    const expected = createHmac("sha512", secret)
      .update(rawBody, "utf8")
      .digest("hex")
      .slice(0, 64);

    const a = Buffer.from(provided.toLowerCase(), "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  },

  parseEvent(body: unknown): PaymentEvent | null {
    if (typeof body !== "object" || body === null) return null;
    const event = body as Record<string, unknown>;

    const externalEventId = event.id;
    const organizationId = event.organization_id;
    if (typeof externalEventId !== "string" || typeof organizationId !== "string") {
      return null;
    }

    const plan: PlanId | null = isPlanId(event.plan) ? event.plan : null;
    const status = isStatus(event.status) ? event.status : null;

    return {
      externalEventId,
      eventType: typeof event.type === "string" ? event.type : "subscription.updated",
      organizationId,
      plan,
      status,
      providerCustomerId:
        typeof event.customer_id === "string" ? event.customer_id : null,
      providerSubscriptionId:
        typeof event.subscription_id === "string" ? event.subscription_id : null,
      currentPeriodStart:
        typeof event.current_period_start === "string" ? event.current_period_start : null,
      currentPeriodEnd:
        typeof event.current_period_end === "string" ? event.current_period_end : null,
    };
  },
};

/** Sign a body the way the stub provider expects. Tests and local tooling only. */
export function signStubWebhook(rawBody: string, secret: string): string {
  return createHmac("sha512", secret).update(rawBody, "utf8").digest("hex").slice(0, 64);
}
