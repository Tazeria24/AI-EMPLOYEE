"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "@/lib/organizations/service";
import { canManageOrg } from "@/lib/organizations/validation";
import { parseKnowledgeDocument } from "./validation";
import { processDocument } from "./processing";

const BASE = "/dashboard/knowledge";

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

async function requireManager() {
  const ctx = await getCurrentContext();
  if (!ctx) redirect("/login");
  if (!canManageOrg(ctx.role)) {
    fail(BASE, "You do not have permission to manage knowledge.");
  }
  return ctx;
}

export async function createKnowledgeDocument(formData: FormData): Promise<void> {
  const ctx = await requireManager();

  const parsed = parseKnowledgeDocument({
    title: formData.get("title"),
    sourceType: formData.get("sourceType"),
    sourceUrl: formData.get("sourceUrl"),
    content: formData.get("content"),
  });
  if (!parsed.ok) fail(`${BASE}/new`, parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("knowledge_documents")
    .insert({
      organization_id: ctx.organizationId,
      title: parsed.data.title,
      source_type: parsed.data.sourceType,
      source_url: parsed.data.sourceUrl,
      content: parsed.data.content,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !data) {
    fail(`${BASE}/new`, "Could not save the document. Please try again.");
  }

  // Index immediately; failures are recorded on the row and shown in the list.
  const result = await processDocument(
    (data as { id: string }).id,
    ctx.organizationId,
  );

  revalidatePath(BASE);
  if (!result.ok) {
    fail(BASE, `Saved, but indexing failed: ${result.error}`);
  }
  redirect(BASE);
}

export async function reprocessKnowledgeDocument(
  formData: FormData,
): Promise<void> {
  const ctx = await requireManager();
  const id = formData.get("id");
  if (typeof id !== "string" || id.length === 0) {
    fail(BASE, "Missing document id.");
  }

  const result = await processDocument(id, ctx.organizationId);
  revalidatePath(BASE);
  if (!result.ok) {
    fail(BASE, `Indexing failed: ${result.error}`);
  }
  redirect(BASE);
}

export async function deleteKnowledgeDocument(
  formData: FormData,
): Promise<void> {
  const ctx = await requireManager();
  const id = formData.get("id");
  if (typeof id !== "string" || id.length === 0) {
    fail(BASE, "Missing document id.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("knowledge_documents")
    .delete()
    .eq("id", id)
    .eq("organization_id", ctx.organizationId);
  if (error) {
    fail(BASE, "Could not delete the document. Please try again.");
  }

  revalidatePath(BASE);
  redirect(BASE);
}
