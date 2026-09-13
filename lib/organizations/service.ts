import { createClient } from "@/lib/supabase/server";
import type { BusinessProfile, Organization, OrgRole } from "./types";

export interface CurrentContext {
  userId: string;
  organizationId: string;
  role: OrgRole;
  organization: Organization;
}

/**
 * Resolve the signed-in user's current organization + role. Returns the user's
 * first organization (by membership creation order). RLS scopes every query to
 * the caller, so this can never return another tenant's data.
 */
export async function getCurrentContext(): Promise<CurrentContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id, role, organizations(id, name, slug)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  // Embedded to-one relationship; the untyped client returns it as unknown.
  const organization = data.organizations as unknown as Organization;
  return {
    userId: user.id,
    organizationId: data.organization_id as string,
    role: data.role as OrgRole,
    organization,
  };
}

/** Fetch the business profile for an organization (RLS-scoped). */
export async function getBusinessProfile(
  organizationId: string,
): Promise<BusinessProfile | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("business_profiles")
    .select(
      "organization_id, business_name, business_type, website, phone, location, description, business_hours, currency, timezone",
    )
    .eq("organization_id", organizationId)
    .maybeSingle();

  return (data as BusinessProfile | null) ?? null;
}
