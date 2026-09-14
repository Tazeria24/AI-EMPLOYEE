import type { InboundEvent, InboundMessage } from "./types";

/** Longest inbound text we will pass to the model, matching the widget's cap. */
export const MAX_INBOUND_LENGTH = 2000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Reduce a Cloud API webhook body to the messages we act on.
 *
 * This is deliberately defensive rather than a type assertion. The payload
 * arrives from outside, and Meta sends several shapes through the same
 * endpoint — delivery/read receipts (`statuses`), account updates, and
 * message types we do not handle. Anything we do not recognise yields no
 * messages, which the route turns into a plain 200: an unparseable callback
 * must not become a retry loop.
 *
 * Returns null when the body carries no message change at all.
 */
export function parseInboundPayload(body: unknown): InboundEvent | null {
  const root = asRecord(body);
  if (!root || root.object !== "whatsapp_business_account") return null;

  for (const entry of asArray(root.entry)) {
    for (const change of asArray(asRecord(entry)?.changes)) {
      const value = asRecord(asRecord(change)?.value);
      if (!value) continue;

      const phoneNumberId = asString(asRecord(value.metadata)?.phone_number_id);
      if (!phoneNumberId) continue;

      // Status callbacks (sent/delivered/read) carry no `messages`.
      const rawMessages = asArray(value.messages);
      if (rawMessages.length === 0) continue;

      // contacts[] carries the sender's profile name, keyed by wa_id.
      const names = new Map<string, string>();
      for (const contact of asArray(value.contacts)) {
        const record = asRecord(contact);
        const waId = asString(record?.wa_id);
        const name = asString(asRecord(record?.profile)?.name);
        if (waId && name) names.set(waId, name);
      }

      const messages: InboundMessage[] = [];
      for (const raw of rawMessages) {
        const message = asRecord(raw);
        const externalId = asString(message?.id);
        const from = asString(message?.from);
        if (!externalId || !from) continue;

        const type = asString(message?.type) ?? "unknown";
        const text =
          type === "text"
            ? asString(asRecord(message?.text)?.body)?.slice(0, MAX_INBOUND_LENGTH) ?? null
            : null;

        // Meta sends a unix timestamp in seconds, as a string.
        const seconds = Number(asString(message?.timestamp));
        const timestamp = Number.isFinite(seconds) && seconds > 0
          ? new Date(seconds * 1000)
          : null;

        messages.push({
          externalId,
          from,
          profileName: names.get(from) ?? null,
          type,
          text,
          timestamp,
        });
      }

      if (messages.length > 0) return { phoneNumberId, messages };
    }
  }

  return null;
}
