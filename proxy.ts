import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { widgetFrameResponse } from "@/lib/widget/frame";
import { applySecurityHeaders } from "@/lib/security/headers";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The embedded widget page. Public, no session, and the one thing in this
  // app that is meant to be framed by other sites.
  if (pathname.startsWith("/widget/")) {
    const framed = await widgetFrameResponse(request);
    // Everything except the frame policy, which the widget sets for itself.
    applySecurityHeaders(framed.headers, { frameDeny: false });
    return framed;
  }

  // Public widget endpoints carry a session token, not an auth cookie, so
  // there is no Supabase session to refresh.
  if (pathname.startsWith("/api/widget/")) {
    const response = NextResponse.next({ request });
    applySecurityHeaders(response.headers);
    return response;
  }

  // Webhooks authenticate with a provider signature, not a Supabase session.
  // Touching cookies here would only slow down every delivery.
  if (pathname.startsWith("/api/webhooks/")) {
    const response = NextResponse.next({ request });
    applySecurityHeaders(response.headers);
    return response;
  }

  const response = await updateSession(request);
  // Everything except the widget stays unframeable. The widget introduced
  // iframes to this app; this keeps that door open only where it was opened.
  applySecurityHeaders(response.headers);
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (build assets)
     * - favicon.ico and common image types
     * - /api/health (must work without Supabase env)
     */
    "/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
