import { timingSafeEqual } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { DEFAULT_INACTIVE_HOURS } from "@/lib/automations/eligibility";
import { executeRun, scheduleDueFollowUps } from "@/lib/automations/runner";
import type { DeliveryChannel } from "@/lib/delivery/types";

export const dynamic = "force-dynamic";
/** Cap the work per firing so one invocation cannot run away. */
const MAX_RUNS_PER_INVOCATION = 25;

/**
 * Constant-time bearer check. This endpoint is a public URL, so a plain
 * string comparison would leak the secret one byte at a time under timing
 * analysis.
 */
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
 * Automations tick, driven by Vercel Cron (ADR-005).
 *
 * Runs with no user session, so it uses the service-role client — see
 * lib/supabase/admin.ts for why that is allowed here and the rules it carries.
 * Every query it makes is explicitly scoped by organization_id.
 */
export async function POST(request: Request) {
  if (!authorized(request)) {
    // Deliberately terse: do not reveal whether the secret is unset or wrong.
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch {
    return new Response(JSON.stringify({ error: "not_configured" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }

  const now = new Date();
  let scheduled = 0;
  let executed = 0;
  let failed = 0;

  // 1. Schedule follow-ups for every enabled automation.
  const { data: automations } = await supabase
    .from("automations")
    .select("id, organization_id, conditions, action_config")
    .eq("enabled", true);

  for (const automation of (automations as
    | {
        id: string;
        organization_id: string;
        conditions: { inactive_hours?: number } | null;
        action_config: { channel?: DeliveryChannel } | null;
      }[]
    | null) ?? []) {
    const { data: profile } = await supabase
      .from("business_profiles")
      .select("timezone")
      .eq("organization_id", automation.organization_id)
      .maybeSingle();

    const timeZone = (profile as { timezone?: string } | null)?.timezone ?? "UTC";

    const result = await scheduleDueFollowUps(
      supabase,
      automation.organization_id,
      automation.id,
      automation.conditions?.inactive_hours ?? DEFAULT_INACTIVE_HOURS,
      timeZone,
      now,
    );
    scheduled += result.scheduled;
  }

  // 2. Execute runs that are due, claiming each one atomically first.
  const { data: due } = await supabase
    .from("automation_runs")
    .select("id, organization_id, automation_id")
    .eq("status", "scheduled")
    .lte("scheduled_for", now.toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(MAX_RUNS_PER_INVOCATION);

  for (const run of (due as
    | { id: string; organization_id: string; automation_id: string }[]
    | null) ?? []) {
    // Atomic: if another worker already claimed this run, we get nothing back
    // and skip it rather than sending the follow-up twice.
    const { data: claimed } = await supabase.rpc("claim_automation_run", {
      p_run_id: run.id,
    });
    if (!claimed) continue;

    const [{ data: profile }, { data: automation }] = await Promise.all([
      supabase
        .from("business_profiles")
        .select("business_name")
        .eq("organization_id", run.organization_id)
        .maybeSingle(),
      supabase
        .from("automations")
        .select("action_config")
        .eq("id", run.automation_id)
        .eq("organization_id", run.organization_id)
        .maybeSingle(),
    ]);

    const businessName =
      (profile as { business_name?: string } | null)?.business_name ?? "the business";
    const channel =
      (automation as { action_config?: { channel?: DeliveryChannel } } | null)
        ?.action_config?.channel ?? "conversation";

    const outcome = await executeRun(
      supabase,
      run.id,
      run.organization_id,
      businessName,
      channel,
    );
    if (outcome.ok) executed += 1;
    else failed += 1;
  }

  return Response.json({ scheduled, executed, failed });
}
