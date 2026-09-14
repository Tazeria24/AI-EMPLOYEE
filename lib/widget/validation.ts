/** Pure helpers for the public widget endpoints. */

export const MAX_MESSAGE_LENGTH = 2000;

/** Widget keys are 16 random bytes, hex encoded. */
export function isWidgetKey(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{32}$/.test(value);
}

/** Session tokens are 32 random bytes, hex encoded. */
export function isSessionToken(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

export function parseVisitorMessage(
  value: unknown,
): { ok: true; content: string } | { ok: false; error: string } {
  if (typeof value !== "string") {
    return { ok: false, error: "Message must be text." };
  }
  const content = value.trim();
  if (content.length === 0) {
    return { ok: false, error: "Type a message first." };
  }
  if (content.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: "That message is too long." };
  }
  return { ok: true, content };
}

/**
 * Build a Content-Security-Policy frame-ancestors value.
 * An empty allow-list means the business has not restricted embedding yet.
 */
export function frameAncestors(allowed: string[] | null | undefined): string {
  const origins = (allowed ?? []).filter(
    (origin) => typeof origin === "string" && /^https?:\/\/[^\s;'"]+$/.test(origin),
  );
  return origins.length === 0
    ? "frame-ancestors *"
    : `frame-ancestors 'self' ${origins.join(" ")}`;
}

/** Visitor-safe wording for each refusal the database can return. */
export function statusMessage(status: string): { code: number; message: string } {
  switch (status) {
    case "session_limit":
      return {
        code: 429,
        message: "This chat has reached its message limit. Please contact the shop directly.",
      };
    case "org_limit":
      return {
        code: 429,
        message: "The shop's assistant is busy right now. Please try again later.",
      };
    case "rate_limited":
      return { code: 429, message: "Too many chats right now. Please try again later." };
    case "unknown_session":
      return { code: 404, message: "This chat has expired. Please refresh to start again." };
    case "disabled":
      return { code: 403, message: "This chat is not available." };
    default:
      return { code: 400, message: "Could not send that message." };
  }
}
