import { describe, expect, it } from "vitest";
import { applySecurityHeaders } from "./headers";

describe("applySecurityHeaders", () => {
  it("sets the baseline headers", () => {
    const headers = new Headers();
    applySecurityHeaders(headers, { isProduction: false });

    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
  });

  it("denies framing by default", () => {
    const headers = new Headers();
    applySecurityHeaders(headers, { isProduction: false });
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Content-Security-Policy")).toBe("frame-ancestors 'none'");
  });

  it("leaves the frame policy alone for the widget", () => {
    // The widget is the one page meant to be framed, and sets its own
    // frame-ancestors from the business's allowed origins (ADR-053).
    const headers = new Headers({ "Content-Security-Policy": "frame-ancestors *" });
    applySecurityHeaders(headers, { frameDeny: false, isProduction: false });

    expect(headers.get("Content-Security-Policy")).toBe("frame-ancestors *");
    expect(headers.get("X-Frame-Options")).toBeNull();
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("sets HSTS only in production", () => {
    // Pinning localhost to HTTPS in a developer's browser is painful to undo.
    const dev = new Headers();
    applySecurityHeaders(dev, { isProduction: false });
    expect(dev.get("Strict-Transport-Security")).toBeNull();

    const prod = new Headers();
    applySecurityHeaders(prod, { isProduction: true });
    expect(prod.get("Strict-Transport-Security")).toContain("max-age=63072000");
  });
});
