import { createClient } from "@/lib/supabase/server";
import type { Lead, LeadEvent, LeadStatus, LeadWithCustomer } from "./types";
import type { LeadCaptureValues } from "./validation";

const LEAD_COLUMNS =
  "id, organization_id, customer_id, conversation_id, status, source, score, intent, notes, created_at, updated_at";

/** Normalize supabase-js's embedded-relation shape (object or array). */
function one<T>(related: T | T[] | null | undefined): T | undefined {
  return Array.isArray(related) ? related[0] : (related ?? undefined);
}

/**
 * Record an activity-timeline entry. Every change to a lead goes through here
 * so the timeline is the complete history rather than a partial one.
 */
export async function recordLeadEvent(
  organizationId: string,
  leadId: string,
  eventType: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const supabase = await createClient();
  await supabase.from("lead_events").insert({
    organization_id: organizationId,
    lead_id: leadId,
    event_type: eventType,
    metadata,
  });
}

/**
 * Create a customer + lead pair for an organization, and record the capture as
 * a lead event. Every write is scoped to the server-derived organizationId;
 * RLS enforces the same boundary independently.
 */
export async function captureLead(
  organizationId: string,
  values: LeadCaptureValues,
  source: string,
  conversationId: string | null = null,
): Promise<{ ok: true; leadId: string } | { ok: false; error: string }> {
  const supabase = await createClient();

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .insert({
      organization_id: organizationId,
      name: values.contactName,
      email: values.contactEmail,
      phone: values.contactPhone,
      external_channel: source,
    })
    .select("id")
    .single();
  if (customerError || !customer) {
    return { ok: false, error: "Could not save the customer record." };
  }

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .insert({
      organization_id: organizationId,
      customer_id: (customer as { id: string }).id,
      conversation_id: conversationId,
      status: "NEW",
      source,
      intent: values.intent,
      notes: values.notes,
    })
    .select("id")
    .single();
  if (leadError || !lead) {
    return { ok: false, error: "Could not save the lead." };
  }

  const leadId = (lead as { id: string }).id;
  await recordLeadEvent(organizationId, leadId, "created", {
    source,
    intent: values.intent,
    conversation_id: conversationId,
  });

  return { ok: true, leadId };
}

export interface ListLeadsFilters {
  status?: LeadStatus;
  search?: string;
}

/** List the tenant's leads with contact details (RLS-scoped), newest first. */
export async function listLeads(
  filters: ListLeadsFilters = {},
): Promise<LeadWithCustomer[]> {
  const supabase = await createClient();

  let query = supabase
    .from("leads")
    .select(`${LEAD_COLUMNS}, customers(name, email, phone)`)
    .order("created_at", { ascending: false })
    .limit(200);

  if (filters.status) query = query.eq("status", filters.status);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  type Row = Lead & {
    customers?:
      | { name: string | null; email: string | null; phone: string | null }
      | { name: string | null; email: string | null; phone: string | null }[]
      | null;
  };

  const rows = (data as unknown as Row[] | null) ?? [];
  const mapped = rows.map((row) => {
    const customer = one(row.customers);
    return {
      ...row,
      customer_name: customer?.name ?? null,
      customer_email: customer?.email ?? null,
      customer_phone: customer?.phone ?? null,
    };
  });

  if (!filters.search) return mapped;

  // Small result set already scoped by RLS, so filter in memory rather than
  // building an `or` across an embedded relation.
  const term = filters.search.toLowerCase();
  return mapped.filter((lead) =>
    [lead.customer_name, lead.customer_email, lead.customer_phone, lead.intent, lead.notes]
      .some((field) => field?.toLowerCase().includes(term)),
  );
}

export async function getLead(id: string): Promise<LeadWithCustomer | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select(`${LEAD_COLUMNS}, customers(name, email, phone)`)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;

  type Row = Lead & {
    customers?:
      | { name: string | null; email: string | null; phone: string | null }
      | { name: string | null; email: string | null; phone: string | null }[]
      | null;
  };
  const row = data as unknown as Row;
  const customer = one(row.customers);
  return {
    ...row,
    customer_name: customer?.name ?? null,
    customer_email: customer?.email ?? null,
    customer_phone: customer?.phone ?? null,
  };
}

/** The lead's activity timeline, newest first (RLS-scoped). */
export async function listLeadEvents(leadId: string): Promise<LeadEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_events")
    .select("id, lead_id, event_type, metadata, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as LeadEvent[] | null) ?? [];
}

/** Count of leads per status, for the pipeline header. */
export async function countLeadsByStatus(): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("leads").select("status");
  if (error) throw new Error(error.message);

  const counts: Record<string, number> = {};
  for (const row of (data as { status: string }[] | null) ?? []) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }
  return counts;
}
