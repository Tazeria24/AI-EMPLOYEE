import { createClient } from "@/lib/supabase/server";
import type { ActivationSignals } from "./checklist";

const EMPTY: ActivationSignals = {
  hasBusinessProfile: false,
  hasProducts: false,
  hasKnowledge: false,
  hasWidgetEnabled: false,
  hasConversation: false,
  hasLead: false,
};

/**
 * What this organization has set up so far (RLS-scoped).
 *
 * One round trip to a SQL function rather than six counts, so the dashboard
 * and anything else that asks agree on what "set up" means.
 */
export async function getActivationSignals(
  organizationId: string,
): Promise<ActivationSignals> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("organization_activation", {
    p_organization_id: organizationId,
  });

  const row = (data as
    | {
        has_business_profile: boolean;
        has_products: boolean;
        has_knowledge: boolean;
        has_widget_enabled: boolean;
        has_conversation: boolean;
        has_lead: boolean;
      }[]
    | null)?.[0];

  if (!row) return EMPTY;

  return {
    hasBusinessProfile: row.has_business_profile,
    hasProducts: row.has_products,
    hasKnowledge: row.has_knowledge,
    hasWidgetEnabled: row.has_widget_enabled,
    hasConversation: row.has_conversation,
    hasLead: row.has_lead,
  };
}

export interface DashboardCounts {
  openConversations: number;
  newLeads: number;
  widgetMessagesToday: number;
}

/** Headline numbers for the dashboard home. */
export async function getDashboardCounts(): Promise<DashboardCounts> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [conversations, leads, usage] = await Promise.all([
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .neq("status", "CLOSED"),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("status", "NEW"),
    supabase
      .from("org_usage_daily")
      .select("widget_messages")
      .eq("usage_date", today)
      .maybeSingle(),
  ]);

  return {
    openConversations: conversations.count ?? 0,
    newLeads: leads.count ?? 0,
    widgetMessagesToday:
      (usage.data as { widget_messages: number } | null)?.widget_messages ?? 0,
  };
}
