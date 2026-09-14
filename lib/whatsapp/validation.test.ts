import { describe, expect, it } from "vitest";
import { normalizeWaId, parseWhatsAppConnection } from "./validation";

const VALID = {
  phoneNumberId: "123456789012345",
  wabaId: "987654321098765",
  displayPhoneNumber: "+234 800 000 0000",
  verifyToken: "a-verify-token",
  appSecret: "0123456789abcdef0123",
  accessToken: "EAAG".concat("x".repeat(40)),
};

describe("parseWhatsAppConnection", () => {
  it("accepts a complete form", () => {
    const result = parseWhatsAppConnection(VALID);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.phoneNumberId).toBe("123456789012345");
  });

  it("treats blank secrets as 'keep what is stored'", () => {
    // The form can never show a stored secret, so blank must not erase it.
    const result = parseWhatsAppConnection({
      ...VALID,
      verifyToken: "",
      appSecret: "   ",
      accessToken: "",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.verifyToken).toBeNull();
      expect(result.data.appSecret).toBeNull();
      expect(result.data.accessToken).toBeNull();
    }
  });

  it.each([
    ["phoneNumberId", "not-numeric"],
    ["phoneNumberId", "123"],
    ["wabaId", ""],
    ["displayPhoneNumber", "call me maybe"],
  ])("rejects %s = %s", (field, value) => {
    expect(parseWhatsAppConnection({ ...VALID, [field]: value }).ok).toBe(false);
  });

  it("rejects a suspiciously short app secret", () => {
    expect(parseWhatsAppConnection({ ...VALID, appSecret: "short" }).ok).toBe(false);
  });

  it("omits the display number when left blank", () => {
    const result = parseWhatsAppConnection({ ...VALID, displayPhoneNumber: "" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.displayPhoneNumber).toBeNull();
  });
});

describe("normalizeWaId", () => {
  it("reduces a formatted number to digits", () => {
    expect(normalizeWaId("+234 811-111-1111")).toBe("2348111111111");
  });
});
