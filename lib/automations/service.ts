import { createClient } from "@/lib/supabase/server";
import type { Automation, AutomationRun } from "./types";

const AUTOMATION_COLUMNS =
  "id, organization_id, name, trigger_type, conditions, action_type, action_config, enabled, created_at";
const RUN_COLUMNS =
  "id, automation_id, lead_id, status, follow_up_number, channel, scheduled_for, executed_at, error, created_at";

export async function listAutomations(): Promise<Automation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("automations")
    .select(AUTOMATION_COLUMNS)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as Automation[] | null) ?? [];
}

export async function listRecentRuns(limit = 25): Promise<AutomationRun[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("automation_runs")
    .select(RUN_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data as AutomationRun[] | null) ?? [];
}
