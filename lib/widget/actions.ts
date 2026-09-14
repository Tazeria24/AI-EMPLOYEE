"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "@/lib/organizations/service";
import { canManageOrg } from "@/lib/organizations/validation";
import { parseWidgetSettings } from "./settings-validation";

const PAGE = "/dashboard/widget";

function fail(message: string): never {
  redirect(`${PAGE}?error=${encodeURIComponent(message)}`);
}

async function requireAdmin() {
  const ctx = await getCurrentContext();
  if (!ctx) redirect("/login");
  if (!canManageOrg(ctx.role)) {
    fail("You do not have permission to change the widget.");
  }
  return ctx;
}

/**
 * Turn the widget on or off.
 *
 * This is the kill switch for the only publicly reachable, money-spending
 * surface in the product, so it is one click and takes effect immediately:
 * every public function checks `enabled` on the way in.
 */
export async function setWidgetEnabled(formData: FormData): Promise<void> {
  const ctx = await requireAdmin();
  const enabled = formData.get("enabled") === "true";

  const supabase = await createClient();
  const { error } = await supabase
    .from("widget_settings")
    .update({ enabled })
    .eq("organization_id", ctx.organizationId);
  if (error) fail("Could not update the widget. Please try again.");

  revalidatePath(PAGE);
  redirect(PAGE);
}

/** Save greeting, colour, allowed websites and the spend caps. */
export async function saveWidgetSettings(formData: FormData): Promise<void> {
  const ctx = await requireAdmin();

  const parsed = parseWidgetSettings({
    greeting: formData.get("greeting"),
    themeColor: formData.get("themeColor"),
    allowedOrigins: formData.get("allowedOrigins"),
    maxMessagesPerSession: formData.get("maxMessagesPerSession"),
    maxMessagesPerDay: formData.get("maxMessagesPerDay"),
    maxSessionsPerDay: formData.get("maxSessionsPerDay"),
  });
  if (!parsed.ok) fail(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("widget_settings")
    .update({
      greeting: parsed.data.greeting,
      theme_color: parsed.data.themeColor,
      allowed_origins: parsed.data.allowedOrigins,
      max_messages_per_session: parsed.data.maxMessagesPerSession,
      max_messages_per_day: parsed.data.maxMessagesPerDay,
      max_sessions_per_day: parsed.data.maxSessionsPerDay,
    })
    .eq("organization_id", ctx.organizationId);
  if (error) fail("Could not save the widget settings. Please try again.");

  revalidatePath(PAGE);
  redirect(`${PAGE}?saved=1`);
}
