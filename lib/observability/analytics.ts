import { logger } from "./logger";
import { isSensitiveKey } from "./redact";

/**
 * Product analytics (PostHog).
 *
 * Two rules make this safe to call from anywhere:
 *
 *  1. **`distinctId` must be an opaque id** — an organization id or a hash,
 *     never an email. PostHog is a third party and this is customer data.
 *  2. **Properties are allow-listed by shape**: any property whose key looks
 *     like a secret or an identifier is dropped rather than redacted, because
 *     a `[redacted]` value in an analytics funnel is noise, not information.
 *
 * No-ops silently when unconfigured, so instrumenting a code path never means
 * adding a conditional at the call site.
 */
export async function trackEvent(
  event: string,
  distinctId: string,
  properties: Record<string, string | number | boolean> = {},
): Promise<void> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;

  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

  const safe: Record<string, string | number | boolean> = {};
  for (const [name, value] of Object.entries(properties)) {
    if (isSensitiveKey(name)) continue;
    if (typeof value === "string" && value.length > 200) continue;
    safe[name] = value;
  }

  try {
    await fetch(`${host.replace(/\/$/, "")}/i/v0/e/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        event,
        distinct_id: distinctId,
        properties: { ...safe, $lib: "ai-sales-employee" },
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Analytics is never worth failing a request over.
    logger.debug({ event: "analytics_send_failed", analyticsEvent: event });
  }
}
