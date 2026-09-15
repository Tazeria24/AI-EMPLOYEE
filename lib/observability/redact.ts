/**
 * Redaction for anything that reaches a log line or an error report.
 *
 * docs/SECURITY.md: "log security-relevant events without logging secrets or
 * full PII". A log that quietly carries an access token or a customer's phone
 * number turns every downstream system — the host's log viewer, Sentry, a
 * support screenshot — into a place that PII now lives.
 *
 * Two layers, because either alone leaks:
 *   - **By key**: anything named like a secret is replaced wholesale, however
 *     it is formatted.
 *   - **By shape**: free text is scrubbed for emails, phone numbers and
 *     long token-like strings, because they turn up inside messages and
 *     stack traces where no key names them.
 */

export const REDACTED = "[redacted]";

/** Substrings that mark a key as carrying a secret or an identifier. */
const SENSITIVE_KEY_PATTERNS = [
  "password",
  "secret",
  "token",
  "api_key",
  "apikey",
  "_key",
  "authorization",
  "auth",
  "cookie",
  "session",
  "credential",
  "signature",
  "access_key",
  "private",
  "email",
  "phone",
  "wa_id",
  "dsn",
];

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** International-ish phone numbers: 9+ digits, optionally punctuated. */
const PHONE = /(?<![\w.])\+?\d[\d\s().-]{7,}\d(?![\w.])/g;
/** Long unbroken alphanumeric runs — the shape of a key, token or hash. */
const TOKEN = /(?<![\w-])[A-Za-z0-9_-]{32,}(?![\w-])/g;

export function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  // A trailing "key" catches SUPABASE_SERVICE_ROLE_KEY, anthropicKey and the
  // like without needing every name enumerated. Over-redacting a field that
  // merely ends in "key" costs one log line; missing one costs a credential.
  if (lower.endsWith("key")) return true;
  return SENSITIVE_KEY_PATTERNS.some((pattern) => lower.includes(pattern));
}

/** Scrub PII-shaped substrings out of free text. */
export function redactText(value: string): string {
  return value
    .replace(EMAIL, REDACTED)
    .replace(TOKEN, REDACTED)
    .replace(PHONE, REDACTED);
}

/**
 * Deep-redact a value for logging.
 *
 * Unknown shapes are handled rather than trusted: cycles become `[circular]`,
 * anything past a sane depth becomes `[truncated]`, and a non-serializable
 * value becomes its type name. A logger that throws while logging an error is
 * worse than no logger.
 */
export function redact(value: unknown, maxDepth = 6): unknown {
  return redactInternal(value, maxDepth, new WeakSet());
}

function redactInternal(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") return redactText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") {
    return `[${typeof value}]`;
  }

  if (depth <= 0) return "[truncated]";

  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactText(value.message),
      stack: value.stack ? redactText(value.stack) : undefined,
    };
  }

  if (typeof value === "object") {
    if (seen.has(value)) return "[circular]";
    seen.add(value);

    if (Array.isArray(value)) {
      return value.slice(0, 50).map((item) => redactInternal(item, depth - 1, seen));
    }

    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key)
        ? REDACTED
        : redactInternal(item, depth - 1, seen);
    }
    return out;
  }

  return `[${typeof value}]`;
}
