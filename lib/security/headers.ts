/**
 * Security response headers.
 *
 * `docs/SECURITY.md` asks for "secure headers where appropriate" on the
 * production checklist. Each of these closes a specific hole:
 *
 *  - **frame-ancestors / X-Frame-Options** — clickjacking. The widget is the
 *    one page meant to be framed, and it sets its own policy (ADR-053).
 *  - **X-Content-Type-Options** — stops a browser sniffing a response into a
 *    different, executable content type.
 *  - **Referrer-Policy** — dashboard URLs carry organization and record ids;
 *    without this they are sent to every external site a user clicks through to.
 *  - **Permissions-Policy** — the dashboard needs no camera, microphone or
 *    geolocation, so it declines them rather than leaving them available to
 *    anything that ends up running on the page.
 *  - **HSTS** — production only. Setting it in development would pin
 *    `localhost` to HTTPS in the developer's browser, which is a nuisance to
 *    undo.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "X-DNS-Prefetch-Control": "off",
};

/** Headers for pages that must never be framed (everything but the widget). */
export const FRAME_DENY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": "frame-ancestors 'none'",
  "X-Frame-Options": "DENY",
};

export function applySecurityHeaders(
  headers: Headers,
  { frameDeny = true, isProduction = process.env.NODE_ENV === "production" } = {},
): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  if (frameDeny) {
    for (const [name, value] of Object.entries(FRAME_DENY_HEADERS)) {
      headers.set(name, value);
    }
  }
  if (isProduction) {
    headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }
}
