export interface WidgetSettings {
  id: string;
  organization_id: string;
  widget_key: string;
  enabled: boolean;
  greeting: string;
  theme_color: string;
  allowed_origins: string[];
  max_messages_per_session: number;
  max_messages_per_day: number;
  max_sessions_per_day: number;
}

export interface WidgetUsage {
  /** Today's counters, or zeroes when nothing has happened yet. */
  messagesToday: number;
  sessionsToday: number;
  messagesLast30Days: number;
  /** Conversion tracking: widget chats, and how many became leads. */
  conversationsTotal: number;
  leadsCaptured: number;
}
