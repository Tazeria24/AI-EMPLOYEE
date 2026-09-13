export type ConversationStatus = "AI_ACTIVE" | "HUMAN_ACTIVE" | "CLOSED";
export type ConversationChannel = "widget" | "whatsapp" | "manual";
export type SenderType = "customer" | "ai" | "human" | "system";

export interface Conversation {
  id: string;
  organization_id: string;
  customer_id: string | null;
  channel: ConversationChannel;
  status: ConversationStatus;
  assigned_to: string | null;
  created_at: string;
  last_message_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_type: SenderType;
  content: string;
  created_at: string;
}

/** A conversation plus the bits the inbox list needs. */
export interface ConversationSummary extends Conversation {
  customer_name: string | null;
  last_message: string | null;
}
