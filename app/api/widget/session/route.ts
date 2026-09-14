import { createPublicClient } from "@/lib/supabase/public";
import { isWidgetKey, statusMessage } from "@/lib/widget/validation";

export const dynamic = "force-dynamic";

/**
 * Start an anonymous visitor session.
 *
 * Session creation is itself capped per organization per day, so opening
 * sessions in a loop is not a way around the per-session message limit — it
 * runs into the daily session cap instead.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const key = (body as { key?: unknown } | null)?.key;
  if (!isWidgetKey(key)) {
    return Response.json({ error: "This chat is not available." }, { status: 404 });
  }

  let supabase;
  try {
    supabase = createPublicClient();
  } catch {
    return Response.json({ error: "not_configured" }, { status: 503 });
  }

  const { data, error } = await supabase.rpc("widget_start_session", { p_key: key });
  if (error) {
    return Response.json({ error: "Could not start this chat." }, { status: 500 });
  }

  const row = (data as { out_token: string | null; out_status: string }[] | null)?.[0];
  if (!row || row.out_status !== "ok" || !row.out_token) {
    const { code, message } = statusMessage(row?.out_status ?? "disabled");
    return Response.json({ error: message }, { status: code });
  }

  return Response.json({ token: row.out_token });
}
