"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "@/lib/organizations/service";
import { canManageOrg } from "@/lib/organizations/validation";
import { getConversation } from "./service";
import { canSend, nextStatus, type ConversationAction } from "./state";

const BASE = "/dashboard/conversations";

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

async function requireManager() {
  const ctx = await getCurrentContext();
  if (!ctx) redirect("/login");
  if (!canManageOrg(ctx.role)) {
    fail(BASE, "You do not have permission to manage conversations.");
  }
  return ctx;
}

function readId(formData: FormData): string {
  const id = formData.get("conversationId");
  if (typeof id !== "string" || id.length === 0) {
    fail(BASE, "Missing conversation id.");
  }
  return id;
}

/** Apply a state transition (takeover / release / close / reopen). */
async function transition(
  formData: FormData,
  action: ConversationAction,
): Promise<void> {
  const ctx = await requireManager();
  const id = readId(formData);

  const conversation = await getConversation(id);
  if (!conversation) fail(BASE, "Conversation not found.");

  const target = nextStatus(conversation.status, action);
  if (!target) {
    fail(`${BASE}/${id}`, `Cannot ${action} a conversation that is ${conversation.status}.`);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("conversations")
    .update({
      status: target,
      assigned_to: target === "HUMAN_ACTIVE" ? ctx.userId : null,
    })
    .eq("id", id)
    .eq("organization_id", ctx.organizationId);
  if (error) fail(`${BASE}/${id}`, "Could not update the conversation.");

  revalidatePath(`${BASE}/${id}`);
  redirect(`${BASE}/${id}`);
}

export async function takeOverConversation(formData: FormData): Promise<void> {
  return transition(formData, "takeover");
}
export async function releaseConversation(formData: FormData): Promise<void> {
  return transition(formData, "release");
}
export async function closeConversation(formData: FormData): Promise<void> {
  return transition(formData, "close");
}
export async function reopenConversation(formData: FormData): Promise<void> {
  return transition(formData, "reopen");
}

/** Post a reply as the human who has taken the conversation over. */
export async function sendHumanMessage(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const id = readId(formData);

  const raw = formData.get("content");
  const content = typeof raw === "string" ? raw.trim().slice(0, 4000) : "";
  if (content.length === 0) {
    fail(`${BASE}/${id}`, "Type a message first.");
  }

  const conversation = await getConversation(id);
  if (!conversation) fail(BASE, "Conversation not found.");
  if (!canSend(conversation.status, "human")) {
    fail(
      `${BASE}/${id}`,
      "Take over the conversation before replying, so you and the AI don't both answer.",
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.from("messages").insert({
    organization_id: ctx.organizationId,
    conversation_id: id,
    sender_type: "human",
    content,
  });
  if (error) fail(`${BASE}/${id}`, "Could not send the message.");

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", ctx.organizationId);

  revalidatePath(`${BASE}/${id}`);
  redirect(`${BASE}/${id}`);
}

/** Ask the AI to reply to the latest customer message in this conversation. */
export async function requestAiReply(formData: FormData): Promise<void> {
  const ctx = await requireManager();
  const id = readId(formData);

  const conversation = await getConversation(id);
  if (!conversation) fail(BASE, "Conversation not found.");
  if (!canSend(conversation.status, "ai")) {
    fail(`${BASE}/${id}`, "The AI only replies while the conversation is AI-active.");
  }

  let result;
  try {
    const { respondInConversation } = await import("@/lib/ai/agent/respond");
    result = await respondInConversation(id, ctx.organizationId, ctx.userId);
  } catch {
    fail(
      `${BASE}/${id}`,
      "The assistant could not reply. Check that ANTHROPIC_API_KEY is configured.",
    );
  }

  revalidatePath(`${BASE}/${id}`);
  if (result.discarded) {
    fail(
      `${BASE}/${id}`,
      "The conversation was taken over while the AI was replying, so its reply was discarded.",
    );
  }
  redirect(`${BASE}/${id}`);
}
