import { GRAPH_API_VERSION } from "./types";

export type SendResult =
  | { ok: true; externalId: string | null }
  | { ok: false; error: string };

export interface SendCredentials {
  phoneNumberId: string;
  accessToken: string;
}

/**
 * Send a plain text message through the Cloud API.
 *
 * Deliberately narrow: text only, one recipient, pinned API version. Media and
 * template messages are out of scope for this milestone (tasks/10 says media
 * "only if necessary"; templates need per-business Meta approval and separate
 * billing).
 *
 * Meta's error bodies can echo back request content, so failures are recorded
 * as a short code rather than surfaced verbatim — the same rule the Resend
 * provider follows.
 */
export async function sendTextMessage(
  credentials: SendCredentials,
  to: string,
  body: string,
): Promise<SendResult> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(
    credentials.phoneNumberId,
  )}/messages`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${credentials.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: false, body },
      }),
    });
  } catch {
    return { ok: false, error: "network_error" };
  }

  if (!response.ok) {
    return { ok: false, error: `whatsapp_http_${response.status}` };
  }

  try {
    const payload = (await response.json()) as {
      messages?: { id?: string }[];
    };
    return { ok: true, externalId: payload.messages?.[0]?.id ?? null };
  } catch {
    // Accepted by Meta; we just could not read the id back.
    return { ok: true, externalId: null };
  }
}
