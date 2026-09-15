import { createClient } from "@/lib/supabase/server";
import type { FeedbackKind } from "./validation";

export interface FeedbackItem {
  id: string;
  kind: FeedbackKind;
  message: string;
  page: string | null;
  status: string;
  created_at: string;
}

/** This organization's own reports, newest first (RLS-scoped). */
export async function listFeedback(limit = 20): Promise<FeedbackItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("feedback")
    .select("id, kind, message, page, status, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as FeedbackItem[] | null) ?? [];
}
