import type { SupabaseClient } from "@supabase/supabase-js";
import { getChatProvider } from "@/lib/ai/provider";
import { checkGrounding } from "@/lib/ai/guardrails/grounding";
import { getDeliveryProvider } from "@/lib/delivery";
import type { DeliveryChannel } from "@/lib/delivery/types";
import {
  evaluateCandidate,
  scheduleTime,
  type FollowUpCandidate,
} from "./eligibility";

/**
 * Draft a short follow-up.
 *
 * A follow-up is still a message from the business, so it goes through the
 * same grounding guardrail as a live reply: it must not state a price or stock
 * figure, because no tool was called to verify one. An ungrounded draft is
 * rejected rather than sent.
 */
async function draftFollowUp(
  businessName: string,
  customerName: string | null,
  intent: string | null,
  followUpNumber: number,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const provider = getChatProvider();

  const system = `You write short, warm follow-up messages on behalf of ${businessName}.

Rules:
- 2 sentences maximum. No greeting block, no signature.
- NEVER state a price, discount, stock level or delivery time. You have not looked any of those up.
- Do not invent order status or make promises.
- Invite the customer to reply. Be natural, not pushy.
${followUpNumber === 2 ? "- This is the second and final follow-up. Be gracious and low-pressure." : ""}`;

  const who = customerName ? `The customer is ${customerName}.` : "";
  const what = intent ? `They were interested in: ${intent}.` : "";

  const response = await provider.complete({
    systemStable: system,
    messages: [
      {
        role: "user",
        text: `${who} ${what} Write the follow-up message.`.trim(),
      },
    ],
    tools: [],
    maxTokens: 300,
  });

  const message = response.text.trim();
  if (message.length === 0) {
    return { ok: false, error: "The model returned an empty follow-up." };
  }

  // No tools ran, so there is no evidence: any price/stock claim is ungrounded.
  const grounding = checkGrounding(message, "");
  if (!grounding.ok) {
    return {
      ok: false,
      error: `Draft contained unverified claims (${grounding.violations
        .map((v) => v.kind)
        .join(", ")}).`,
    };
  }

  return { ok: true, message };
}

interface EligibleLeadRow {
  id: string;
  status: string;
  intent: string | null;
  conversation_id: string | null;
  updated_at: string;
  customers: {
    name: string | null;
    email: string | null;
    marketing_opt_out: boolean;
  } | null;
}

/**
 * Schedule follow-ups for leads that have gone quiet.
 *
 * Inserting the run reserves (lead_id, follow_up_number). If the scheduler
 * runs twice, or two firings overlap, the second insert violates the unique
 * index and is skipped — the database is what prevents the duplicate, not this
 * function.
 */
export async function scheduleDueFollowUps(
  supabase: SupabaseClient,
  organizationId: string,
  automationId: string,
  inactiveHours: number,
  timeZone: string,
  now: Date = new Date(),
): Promise<{ scheduled: number; skipped: number }> {
  const { data } = await supabase
    .from("leads")
    .select(
      "id, status, intent, conversation_id, updated_at, customers(name, email, marketing_opt_out)",
    )
    .eq("organization_id", organizationId)
    .in("status", ["NEW", "CONTACTED", "INTERESTED", "NEGOTIATING"]);

  const leads = (data as unknown as EligibleLeadRow[] | null) ?? [];
  if (leads.length === 0) return { scheduled: 0, skipped: 0 };

  // How many follow-ups each lead already has.
  const { data: runs } = await supabase
    .from("automation_runs")
    .select("lead_id, follow_up_number")
    .eq("organization_id", organizationId)
    .not("follow_up_number", "is", null);

  const sentCount = new Map<string, number>();
  for (const run of (runs as { lead_id: string }[] | null) ?? []) {
    sentCount.set(run.lead_id, (sentCount.get(run.lead_id) ?? 0) + 1);
  }

  let scheduled = 0;
  let skipped = 0;

  for (const lead of leads) {
    const customer = Array.isArray(lead.customers) ? lead.customers[0] : lead.customers;

    const candidate: FollowUpCandidate = {
      leadId: lead.id,
      lastActivityAt: lead.updated_at,
      followUpsSent: sentCount.get(lead.id) ?? 0,
      optedOut: customer?.marketing_opt_out ?? false,
      closed: lead.status === "WON" || lead.status === "LOST",
    };

    const verdict = evaluateCandidate(candidate, now, inactiveHours);
    if (!verdict.due) {
      skipped += 1;
      continue;
    }

    const { error } = await supabase.from("automation_runs").insert({
      organization_id: organizationId,
      automation_id: automationId,
      lead_id: lead.id,
      status: "scheduled",
      follow_up_number: verdict.followUpNumber,
      scheduled_for: scheduleTime(now, timeZone).toISOString(),
    });

    // 23505 = the (lead_id, follow_up_number) unique index did its job.
    if (error) {
      skipped += 1;
      continue;
    }
    scheduled += 1;
  }

  return { scheduled, skipped };
}

