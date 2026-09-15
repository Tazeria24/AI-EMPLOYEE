export type LeadStatus =
  | "NEW"
  | "CONTACTED"
  | "INTERESTED"
  | "NEGOTIATING"
  | "WON"
  | "LOST";

export interface Lead {
  id: string;
  organization_id: string;
  customer_id: string | null;
  conversation_id: string | null;
  status: LeadStatus;
  source: string | null;
  score: number | null;
  intent: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** A lead plus the contact details the pipeline needs to show. */
export interface LeadWithCustomer extends Lead {
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
}

export interface LeadEvent {
  id: string;
  lead_id: string;
  event_type: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}
