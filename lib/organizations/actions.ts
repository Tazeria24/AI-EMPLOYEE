"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "./service";
import { canManageOrg, parseBusinessProfile } from "./validation";

/** Save the organization's business profile during onboarding. */
export async function saveBusinessProfile(formData: FormData): Promise<void> {
  const ctx = await getCurrentContext();
  if (!ctx) {
    redirect("/login");
  }
  if (!canManageOrg(ctx.role)) {
    redirect(
      `/onboarding?error=${encodeURIComponent(
        "You do not have permission to edit this business.",
      )}`,
    );
  }

  const parsed = parseBusinessProfile({
    businessName: formData.get("businessName"),
    businessType: formData.get("businessType"),
    website: formData.get("website"),
    phone: formData.get("phone"),
    location: formData.get("location"),
    description: formData.get("description"),
  });
  if (!parsed.ok) {
    redirect(`/onboarding?error=${encodeURIComponent(parsed.error)}`);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("business_profiles")
    .update({
      business_name: parsed.data.businessName,
      business_type: parsed.data.businessType,
      website: parsed.data.website,
      phone: parsed.data.phone,
      location: parsed.data.location,
      description: parsed.data.description,
    })
    .eq("organization_id", ctx.organizationId);
  if (error) {
    redirect(
      `/onboarding?error=${encodeURIComponent(
        "Could not save your business profile. Please try again.",
      )}`,
    );
  }

  // Keep the organization name in step with the business name.
  await supabase
    .from("organizations")
    .update({ name: parsed.data.businessName })
    .eq("id", ctx.organizationId);

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
