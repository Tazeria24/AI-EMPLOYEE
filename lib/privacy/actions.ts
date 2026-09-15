"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "@/lib/organizations/service";
import { canManageOrg } from "@/lib/organizations/validation";
import { recordSecurityEvent } from "@/lib/security/events";
import { isDeletionConfirmed, parseRetentionDays } from "./validation";

const PAGE = "/dashboard/privacy";

function fail(message: string): never {
  redirect(`${PAGE}?error=${encodeURIComponent(message)}`);
}

async function requireAdmin() {
  const ctx = await getCurrentContext();
  if (!ctx) redirect("/login");
  if (!canManageOrg(ctx.role)) {
    fail("You do not have permission to change privacy settings.");
  }
  return ctx;
}

/** Set how long customer conversations are kept. */
export async function saveRetention(formData: FormData): Promise<void> {
  const ctx = await requireAdmin();

  const parsed = parseRetentionDays(formData.get("retentionDays"));
  if (!parsed.ok) fail(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("business_profiles")
    .update({ retention_days: parsed.data })
    .eq("organization_id", ctx.organizationId);
  if (error) fail("Could not save the retention period. Please try again.");

  await recordSecurityEvent(supabase, {
    eventType: "retention_changed",
    severity: "info",
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    metadata: { retention_days: parsed.data },
  });

  revalidatePath(PAGE);
  redirect(`${PAGE}?saved=1`);
}

/**
 * Delete every customer record this organization holds.
 *
 * The NDPR erasure capability docs/SECURITY.md requires. It is irreversible
 * and takes a typed confirmation; the products, knowledge base and settings
 * are untouched, because this is erasure of customer data, not closing the
 * account.
 */
export async function purgeCustomerData(formData: FormData): Promise<void> {
  const ctx = await requireAdmin();

  if (!isDeletionConfirmed(formData.get("confirm"))) {
    fail('Type DELETE to confirm — this cannot be undone.');
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("purge_organization_customers", {
    p_organization_id: ctx.organizationId,
  });
  if (error) fail("Could not delete the customer data. Please try again.");

  revalidatePath("/", "layout");
  redirect(
    `${PAGE}?message=${encodeURIComponent(
      `Deleted ${(data as number | null) ?? 0} customer records.`,
    )}`,
  );
}
