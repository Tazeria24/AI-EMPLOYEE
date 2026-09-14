"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "@/lib/organizations/service";
import { canManageOrg } from "@/lib/organizations/validation";
import { DEFAULT_INACTIVE_HOURS } from "./eligibility";

const BASE = "/dashboard/automations";

function fail(message: string): never {
  redirect(`${BASE}?error=${encodeURIComponent(message)}`);
}

async function requireManager() {
  const ctx = await getCurrentContext();
  if (!ctx) redirect("/login");
  if (!canManageOrg(ctx.role)) {
    fail("You do not have permission to manage automations.");
  }
  return ctx;
}

/** Create the one follow-up automation, disabled until the business enables it. */
export async function createFollowUpAutomation(): Promise<void> {
  const ctx = await requireManager();
  const supabase = await createClient();

  const { error } = await supabase.from("automations").insert({
    organization_id: ctx.organizationId,
    name: "Follow up on quiet leads",
    trigger_type: "lead_inactive",
    conditions: { inactive_hours: DEFAULT_INACTIVE_HOURS },
    action_type: "ai_followup",
    action_config: { channel: "conversation" },
    // Off by default: sending on a business's behalf is opt-in.
    enabled: false,
  });
  if (error) fail("Could not create the automation.");

  revalidatePath(BASE);
  redirect(BASE);
}

export async function setAutomationEnabled(formData: FormData): Promise<void> {
  const ctx = await requireManager();

  const id = formData.get("automationId");
  if (typeof id !== "string" || id.length === 0) fail("Missing automation id.");
  const enabled = formData.get("enabled") === "true";

  const supabase = await createClient();
  const { error } = await supabase
    .from("automations")
    .update({ enabled })
    .eq("id", id)
    .eq("organization_id", ctx.organizationId);
  if (error) fail("Could not update the automation.");

  revalidatePath(BASE);
  redirect(BASE);
}
