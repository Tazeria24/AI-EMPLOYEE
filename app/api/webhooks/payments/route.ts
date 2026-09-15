import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getPaymentProvider } from "@/lib/payments";
import type { PaymentEvent } from "@/lib/payments";

export const dynamic = "force-dynamic";
/** Node runtime: node:crypto for the signature check. */
export const runtime = "nodejs";

/**
 * Payment provider webhook — the only thing in the system that may change a
 * subscription.
 *
 * It follows exactly the shape Milestone 10 established for WhatsApp, because
 * the threats are the same and the answers generalize:
 *
 *  - **Authenticity** (ADR-059): the signature is verified against the RAW
 *    request body before anything is acted on. A forged callback is the direct
 *    route to a free Pro plan, so this is the load-bearing check.
 *  - **Idempotency** (ADR-060): the event is claimed through
 *    `claim_integration_event` on its provider event id, which is backed by a
 *    unique constraint. Providers retry, and a retried "subscription renewed"
 *    must not extend the period twice.
 *  - **200 after verification** (ADR-061): once past the signature, every
 *    outcome answers 200 so a retry storm cannot be triggered by our own
 *    failures. What went wrong is recorded on `integration_events`.
 *
 * `docs/BILLING.md`: "Webhook status is authoritative after verification."
 * That is literal here — this route is the only writer of `subscriptions`.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  let provider;
  try {
    provider = getPaymentProvider();
  } catch {
    return Response.json({ error: "not_configured" }, { status: 503 });
  }

  if (!provider.verifyWebhook(rawBody, request.headers)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return Response.json({ ok: true });
  }

  const event = provider.parseEvent(parsed);
  if (!event) {
    // A verified event we do not act on (an invoice note, a test ping).
    return Response.json({ ok: true });
  }

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch {
    return Response.json({ error: "not_configured" }, { status: 503 });
  }

  // The organization id is echoed back by the provider from the checkout we
  // started, so confirm it actually exists before writing anything against it.
  const { data: existing } = await supabase
    .from("subscriptions")
    .select("organization_id")
    .eq("organization_id", event.organizationId)
    .maybeSingle();

  if (!existing) {
    return Response.json({ ok: true });
  }

  const { data: claimed } = await supabase.rpc("claim_integration_event", {
    p_organization_id: event.organizationId,
    p_provider: provider.name,
    p_external_event_id: event.externalEventId,
    p_event_type: event.eventType,
    p_payload: { plan: event.plan, status: event.status },
  });
  const eventId = claimed as string | null;
  if (!eventId) {
    // Already applied. Re-applying a renewal would move the period again.
    return Response.json({ ok: true, duplicate: true });
  }

  const outcome = await applyEvent(supabase, event);

  await supabase
    .from("integration_events")
    .update({
      status: outcome.ok ? "processed" : "failed",
      error: outcome.ok ? null : outcome.error,
      processed_at: new Date().toISOString(),
    })
    .eq("id", eventId)
    .eq("organization_id", event.organizationId);

  return Response.json({ ok: true });
}

async function applyEvent(
  supabase: ReturnType<typeof createServiceRoleClient>,
  event: PaymentEvent,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Only fields the provider actually reported are written, so a
  // "payment failed" callback that carries no plan does not blank the plan.
  // A cancellation likewise keeps the plan and only moves the status —
  // org_plan() already resolves a non-entitled status to `none`, and keeping
  // the plan is what lets a reactivation restore the right tier.
  const update: Record<string, unknown> = {};

  if (event.plan) update.plan = event.plan;
  if (event.status) update.status = event.status;
  if (event.providerCustomerId) update.provider_customer_id = event.providerCustomerId;
  if (event.providerSubscriptionId) {
    update.provider_subscription_id = event.providerSubscriptionId;
  }
  if (event.currentPeriodStart) update.current_period_start = event.currentPeriodStart;
  if (event.currentPeriodEnd) update.current_period_end = event.currentPeriodEnd;

  if (Object.keys(update).length === 0) {
    return { ok: false, error: "The event carried no subscription changes." };
  }

  const { error } = await supabase
    .from("subscriptions")
    .update(update)
    .eq("organization_id", event.organizationId);

  if (error) {
    return { ok: false, error: "Could not apply the subscription change." };
  }

  await supabase.from("usage_events").insert({
    organization_id: event.organizationId,
    event_type: "subscription_change",
    quantity: 1,
    metadata: { plan: event.plan, status: event.status, source: event.eventType },
  });

  return { ok: true };
}
