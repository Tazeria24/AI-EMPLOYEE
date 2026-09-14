/** Validation for the business-facing widget settings form. */

export interface WidgetSettingsInput {
  greeting: string;
  themeColor: string;
  allowedOrigins: string[];
  maxMessagesPerSession: number;
  maxMessagesPerDay: number;
  maxSessionsPerDay: number;
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

function parseCount(
  value: unknown,
  label: string,
  min: number,
  max: number,
): ParseResult<number> {
  const count = Number(typeof value === "string" ? value.trim() : value);
  if (!Number.isInteger(count) || count < min || count > max) {
    return { ok: false, error: `${label} must be a whole number between ${min} and ${max}.` };
  }
  return { ok: true, data: count };
}

/**
 * Origins are matched against a strict scheme://host[:port] shape. Anything
 * looser (a path, a wildcard, a stray quote or semicolon) would end up inside
 * a Content-Security-Policy header, where it could change the meaning of the
 * whole directive.
 */
export function parseOrigins(value: unknown): ParseResult<string[]> {
  const raw = typeof value === "string" ? value : "";
  const entries = raw
    .split(/[\s,]+/)
    .map((entry) => entry.trim().replace(/\/$/, ""))
    .filter((entry) => entry.length > 0);

  const origins: string[] = [];
  for (const entry of entries) {
    if (!/^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/.test(entry)) {
      return {
        ok: false,
        error: `"${entry}" is not a valid site address. Use the form https://example.com.`,
      };
    }
    if (!origins.includes(entry)) origins.push(entry);
  }
  if (origins.length > 20) {
    return { ok: false, error: "You can allow at most 20 websites." };
  }
  return { ok: true, data: origins };
}

export function parseWidgetSettings(
  input: Record<string, unknown>,
): ParseResult<WidgetSettingsInput> {
  const greeting = typeof input.greeting === "string" ? input.greeting.trim() : "";
  if (greeting.length < 2 || greeting.length > 300) {
    return { ok: false, error: "The greeting must be between 2 and 300 characters." };
  }

  const themeColor =
    typeof input.themeColor === "string" ? input.themeColor.trim() : "";
  if (!/^#[0-9a-fA-F]{6}$/.test(themeColor)) {
    return { ok: false, error: "Pick a colour in the form #0F5C63." };
  }

  const origins = parseOrigins(input.allowedOrigins);
  if (!origins.ok) return origins;

  const perSession = parseCount(
    input.maxMessagesPerSession,
    "Messages per chat",
    1,
    200,
  );
  if (!perSession.ok) return perSession;

  const perDay = parseCount(input.maxMessagesPerDay, "Messages per day", 1, 100000);
  if (!perDay.ok) return perDay;

  const sessionsPerDay = parseCount(
    input.maxSessionsPerDay,
    "Chats per day",
    1,
    100000,
  );
  if (!sessionsPerDay.ok) return sessionsPerDay;

  return {
    ok: true,
    data: {
      greeting,
      themeColor,
      allowedOrigins: origins.data,
      maxMessagesPerSession: perSession.data,
      maxMessagesPerDay: perDay.data,
      maxSessionsPerDay: sessionsPerDay.data,
    },
  };
}
