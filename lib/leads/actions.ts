"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "@/lib/organizations/service";
import { canManageOrg } from "@/lib/organizations/validation";
import { getConversation } from "@/lib/conversations/service";
import { getLead, recordLeadEvent } from "./service";
import { classifyTransition, isLeadStatus } from "./status";
import { parseLeadUpdate } from "./validation";

const BASE = "/dashboard/leads";

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

async function requireManager() {
  const ctx = await getCurrentContext();
  if (!ctx) redirect("/login");
  if (!canManageOrg(ctx.role)) {
    fail(BASE, "You do not have permission to manage leads.");
  }
  return ctx;
}

function readLeadId(formData: FormData): string {
  const id = formData.get("leadId");
  if (typeof id !== "string" || id.length === 0) fail(BASE, "Missing lead id.");
  return id;
}

/** Move a lead through the pipeline, recording the change on the timeline. */
export async function updateLeadStatus(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const id = readLeadId(formData);

  const status = formData.get("status");
  if (!isLeadStatus(status)) fail(`${BASE}/${id}`, "Unknown lead status.");

  const lead = await getLead(id);
  if (!lead) fail(BASE, "Lead not found.");

  const kind = classifyTransition(lead.status, status);
  if (kind === "invalid") {
    fail(`${BASE}/${id}`, "That lead is already at this status.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .update({ status })
    .eq("id", id)
    .eq("organization_id", ctx.organizationId);
  if (error) fail(`${BASE}/${id}`, "Could not update the lead status.");

  await recordLeadEvent(ctx.organizationId, id, "status_changed", {
    from: lead.status,
    to: status,
    kind,
  });

  revalidatePath(`${BASE}/${id}`);
  revalidatePath(BASE);
  redirect(`${BASE}/${id}`);
}

/** Edit score / intent / notes, recording only the fields that changed. */
export async function updateLeadDetails(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const id = readLeadId(formData);

  const parsed = parseLeadUpdate({
    score: formData.get("score"),
    intent: formData.get("intent"),
    notes: formData.get("notes"),
  });
  if (!parsed.ok) fail(`${BASE}/${id}`, parsed.error);

  const lead = await getLead(id);
  if (!lead) fail(BASE, "Lead not found.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .update({
      score: parsed.data.score,
      intent: parsed.data.intent,
      notes: parsed.data.notes,
    })
    .eq("id", id)
    .eq("organization_id", ctx.organizationId);
  if (error) fail(`${BASE}/${id}`, "Could not update the lead.");

  const changed: Record<string, unknown> = {};
  if (lead.score !== parsed.data.score) {
    changed.score = { from: lead.score, to: parsed.data.score };
  }
  if (lead.intent !== parsed.data.intent) {
    changed.intent = { from: lead.intent, to: parsed.data.intent };
  }
  if (lead.notes !== parsed.data.notes) changed.notes = "updated";

  if (Object.keys(changed).length > 0) {
    await recordLeadEvent(ctx.organizationId, id, "details_updated", changed);
  }

  revalidatePath(`${BASE}/${id}`);
  redirect(`${BASE}/${id}`);
}

/**
 * Create a lead from a conversation, reusing that conversation's customer so
 * the lead and the thread point at the same person.
 */
export async function createLeadFromConversation(
  formData: FormData,
): Promise<void> {
  const ctx = await requireManager();
  const conversationId = formData.get("conversationId");
  if (typeof conversationId !== "string" || conversationId.length === 0) {
    fail("/dashboard/conversations", "Missing conversation id.");
  }
  const conversationPath = `/dashboard/conversations/${conversationId}`;

  const conversation = await getConversation(conversationId);
  if (!conversation) fail("/dashboard/conversations", "Conversation not found.");

  const supabase = await createClient();

  // Don't create a second lead for a conversation that already has one.
  const { data: existing } = await supabase
    .from("leads")
    .select("id")
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (existing) {
    redirect(`${BASE}/${(existing as { id: string }).id}`);
  }

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      organization_id: ctx.organizationId,
      customer_id: conversation.customer_id,
      conversation_id: conversationId,
      status: "NEW",
      source: "conversation",
    })
    .select("id")
    .single();
  if (error || !lead) {
    fail(conversationPath, "Could not create a lead from this conversation.");
  }

  const leadId = (lead as { id: string }).id;
  await recordLeadEvent(ctx.organizationId, leadId, "created", {
    source: "conversation",
    conversation_id: conversationId,
  });

  revalidatePath(BASE);
  redirect(`${BASE}/${leadId}`);
}
