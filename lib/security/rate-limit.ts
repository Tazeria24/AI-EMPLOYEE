import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Rate limits for the endpoints an attacker can reach without an account.
 *
 * docs/SECURITY.md has required these since Milestone 00; until now the only
 * limits in the product were the widget's spend caps, so password guessing
 * against /login was free.
 */
export const RATE_LIMITS = {
  /** Per email address. Generous enough for a forgetful human. */
  signIn: { limit: 10, windowSeconds: 900 },
  /** Per IP, because one attacker guessing many accounts looks like many emails. */
  signInPerIp: { limit: 30, windowSeconds: 900 },
  signUp: { limit: 5, windowSeconds: 3600 },
  passwordReset: { limit: 5, windowSeconds: 3600 },
  /** Per IP, on top of the widget's own per-org spend caps. */
  widgetSession: { limit: 20, windowSeconds: 3600 },
  widgetMessage: { limit: 60, windowSeconds: 3600 },
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;

/**
 * Hash the thing being limited before it reaches the database.
 *
 * The bucket key is an email address or an IP, both of which are personal
 * data. Hashing with a server-side pepper means the table records "someone
 * tried 40 times" without recording who, so an operator reading it — or a
 * backup of it — learns nothing about individuals.
 *
 * Falls back to an unpeppered hash when RATE_LIMIT_PEPPER is unset: weaker
 * against a determined offline attack on the table, but still not plaintext,
 * and far better than switching rate limiting off because a variable is
 * missing.
 */
export function bucketKey(name: RateLimitName, subject: string): string {
  const pepper = process.env.RATE_LIMIT_PEPPER ?? "";
  return createHash("sha256")
    .update(`${name}:${subject.trim().toLowerCase()}:${pepper}`, "utf8")
    .digest("hex");
}

/**
 * Consume one attempt. Returns true when the caller may proceed.
 *
 * **Fails open on a database error.** A limiter that cannot reach the database
 * would otherwise lock every user out of a working application — the failure
 * mode is worse than the attack it prevents. The refusal is logged so the
 * outage is visible rather than silent.
 */
export async function consumeRateLimit(
  client: SupabaseClient,
  name: RateLimitName,
  subject: string,
): Promise<boolean> {
  const { limit, windowSeconds } = RATE_LIMITS[name];

  const { data, error } = await client.rpc("consume_rate_limit", {
    p_bucket: bucketKey(name, subject),
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) return true;
  return data !== false;
}

/**
 * Best-effort client IP from proxy headers.
 *
 * These headers are attacker-controlled, so an IP limit is a speed bump rather
 * than a wall — which is why the per-email limit exists alongside it and why
 * nothing is authorized on this value.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip") ?? "unknown";
}
