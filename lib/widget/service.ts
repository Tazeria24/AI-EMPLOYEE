import { createClient } from "@/lib/supabase/server";
import type { WidgetSettings, WidgetUsage } from "./types";

const SETTINGS_COLUMNS =
  "id, organization_id, widget_key, enabled, greeting, theme_color, allowed_origins, max_messages_per_session, max_messages_per_day, max_sessions_per_day";

/** The tenant's widget settings (RLS-scoped). */
export async function getWidgetSettings(): Promise<WidgetSettings | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("widget_settings")
    .select(SETTINGS_COLUMNS)
    .maybeSingle();
  return (data as WidgetSettings | null) ?? null;
}

/**
 * Today's spend against the caps, a 30-day total for context, and how many
 * widget chats turned into leads (the conversion figure tasks/09 asks for).
 */
export async function getWidgetUsage(): Promise<WidgetUsage> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 30);

  const [{ data: todayRow }, { data: recent }, { data: widgetConversations }] =
    await Promise.all([
      supabase
        .from("org_usage_daily")
        .select("widget_messages, widget_sessions")
        .eq("usage_date", today)
        .maybeSingle(),
      supabase
        .from("org_usage_daily")
        .select("widget_messages")
        .gte("usage_date", since.toISOString().slice(0, 10)),
      supabase.from("conversations").select("id").eq("channel", "widget"),
    ]);

  const conversationIds = (
    (widgetConversations as { id: string }[] | null) ?? []
  ).map((row) => row.id);

  // Leads the AI captured inside a widget chat. RLS scopes both sides, so this
  // counts only this tenant's own conversions.
  let leadsCaptured = 0;
  if (conversationIds.length > 0) {
    const { count } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .in("conversation_id", conversationIds);
    leadsCaptured = count ?? 0;
  }

  const row = todayRow as {
    widget_messages: number;
    widget_sessions: number;
  } | null;
  const messagesLast30Days = (
    (recent as { widget_messages: number }[] | null) ?? []
  ).reduce((total, day) => total + day.widget_messages, 0);

  return {
    messagesToday: row?.widget_messages ?? 0,
    sessionsToday: row?.widget_sessions ?? 0,
    messagesLast30Days,
    conversationsTotal: conversationIds.length,
    leadsCaptured,
  };
}
