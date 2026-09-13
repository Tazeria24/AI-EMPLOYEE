export type OrgRole = "owner" | "admin" | "member";

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

export interface BusinessProfile {
  organization_id: string;
  business_name: string | null;
  business_type: string | null;
  website: string | null;
  phone: string | null;
  location: string | null;
  description: string | null;
  business_hours: unknown | null;
  currency: string;
  timezone: string;
}
