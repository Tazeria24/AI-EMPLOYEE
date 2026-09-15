import { createPublicClient } from "@/lib/supabase/public";
import { isWidgetKey } from "@/lib/widget/validation";

export const dynamic = "force-dynamic";

/**
 * Public widget configuration.
 *
 * Everything here is already visible on the business's own website, and the
 * `widget_config` function returns nothing else — no prices, no knowledge, no
 * counts, not even the organization id. A widget key that is unknown or
 * disabled is indistinguishable from the caller's side.
 */
export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key");
  if (!isWidgetKey(key)) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  let supabase;
  try {
    supabase = createPublicClient();
  } catch {
    return Response.json({ error: "not_configured" }, { status: 503 });
  }

  const { data } = await supabase.rpc("widget_config", { p_key: key });
  const config = (data as
    | { business_name: string; greeting: string; theme_color: string }[]
    | null)?.[0];

  if (!config) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  return Response.json({
    businessName: config.business_name,
    greeting: config.greeting,
    themeColor: config.theme_color,
  });
}
