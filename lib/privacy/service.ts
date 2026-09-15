import { createClient } from "@/lib/supabase/server";

export interface PrivacySummary {
  retentionDays: number;
  customers: number;
  conversations: number;
  messages: number;
  oldestConversationAt: string | null;
}

/**
 * What personal data this organization currently holds.
 *
 * NDPR asks a business to know what it stores and for how long. This is the
 * page that answers that without them having to ask us.
 */
export async function getPrivacySummary(): Promise<PrivacySummary> {
  const supabase = await createClient();

  const [profile, customers, conversations, messages, oldest] = await Promise.all([
    supabase.from("business_profiles").select("retention_days").maybeSingle(),
    supabase.from("customers").select("id", { count: "exact", head: true }),
    supabase.from("conversations").select("id", { count: "exact", head: true }),
    supabase.from("messages").select("id", { count: "exact", head: true }),
    supabase
      .from("conversations")
      .select("created_at")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    retentionDays:
      (profile.data as { retention_days: number } | null)?.retention_days ?? 365,
    customers: customers.count ?? 0,
    conversations: conversations.count ?? 0,
    messages: messages.count ?? 0,
    oldestConversationAt:
      (oldest.data as { created_at: string } | null)?.created_at ?? null,
  };
}
