import { createPublicClient } from "@/lib/supabase/public";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { respondInConversation } from "@/lib/ai/agent/respond";
import {
  isSessionToken,
  parseVisitorMessage,
  statusMessage,
} from "@/lib/widget/validation";

export const dynamic = "force-dynamic";
/** Node runtime: the agent path uses the Anthropic SDK. */
export const runtime = "nodejs";

/**
 * Post a visitor message and return the AI's reply.
 *
 * This is the endpoint the planning audit's finding #10 is about: a public URL
 * where each request costs an LLM call plus an embedding call. Two things make
 * it safe to expose.
 *
 * 1. **The spend gate runs before the model does.** `widget_send` takes a row
 *    lock on the session, checks the per-session and per-organization daily
 *    caps, and records the message — all in one transaction. Concurrent
 *    requests serialize on that lock, so there is no window where two of them
 *    both read "under the cap". Only if it returns `ok` does anything paid run.
 *
 * 2. **The tenant comes from the database, never from the request.** The
 *    visitor sends an opaque session token; the organization and conversation
 *    ids come back out of `widget_send`. A caller cannot name an organization.
 *
 * The AI turn then needs to read products and knowledge and write a message,
 * which the anon role cannot do — so it runs with the service-role client,
 * scoped to the organization id the database just returned. See
 * lib/supabase/admin.ts for the rules that carries.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const { token, content } = (body ?? {}) as { token?: unknown; content?: unknown };
  if (!isSessionToken(token)) {
    return Response.json({ error: "This chat has expired." }, { status: 404 });
  }

  const parsed = parseVisitorMessage(content);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  let publicClient;
  try {
    publicClient = createPublicClient();
  } catch {
    return Response.json({ error: "not_configured" }, { status: 503 });
  }

  const { data, error } = await publicClient.rpc("widget_send", {
    p_token: token,
    p_content: parsed.content,
  });
  if (error) {
    return Response.json({ error: "Could not send that message." }, { status: 500 });
  }

  const row = (data as
    | {
        out_status: string;
        out_organization_id: string | null;
        out_conversation_id: string | null;
      }[]
    | null)?.[0];

  if (!row || row.out_status !== "ok" || !row.out_organization_id || !row.out_conversation_id) {
    const { code, message } = statusMessage(row?.out_status ?? "unknown_session");
    return Response.json({ error: message }, { status: code });
  }

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch {
    return Response.json({ error: "not_configured" }, { status: 503 });
  }

  try {
    const result = await respondInConversation(
      row.out_conversation_id,
      row.out_organization_id,
      "widget",
      admin,
    );

    // A human took over mid-turn, so the reply was discarded rather than
    // posted (append_ai_message). The visitor is told a person is answering,
    // not shown two voices.
    if (result.discarded) {
      return Response.json({ reply: null, handedOff: true });
    }

    return Response.json({ reply: result.reply, escalated: result.escalated });
  } catch {
    // The message is already recorded, so the business still sees it in the
    // inbox and can answer by hand.
    return Response.json(
      {
        reply: null,
        error: "Sorry — I could not answer just now. Someone will follow up.",
      },
      { status: 502 },
    );
  }
}
