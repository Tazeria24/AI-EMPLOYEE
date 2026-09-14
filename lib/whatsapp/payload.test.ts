import { describe, expect, it } from "vitest";
import { MAX_INBOUND_LENGTH, parseInboundPayload } from "./payload";

function textPayload(overrides: Record<string, unknown> = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_ID",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "2348000000000",
                phone_number_id: "PHONE_ID_1",
              },
              contacts: [{ profile: { name: "Ada" }, wa_id: "2348111111111" }],
              messages: [
                {
                  from: "2348111111111",
                  id: "wamid.ABC123",
                  timestamp: "1789000000",
                  type: "text",
                  text: { body: "Do you have the red dress?" },
                },
              ],
              ...overrides,
            },
          },
        ],
      },
    ],
  };
}

describe("parseInboundPayload", () => {
  it("extracts the routing id and the message", () => {
    const result = parseInboundPayload(textPayload());
    expect(result?.phoneNumberId).toBe("PHONE_ID_1");
    expect(result?.messages).toHaveLength(1);
    expect(result?.messages[0]).toMatchObject({
      externalId: "wamid.ABC123",
      from: "2348111111111",
      profileName: "Ada",
      type: "text",
      text: "Do you have the red dress?",
    });
    expect(result?.messages[0].timestamp?.toISOString()).toBe(
      new Date(1789000000 * 1000).toISOString(),
    );
  });

  it("returns null for a status callback", () => {
    // Delivery/read receipts arrive on the same endpoint and must not be
    // treated as customer messages.
    const payload = textPayload();
    const value = payload.entry[0].changes[0].value as Record<string, unknown>;
    delete value.messages;
    value.statuses = [{ id: "wamid.ABC123", status: "delivered" }];
    expect(parseInboundPayload(payload)).toBeNull();
  });

  it("keeps non-text messages but carries no text", () => {
    const payload = textPayload({
      messages: [
        { from: "2348111111111", id: "wamid.IMG", timestamp: "1789000000", type: "image" },
      ],
    });
    const result = parseInboundPayload(payload);
    expect(result?.messages[0]).toMatchObject({ type: "image", text: null });
  });

  it("truncates an over-long message", () => {
    const payload = textPayload({
      messages: [
        {
          from: "2348111111111",
          id: "wamid.LONG",
          timestamp: "1789000000",
          type: "text",
          text: { body: "x".repeat(MAX_INBOUND_LENGTH + 500) },
        },
      ],
    });
    expect(parseInboundPayload(payload)?.messages[0].text).toHaveLength(
      MAX_INBOUND_LENGTH,
    );
  });

  it("skips messages missing an id or sender", () => {
    const payload = textPayload({
      messages: [
        { id: "wamid.NOFROM", type: "text", text: { body: "hi" } },
        { from: "2348111111111", type: "text", text: { body: "hi" } },
      ],
    });
    expect(parseInboundPayload(payload)).toBeNull();
  });

  it("returns null without a phone_number_id to route on", () => {
    const payload = textPayload();
    const value = payload.entry[0].changes[0].value as Record<string, unknown>;
    value.metadata = {};
    expect(parseInboundPayload(payload)).toBeNull();
  });

  // The body comes from outside. None of these may throw.
  it.each([
    ["null", null],
    ["a string", "hello"],
    ["an array", [1, 2, 3]],
    ["an empty object", {}],
    ["a wrong object type", { object: "page", entry: [] }],
    ["entry not an array", { object: "whatsapp_business_account", entry: "nope" }],
    ["changes not an array", { object: "whatsapp_business_account", entry: [{ changes: 5 }] }],
    ["a nested null", { object: "whatsapp_business_account", entry: [null] }],
  ])("returns null for %s", (_label, body) => {
    expect(parseInboundPayload(body)).toBeNull();
  });
});
