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
  status: LeadStatus;
  source: string | null;
  score: number | null;
  intent: string | null;
  notes: string | null;
  created_at: string;
}
