import { createClient } from "@/lib/supabase/server";
import type { Subscription, UsageAgainstLimits } from "./types";

const SUBSCRIPTION_COLUMNS =
  "organization_id, provider, provider_customer_id, provider_subscription_id, plan, status, current_period_start, current_period_end, cancel_at_period_end";

/**
 * The tenant's subscription (RLS-scoped, read-only).
 *
 * There is no companion write function on purpose: `authenticated` has no
 * UPDATE grant on `subscriptions` at all (migration 0010). Subscription state
 * is written only by the verified payment webhook.
 */
export async function getSubscription(): Promise<Subscription | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscriptions")
    .select(SUBSCRIPTION_COLUMNS)
    .maybeSingle();
  return (data as Subscription | null) ?? null;
}

/** Current usage of the things a plan caps. */
export async function getUsageAgainstLimits(): Promise<UsageAgainstLimits> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [products, documents, automations, usage] = await Promise.all([
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .neq("status", "archived"),
    supabase.from("knowledge_documents").select("id", { count: "exact", head: true }),
    supabase.from("automations").select("id", { count: "exact", head: true }),
    supabase
      .from("org_usage_daily")
      .select("widget_messages")
      .eq("usage_date", today)
      .maybeSingle(),
  ]);

  return {
    products: products.count ?? 0,
    knowledgeDocuments: documents.count ?? 0,
    automations: automations.count ?? 0,
    widgetMessagesToday:
      (usage.data as { widget_messages: number } | null)?.widget_messages ?? 0,
  };
}
