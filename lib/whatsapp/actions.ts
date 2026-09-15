"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "@/lib/organizations/service";
import { canManageOrg } from "@/lib/organizations/validation";
import { planLimitMessage } from "@/lib/billing/errors";
import { parseWhatsAppConnection } from "./validation";

const PAGE = "/dashboard/whatsapp";

function fail(message: string): never {
  redirect(`${PAGE}?error=${encodeURIComponent(message)}`);
}

async function requireAdmin() {
  const ctx = await getCurrentContext();
  if (!ctx) redirect("/login");
  if (!canManageOrg(ctx.role)) {
    fail("You do not have permission to change the WhatsApp connection.");
  }
  return ctx;
}

/**
 * Save the connection details.
 *
 * Secrets are write-only: a blank field means "leave the stored value alone",
 * because the form has no way to show what is stored and must not silently
 * erase it. Saving never turns the integration on — that is a separate,
 * deliberate action.
 */
export async function saveWhatsAppConnection(formData: FormData): Promise<void> {
  const ctx = await requireAdmin();

  const parsed = parseWhatsAppConnection({
    phoneNumberId: formData.get("phoneNumberId"),
    wabaId: formData.get("wabaId"),
    displayPhoneNumber: formData.get("displayPhoneNumber"),
    verifyToken: formData.get("verifyToken"),
    appSecret: formData.get("appSecret"),
    accessToken: formData.get("accessToken"),
  });
  if (!parsed.ok) fail(parsed.error);

  const update: Record<string, unknown> = {
    phone_number_id: parsed.data.phoneNumberId,
    waba_id: parsed.data.wabaId,
    display_phone_number: parsed.data.displayPhoneNumber,
  };
  if (parsed.data.verifyToken) update.verify_token = parsed.data.verifyToken;
  if (parsed.data.appSecret) update.app_secret = parsed.data.appSecret;
  if (parsed.data.accessToken) update.access_token = parsed.data.accessToken;

  const supabase = await createClient();
  const { error } = await supabase
    .from("whatsapp_integrations")
    .update(update)
    .eq("organization_id", ctx.organizationId);
  if (error) {
    // A duplicate phone number id means another organization already claimed it.
    fail(
      error.code === "23505"
        ? "That phone number is already connected to another account."
        : "Could not save the WhatsApp connection. Please try again.",
    );
  }

  revalidatePath(PAGE);
  redirect(`${PAGE}?saved=1`);
}

/**
 * Turn the integration on or off.
 *
 * Turning it ON is the point where this product starts sending real messages
 * to real customers, which CLAUDE.md makes a founder decision — so it is a
 * separate, explicit action, it starts off, and it refuses until every
 * credential is present.
 */
export async function setWhatsAppEnabled(formData: FormData): Promise<void> {
  const ctx = await requireAdmin();
  const enabled = formData.get("enabled") === "true";

  const supabase = await createClient();

  if (enabled) {
    const { data } = await supabase
      .from("whatsapp_integration_status")
      .select("phone_number_id, has_verify_token, has_app_secret, has_access_token")
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    const status = data as
      | {
          phone_number_id: string | null;
          has_verify_token: boolean;
          has_app_secret: boolean;
          has_access_token: boolean;
        }
      | null;

    if (
      !status?.phone_number_id ||
      !status.has_verify_token ||
      !status.has_app_secret ||
      !status.has_access_token
    ) {
      fail("Add every credential before turning WhatsApp on.");
    }
  }

  const { error } = await supabase
    .from("whatsapp_integrations")
    .update({ enabled })
    .eq("organization_id", ctx.organizationId);
  if (error) {
    // WhatsApp is a paid-tier channel; the plan trigger refuses it on Starter.
    fail(planLimitMessage(error, "Could not update the WhatsApp connection. Please try again."));
  }

  revalidatePath(PAGE);
  redirect(PAGE);
}
