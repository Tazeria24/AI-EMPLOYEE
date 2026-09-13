import { headers } from "next/headers";

/**
 * Resolve the site's origin (protocol + host) for building email redirect URLs.
 * Prefers NEXT_PUBLIC_SITE_URL; otherwise derives it from request headers.
 */
export async function getSiteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto =
    headerList.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") ? "http" : "https");

  return `${proto}://${host}`;
}
