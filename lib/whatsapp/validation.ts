/** Validation for the business-facing WhatsApp connection form. */

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface WhatsAppConnectionInput {
  phoneNumberId: string;
  wabaId: string;
  displayPhoneNumber: string | null;
  /** null means "leave the stored value alone" — the form never echoes secrets. */
  verifyToken: string | null;
  appSecret: string | null;
  accessToken: string | null;
}

function optionalSecret(
  value: unknown,
  label: string,
  min: number,
  max: number,
): ParseResult<string | null> {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { ok: true, data: null };
  }
  const secret = value.trim();
  if (secret.length < min || secret.length > max) {
    return { ok: false, error: `${label} looks wrong — expected ${min}–${max} characters.` };
  }
  return { ok: true, data: secret };
}

export function parseWhatsAppConnection(
  input: Record<string, unknown>,
): ParseResult<WhatsAppConnectionInput> {
  const phoneNumberId =
    typeof input.phoneNumberId === "string" ? input.phoneNumberId.trim() : "";
  if (!/^\d{5,32}$/.test(phoneNumberId)) {
    return { ok: false, error: "Phone number ID must be the numeric ID from Meta." };
  }

  const wabaId = typeof input.wabaId === "string" ? input.wabaId.trim() : "";
  if (!/^\d{5,32}$/.test(wabaId)) {
    return { ok: false, error: "WhatsApp Business Account ID must be numeric." };
  }

  const displayRaw =
    typeof input.displayPhoneNumber === "string" ? input.displayPhoneNumber.trim() : "";
  if (displayRaw.length > 0 && !/^\+?[\d\s-]{6,24}$/.test(displayRaw)) {
    return { ok: false, error: "Display phone number looks wrong." };
  }

  const verifyToken = optionalSecret(input.verifyToken, "The verify token", 8, 256);
  if (!verifyToken.ok) return verifyToken;

  const appSecret = optionalSecret(input.appSecret, "The app secret", 16, 256);
  if (!appSecret.ok) return appSecret;

  const accessToken = optionalSecret(input.accessToken, "The access token", 20, 1024);
  if (!accessToken.ok) return accessToken;

  return {
    ok: true,
    data: {
      phoneNumberId,
      wabaId,
      displayPhoneNumber: displayRaw.length > 0 ? displayRaw : null,
      verifyToken: verifyToken.data,
      appSecret: appSecret.data,
      accessToken: accessToken.data,
    },
  };
}

/**
 * Normalize a WhatsApp number to digits, which is the form Meta's `to` field
 * and `wa_id` both use.
 */
export function normalizeWaId(value: string): string {
  return value.replace(/[^\d]/g, "");
}
