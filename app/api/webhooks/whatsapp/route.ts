import { createServiceRoleClient } from "@/lib/supabase/admin";
import { respondInConversation } from "@/lib/ai/agent/respond";
import { verifyHandshake, verifySignature } from "@/lib/whatsapp/signature";
import { parseInboundPayload } from "@/lib/whatsapp/payload";
import { sendTextMessage } from "@/lib/whatsapp/client";
import { normalizeWaId } from "@/lib/whatsapp/validation";
import type { InboundMessage } from "@/lib/whatsapp/types";

export const dynamic = "force-dynamic";
/** Node runtime: node:crypto for the HMAC, and the Anthropic SDK downstream. */
export const runtime = "nodejs";

const PROVIDER = "whatsapp";
const UNSUPPORTED_REPLY =
  "Sorry — I can only read text messages. Please type your question and I'll help.";

interface Integration {
  organization_id: string;
  phone_number_id: string | null;
  app_secret: string | null;
  access_token: string | null;
  enabled: boolean;
}

/**
 * Meta's subscribe handshake.
 *
 * The verify token is the only thing identifying which business is being
 * subscribed, so it doubles as the lookup key. The equality lookup narrows to
 * a candidate row; `verifyHandshake` is then the authoritative check and is
 * constant-time. A wrong token gets a bare 403 — no hint about whether any
 * business is configured.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (!token || !challenge) {
    return new Response("forbidden", { status: 403 });
  }

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch {
    return new Response("forbidden", { status: 403 });
  }

  const { data } = await supabase
    .from("whatsapp_integrations")
    .select("verify_token")
    .eq("verify_token", token)
    .maybeSingle();

  const stored = (data as { verify_token: string | null } | null)?.verify_token ?? null;
  if (!verifyHandshake(mode, token, stored)) {
    return new Response("forbidden", { status: 403 });
  }

  // Meta wants the raw challenge echoed back, not JSON.
  return new Response(challenge, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

/**
 * Inbound WhatsApp messages.
 *
 * Order matters, and this is the whole security argument for the endpoint:
 *
 *  1. Read the **raw body**. The signature covers those exact bytes; anything
 *     re-serialized will not match.
 *  2. Parse it **only far enough to route** — the `phone_number_id` tells us
 *     which business's app secret to check against. Nothing in the payload is
 *     acted on before step 3.
 *  3. Verify `X-Hub-Signature-256` against that business's app secret, in
 *     constant time. Fail → 401, and nothing has been written or spent.
 *  4. Claim the event by its Meta message id. A redelivery — which Meta sends
 *     routinely after any non-200 — collides with the unique constraint and
 *     returns nothing, so it costs one INSERT that does nothing rather than a
 *     second AI reply (planning audit finding #13).
 *  5. Only then: record the customer, the conversation and the message, answer,
 *     and send.
 *
 * Every outcome after step 3 returns 200. Meta retries non-2xx responses, so
 * signalling our own failure to it just multiplies the work; failures are
 * recorded on `integration_events` instead, where the business can see them.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    // Not JSON: nothing to route on, and nothing to retry.
    return Response.json({ ok: true });
  }

  const routing = parseInboundPayload(parsed);
  if (!routing) {
    // Status callbacks (delivered/read) and account updates land here.
    return Response.json({ ok: true });
  }

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch {
    return Response.json({ error: "not_configured" }, { status: 503 });
  }

  // The tenant comes from the database, keyed by the number the message was
  // sent to — never from anything else the caller supplied.
  const { data } = await supabase
    .from("whatsapp_integrations")
    .select("organization_id, phone_number_id, app_secret, access_token, enabled")
    .eq("phone_number_id", routing.phoneNumberId)
    .maybeSingle();
  const integration = data as Integration | null;

  if (
    !verifySignature(
      rawBody,
      request.headers.get("x-hub-signature-256"),
      integration?.app_secret,
    )
  ) {
    // Covers an unknown number, a missing secret and a forged signature alike:
    // an attacker learns nothing about which businesses are connected.
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // Verified, but switched off. Nothing paid runs.
  if (!integration || !integration.enabled) {
    return Response.json({ ok: true });
  }

  for (const message of routing.messages) {
    await handleMessage(supabase, integration, message);
  }

  return Response.json({ ok: true });
}

async function handleMessage(
  supabase: ReturnType<typeof createServiceRoleClient>,
  integration: Integration,
  message: InboundMessage,
): Promise<void> {
  const organizationId = integration.organization_id;

  // Atomic de-duplication: the first delivery of this Meta message id wins.
  const { data: claimed } = await supabase.rpc("claim_integration_event", {
    p_organization_id: organizationId,
    p_provider: PROVIDER,
    p_external_event_id: message.externalId,
    p_event_type: `message.${message.type}`,
    p_payload: { from: message.from, type: message.type },
  });
  const eventId = claimed as string | null;
  if (!eventId) return; // already handled — a redelivery

  const finish = async (status: string, error?: string) => {
    await supabase
      .from("integration_events")
      .update({
        status,
        error: error ?? null,
        processed_at: new Date().toISOString(),
      })
      .eq("id", eventId)
      .eq("organization_id", organizationId);
  };

  try {
    const waId = normalizeWaId(message.from);
    const customerId = await findOrCreateCustomer(
      supabase,
      organizationId,
      waId,
      message.profileName,
    );
    const conversationId = await findOrCreateConversation(
      supabase,
      organizationId,
      customerId,
    );

    // Anything that is not text: acknowledge without calling the model.
    if (message.type !== "text" || !message.text) {
      await supabase.from("messages").insert({
        organization_id: organizationId,
        conversation_id: conversationId,
        sender_type: "system",
        content: `[${message.type} message received]`,
        metadata: { external_id: message.externalId, channel: PROVIDER },
      });
      await sendReply(supabase, integration, waId, UNSUPPORTED_REPLY);
      await finish("skipped", `Unsupported message type: ${message.type}`);
      return;
    }

    await supabase.from("messages").insert({
      organization_id: organizationId,
      conversation_id: conversationId,
      sender_type: "customer",
      content: message.text,
      metadata: { external_id: message.externalId, channel: PROVIDER },
    });
    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId)
      .eq("organization_id", organizationId);

    await supabase.from("usage_events").insert({
      organization_id: organizationId,
      event_type: "whatsapp_message",
      quantity: 1,
      metadata: { conversation_id: conversationId },
    });

    const result = await respondInConversation(
      conversationId,
      organizationId,
      PROVIDER,
      supabase,
    );

    // A human took over while the model was thinking: the reply was discarded
    // rather than posted (ADR-038), so nothing goes out over WhatsApp either.
    if (result.discarded || !result.reply) {
      await finish("skipped", "A human took over this conversation.");
      return;
    }

    const sent = await sendReply(supabase, integration, waId, result.reply);
    await finish(sent.ok ? "processed" : "failed", sent.ok ? undefined : sent.error);
  } catch {
    // The inbound message is already recorded, so the business can still see it
    // and answer by hand.
    await finish("failed", "Could not generate or send a reply.");
  }
}

async function sendReply(
  supabase: ReturnType<typeof createServiceRoleClient>,
  integration: Integration,
  waId: string,
  body: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  void supabase;
  if (!integration.phone_number_id || !integration.access_token) {
    return { ok: false, error: "WhatsApp credentials are incomplete." };
  }

  // No service-window check here: we are replying to a message the customer
  // just sent, which is what opens the window in the first place.
  const result = await sendTextMessage(
    {
      phoneNumberId: integration.phone_number_id,
      accessToken: integration.access_token,
    },
    waId,
    body,
  );
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

/** Look the customer up by their WhatsApp number, or create them. */
async function findOrCreateCustomer(
  supabase: ReturnType<typeof createServiceRoleClient>,
  organizationId: string,
  waId: string,
  profileName: string | null,
): Promise<string> {
  const { data: existing } = await supabase
    .from("customers")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("external_channel", PROVIDER)
    .eq("external_customer_id", waId)
    .maybeSingle();

  if (existing) return (existing as { id: string }).id;

  const { data: created, error } = await supabase
    .from("customers")
    .insert({
      organization_id: organizationId,
      name: profileName,
      phone: `+${waId}`,
      external_channel: PROVIDER,
      external_customer_id: waId,
    })
    .select("id")
    .single();

  if (error || !created) {
    // Lost a race with a concurrent delivery; the unique index means the other
    // one has already created it.
    const { data: raced } = await supabase
      .from("customers")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("external_channel", PROVIDER)
      .eq("external_customer_id", waId)
      .single();
    return (raced as { id: string }).id;
  }

  return (created as { id: string }).id;
}

/** Continue the customer's open WhatsApp thread, or start one. */
async function findOrCreateConversation(
  supabase: ReturnType<typeof createServiceRoleClient>,
  organizationId: string,
  customerId: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .eq("channel", PROVIDER)
    .neq("status", "CLOSED")
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return (existing as { id: string }).id;

  const { data: created } = await supabase
    .from("conversations")
    .insert({
      organization_id: organizationId,
      customer_id: customerId,
      channel: PROVIDER,
      status: "AI_ACTIVE",
    })
    .select("id")
    .single();

  return (created as { id: string }).id;
}
