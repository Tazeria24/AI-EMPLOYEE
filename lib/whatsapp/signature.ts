import { createHmac, timingSafeEqual } from "node:crypto";

const PREFIX = "sha256=";

/**
 * Verify Meta's `X-Hub-Signature-256` header.
 *
 * Two things decide whether this is real security or theatre:
 *
 *  - **It must hash the raw body**, byte for byte as it arrived. Re-serializing
 *    the parsed JSON produces different bytes (key order, whitespace, unicode
 *    escaping) and the signature will never match — or worse, someone
 *    "fixes" that by skipping verification.
 *  - **The comparison must be constant time.** A byte-at-a-time comparison
 *    leaks the expected digest under timing analysis, which is enough to forge
 *    a signature. Same reasoning as the cron secret check.
 *
 * Returns false for anything malformed rather than throwing: a forged request
 * should get a flat 401, not a stack trace.
 */
export function verifySignature(
  rawBody: string,
  header: string | null | undefined,
  appSecret: string | null | undefined,
): boolean {
  if (!appSecret) return false;
  if (typeof header !== "string" || !header.startsWith(PREFIX)) return false;

  const provided = header.slice(PREFIX.length);
  // Hex of a SHA-256 digest is always 64 characters; reject early so the
  // Buffer comparison below is always same-length.
  if (!/^[0-9a-f]{64}$/i.test(provided)) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");

  const a = Buffer.from(provided.toLowerCase(), "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Sign a body the way Meta does. Used by tests and by nothing else. */
export function signBody(rawBody: string, appSecret: string): string {
  return `${PREFIX}${createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex")}`;
}

/**
 * The GET subscribe handshake. Meta sends `hub.mode`, `hub.verify_token` and
 * `hub.challenge`; we echo the challenge back verbatim only if the token
 * matches the one the business configured.
 */
export function verifyHandshake(
  mode: string | null,
  token: string | null,
  storedToken: string | null | undefined,
): boolean {
  if (mode !== "subscribe") return false;
  if (!storedToken || typeof token !== "string") return false;

  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(storedToken, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
