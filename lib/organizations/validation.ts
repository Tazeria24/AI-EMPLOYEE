import type { OrgRole } from "./types";

export interface BusinessProfileValues {
  businessName: string;
  businessType: string | null;
  website: string | null;
  phone: string | null;
  location: string | null;
  description: string | null;
}

/** Whether a role may manage the organization (write business-owned records). */
export function canManageOrg(role: OrgRole | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optional(value: unknown): string | null {
  const s = trimmed(value);
  return s.length > 0 ? s : null;
}

type ParseResult =
  | { ok: true; data: BusinessProfileValues }
  | { ok: false; error: string };

/** Validate and normalize business-profile input from an untrusted form. */
export function parseBusinessProfile(input: {
  businessName: unknown;
  businessType?: unknown;
  website?: unknown;
  phone?: unknown;
  location?: unknown;
  description?: unknown;
}): ParseResult {
  const businessName = trimmed(input.businessName);
  if (businessName.length < 2) {
    return { ok: false, error: "Business name must be at least 2 characters." };
  }
  if (businessName.length > 120) {
    return { ok: false, error: "Business name must be 120 characters or fewer." };
  }

  const website = optional(input.website);
  if (website && !/^https?:\/\/.+/.test(website)) {
    return { ok: false, error: "Website must start with http:// or https://" };
  }

  return {
    ok: true,
    data: {
      businessName,
      businessType: optional(input.businessType),
      website,
      phone: optional(input.phone),
      location: optional(input.location),
      description: optional(input.description),
    },
  };
}
