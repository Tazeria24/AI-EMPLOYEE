import type { PlanId, SubscriptionStatus } from "@/lib/billing/plans";

export interface CheckoutRequest {
  organizationId: string;
  plan: PlanId;
  /** Where the provider should return the customer afterwards. */
  returnUrl: string;
  customerEmail: string | null;
}

export type CheckoutResult =
  | { ok: true; url: string; reference: string }
  | { ok: false; error: string };

/**
 * A subscription change reported by a provider webhook, already normalized.
 * `externalEventId` is the idempotency key — see ADR-060.
 */
export interface PaymentEvent {
  externalEventId: string;
  eventType: string;
  /** How the provider identifies the organization: our own id, echoed back. */
  organizationId: string;
  plan: PlanId | null;
  status: SubscriptionStatus | null;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
}

export interface PaymentProvider {
  readonly name: string;

  /** Start a hosted checkout and return where to send the customer. */
  createCheckout(request: CheckoutRequest): Promise<CheckoutResult>;

  /**
   * Verify a webhook against the raw request body.
   *
   * Takes the RAW body for the same reason the WhatsApp webhook does
   * (ADR-059): every provider signs the bytes they sent, and re-serialized
   * JSON is different bytes.
   */
  verifyWebhook(rawBody: string, headers: Headers): boolean;

  /** Normalize a verified webhook body, or null if it is not one we act on. */
  parseEvent(body: unknown): PaymentEvent | null;
}
