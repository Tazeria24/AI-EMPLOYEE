import { getSiteOrigin } from "@/lib/site-url";
import { isWidgetKey } from "@/lib/widget/validation";

export const dynamic = "force-dynamic";

/**
 * The embed loader: the one file a business pastes into their website.
 *
 * It only injects an iframe pointing back at our own origin, so the chat runs
 * in our document, not theirs. Nothing about the conversation — the session
 * token, the transcript, the Supabase key — is ever readable by the host page,
 * and a compromised host page cannot reach into the widget. It is also why the
 * widget needs no CORS: every request it makes is same-origin.
 */
export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key");
  if (!isWidgetKey(key)) {
    return new Response("/* invalid widget key */", {
      status: 400,
      headers: { "content-type": "application/javascript; charset=utf-8" },
    });
  }

  const origin = await getSiteOrigin();
  // `key` is validated as 32 hex characters above, so it cannot break out of
  // the string literal below.
  const script = `(function () {
  var KEY = ${JSON.stringify(key)};
  var ORIGIN = ${JSON.stringify(origin)};
  if (window.__aiSalesWidgetLoaded) return;
  window.__aiSalesWidgetLoaded = true;

  var frame = document.createElement("iframe");
  frame.src = ORIGIN + "/widget/" + KEY;
  frame.title = "Chat with us";
  frame.setAttribute("allow", "");
  frame.style.cssText = [
    "position:fixed",
    "bottom:16px",
    "right:16px",
    "width:380px",
    "max-width:calc(100vw - 32px)",
    "height:560px",
    "max-height:calc(100vh - 32px)",
    "border:0",
    "border-radius:16px",
    "box-shadow:0 12px 40px rgba(0,0,0,0.18)",
    "z-index:2147483000",
    "display:none",
    "color-scheme:normal"
  ].join(";");

  var button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-expanded", "false");
  button.textContent = "Chat with us";
  button.style.cssText = [
    "position:fixed",
    "bottom:16px",
    "right:16px",
    "padding:12px 18px",
    "border:0",
    "border-radius:999px",
    "background:#0F5C63",
    "color:#fff",
    "font:600 15px/1.2 system-ui,-apple-system,Segoe UI,sans-serif",
    "cursor:pointer",
    "box-shadow:0 8px 24px rgba(0,0,0,0.18)",
    "z-index:2147483001"
  ].join(";");

  function setOpen(open) {
    frame.style.display = open ? "block" : "none";
    button.setAttribute("aria-expanded", String(open));
    button.textContent = open ? "Close chat" : "Chat with us";
  }

  button.addEventListener("click", function () {
    setOpen(frame.style.display === "none");
  });

  function mount() {
    document.body.appendChild(frame);
    document.body.appendChild(button);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
`;

  return new Response(script, {
    status: 200,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      // Short cache: a business that disables the widget should stop being
      // embedded quickly, but the loader itself is not per-visitor.
      "cache-control": "public, max-age=300",
    },
  });
}
