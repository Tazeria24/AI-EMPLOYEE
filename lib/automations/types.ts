export type AutomationTriggerType = "lead_inactive";
export type AutomationActionType = "ai_followup";
export type AutomationRunStatus =
  | "scheduled"
  | "running"
  | "sent"
  | "failed"
  | "skipped";

export interface Automation {
  id: string;
  organization_id: string;
  name: string;
  trigger_type: AutomationTriggerType;
  conditions: { inactive_hours?: number } | null;
  action_type: AutomationActionType;
  action_config: { channel?: "conversation" | "email" } | null;
  enabled: boolean;
  created_at: string;
}

export interface AutomationRun {
  id: string;
  automation_id: string;
  lead_id: string;
  status: AutomationRunStatus;
  follow_up_number: number | null;
  channel: string | null;
  scheduled_for: string;
  executed_at: string | null;
  error: string | null;
  created_at: string;
}
