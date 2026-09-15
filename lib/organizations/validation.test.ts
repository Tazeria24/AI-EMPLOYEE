import { describe, it, expect } from "vitest";
import { canManageOrg, parseBusinessProfile } from "@/lib/organizations/validation";

describe("canManageOrg", () => {
  it("allows owner and admin", () => {
    expect(canManageOrg("owner")).toBe(true);
    expect(canManageOrg("admin")).toBe(true);
  });
  it("denies member and missing role", () => {
    expect(canManageOrg("member")).toBe(false);
    expect(canManageOrg(null)).toBe(false);
    expect(canManageOrg(undefined)).toBe(false);
  });
});

describe("parseBusinessProfile", () => {
  it("accepts and normalizes a valid profile", () => {
    const result = parseBusinessProfile({
      businessName: "  Ada Fashion  ",
      businessType: " fashion ",
      website: "https://ada.example",
      phone: "",
      location: "Lagos",
      description: "",
    });
    expect(result).toEqual({
      ok: true,
      data: {
        businessName: "Ada Fashion",
        businessType: "fashion",
        website: "https://ada.example",
        phone: null,
        location: "Lagos",
        description: null,
      },
    });
  });

  it("requires a business name of at least 2 characters", () => {
    expect(parseBusinessProfile({ businessName: "A" }).ok).toBe(false);
    expect(parseBusinessProfile({ businessName: "   " }).ok).toBe(false);
  });

  it("rejects an overly long business name", () => {
    expect(parseBusinessProfile({ businessName: "x".repeat(121) }).ok).toBe(false);
  });

  it("rejects a website without http(s)://", () => {
    const result = parseBusinessProfile({
      businessName: "Valid Co",
      website: "ada.example",
    });
    expect(result.ok).toBe(false);
  });

  it("handles non-string input safely", () => {
    const result = parseBusinessProfile({ businessName: 123 });
    expect(result.ok).toBe(false);
  });
});
