import { timingSafeEqual } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { captureError } from "@/lib/observability/reporter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Same constant-time bearer check as the automations cron. */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";

  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Retention sweep.
 *
 * A retention policy that is only written down is not a retention policy — it
 * has to actually delete things. This runs `purge_expired_data()`, which drops
 * conversations past each organization's own retention period, redacts stored
 * webhook payloads after 30 days (they carry customer phone numbers), and
 * clears customers with nothing left attached to them.
 */
export async function POST(request: Request) {
  if (!authorized(request)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch {
    return Response.json({ error: "not_configured" }, { status: 503 });
  }

  try {
    const [{ data: purged }, { data: rateLimits }] = await Promise.all([
      supabase.rpc("purge_expired_data"),
      supabase.rpc("purge_rate_limits"),
    ]);

    const result = (purged as
      | { conversations_deleted: number; payloads_redacted: number }[]
      | null)?.[0] ?? { conversations_deleted: 0, payloads_redacted: 0 };

    logger.info({
      event: "retention.swept",
      conversationsDeleted: result.conversations_deleted,
      payloadsRedacted: result.payloads_redacted,
      rateLimitRowsPurged: (rateLimits as number | null) ?? 0,
    });

    return Response.json({
      conversationsDeleted: result.conversations_deleted,
      payloadsRedacted: result.payloads_redacted,
    });
  } catch (error) {
    await captureError(error, { event: "retention.failed" });
    return Response.json({ error: "sweep_failed" }, { status: 500 });
  }
}