/** Execute one claimed run: draft, deliver, record. */
export async function executeRun(
  supabase: SupabaseClient,
  runId: string,
  organizationId: string,
  businessName: string,
  channel: DeliveryChannel,
): Promise<{ ok: boolean; error?: string }> {
  const { data: run } = await supabase
    .from("automation_runs")
    .select("id, lead_id, follow_up_number")
    .eq("id", runId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!run) return { ok: false, error: "Run not found." };

  const typedRun = run as { lead_id: string; follow_up_number: number | null };

  const { data: leadRow } = await supabase
    .from("leads")
    .select(
      "id, intent, conversation_id, customers(name, email, marketing_opt_out, external_channel, external_customer_id)",
    )
    .eq("id", typedRun.lead_id)
    // Explicit: the cron runner uses the service-role client, so RLS is not
    // enforcing the tenant boundary here — this filter is.
    .eq("organization_id", organizationId)
    .maybeSingle();

  const lead = leadRow as unknown as EligibleLeadRow | null;
  const customer = lead
    ? Array.isArray(lead.customers)
      ? lead.customers[0]
      : lead.customers
    : null;

  const finish = async (
    status: "sent" | "failed" | "skipped",
    error?: string,
    result?: Record<string, unknown>,
  ) => {
    await supabase
      .from("automation_runs")
      .update({
        status,
        executed_at: new Date().toISOString(),
        error: error ?? null,
        result: result ?? null,
        channel,
      })
      .eq("id", runId)
      .eq("organization_id", organizationId);
  };

  if (!lead) {
    await finish("skipped", "The lead no longer exists.");
    return { ok: false, error: "The lead no longer exists." };
  }

  // Re-check the opt-out at send time, not only at scheduling time.
  if (customer?.marketing_opt_out) {
    await finish("skipped", "The customer opted out of follow-ups.");
    return { ok: false, error: "Customer opted out." };
  }

  const draft = await draftFollowUp(
    businessName,
    customer?.name ?? null,
    lead.intent,
    typedRun.follow_up_number ?? 1,
  );
  if (!draft.ok) {
    await finish("failed", draft.error);
    return { ok: false, error: draft.error };
  }

  // WhatsApp may only be replied to within 24 hours of the customer's last
  // inbound message, so the provider needs to know when that was.
  let lastInboundAt: string | null = null;
  if (lead.conversation_id) {
    const { data: lastInbound } = await supabase
      .from("messages")
      .select("created_at")
      .eq("organization_id", organizationId)
      .eq("conversation_id", lead.conversation_id)
      .eq("sender_type", "customer")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    lastInboundAt = (lastInbound as { created_at: string } | null)?.created_at ?? null;
  }

  const provider = getDeliveryProvider(channel);
  const target = {
    organizationId,
    conversationId: lead.conversation_id,
    customerEmail: customer?.email ?? null,
    customerWaId:
      customer?.external_channel === "whatsapp"
        ? customer?.external_customer_id ?? null
        : null,
    lastInboundAt,
    customerName: customer?.name ?? null,
    businessName,
  };

  if (!provider.canDeliver(target)) {
    await finish("skipped", `No ${channel} address for this lead.`);
    return { ok: false, error: `No ${channel} address for this lead.` };
  }

  const delivery = await provider.send(supabase, target, draft.message);
  if (!delivery.ok) {
    await finish("failed", delivery.error);
    return { ok: false, error: delivery.error };
  }

  await finish("sent", undefined, { reference: delivery.reference });
  await supabase.from("lead_events").insert({
    organization_id: organizationId,
    lead_id: typedRun.lead_id,
    event_type: "follow_up_sent",
    metadata: { follow_up_number: typedRun.follow_up_number, channel },
  });

  return { ok: true };
}
