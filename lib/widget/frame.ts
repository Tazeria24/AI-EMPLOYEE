import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getOptionalPublicSupabaseConfig } from "@/lib/env";
import { frameAncestors, isWidgetKey } from "./validation";

/**
 * Which sites may embed a given widget, expressed as a CSP header.
 *
 * The widget renders in an iframe on OUR origin, so the business's website
 * never sees the session token or the transcript. The flip side is that we
 * decide who is allowed to frame us — that is what `allowed_origins` is for,
 * and it has to be a response header, so it is set here rather than in the
 * page.
 *
 * If the widget key is unknown or the lookup fails we fall back to allowing
 * any embedder. That is deliberate: this header is an anti-abuse control, not
 * the tenant boundary (the page itself renders nothing for an unknown or
 * disabled key), and failing closed would take a working widget offline on a
 * transient database error.
 */
export async function widgetFrameResponse(
  request: NextRequest,
): Promise<NextResponse> {
  const response = NextResponse.next({ request });
  const key = request.nextUrl.pathname.split("/")[2];

  let allowed: string[] | null = null;
  const config = getOptionalPublicSupabaseConfig();
  if (isWidgetKey(key) && config) {
    try {
      const supabase = createSupabaseClient(config.url, config.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data } = await supabase.rpc("widget_frame_policy", { p_key: key });
      allowed = (data as string[] | null) ?? null;
    } catch {
      allowed = null;
    }
  }

  response.headers.set("Content-Security-Policy", frameAncestors(allowed));
  return response;
}
