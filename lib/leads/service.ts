import { createClient } from "@/lib/supabase/server";
import type { Lead } from "./types";
import type { LeadCaptureValues } from "./validation";

/**
 * Create a customer + lead pair for an organization, and record the capture as
 * a lead event. Every write is scoped to the server-derived organizationId;
 * RLS enforces the same boundary independently.
 */
export async function captureLead(
  organizationId: string,
  values: LeadCaptureValues,
  source: string,
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
  await supabase.from("lead_events").insert({
    organization_id: organizationId,
    lead_id: leadId,
    event_type: "created",
    metadata: { source, intent: values.intent },
  });

  return { ok: true, leadId };
}

/** List the tenant's leads, newest first (RLS-scoped). */
export async function listLeads(): Promise<Lead[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("id, organization_id, customer_id, status, source, score, intent, notes, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as Lead[] | null) ?? [];
}
