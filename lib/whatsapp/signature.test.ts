import { describe, expect, it } from "vitest";
import { signBody, verifyHandshake, verifySignature } from "./signature";

const SECRET = "a-very-secret-meta-app-secret";
const BODY = JSON.stringify({ object: "whatsapp_business_account", entry: [] });

describe("verifySignature", () => {
  it("accepts a correctly signed body", () => {
    expect(verifySignature(BODY, signBody(BODY, SECRET), SECRET)).toBe(true);
  });

  it("rejects a tampered body", () => {
    // The attack this exists to stop: a real signature replayed over different
    // content.
    const signature = signBody(BODY, SECRET);
    expect(verifySignature(`${BODY} `, signature, SECRET)).toBe(false);
    expect(
      verifySignature(JSON.stringify({ object: "evil" }), signature, SECRET),
    ).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    expect(verifySignature(BODY, signBody(BODY, "another-secret"), SECRET)).toBe(false);
  });

  it("rejects when no secret is configured", () => {
    // An unknown phone number id resolves to no integration; that must fail
    // closed rather than skipping verification.
    expect(verifySignature(BODY, signBody(BODY, SECRET), null)).toBe(false);
    expect(verifySignature(BODY, signBody(BODY, SECRET), "")).toBe(false);
  });

  it.each([
    ["missing", null],
    ["empty", ""],
    ["unprefixed", "abc123"],
    ["wrong algorithm", "sha1=aaaaaaaa"],
    ["short hex", "sha256=abcd"],
    ["non-hex", "sha256=".concat("z".repeat(64))],
    ["prefix only", "sha256="],
  ])("rejects a %s signature header", (_label, header) => {
    expect(verifySignature(BODY, header, SECRET)).toBe(false);
  });

  it("accepts an upper-case hex digest", () => {
    const signature = signBody(BODY, SECRET).toUpperCase().replace("SHA256=", "sha256=");
    expect(verifySignature(BODY, signature, SECRET)).toBe(true);
  });

  it("is sensitive to exact bytes, not parsed equality", () => {
    // Re-serializing parsed JSON reorders keys and drops whitespace. This is
    // why the route hashes the raw body.
    const original = '{\n  "object": "whatsapp_business_account",\n  "entry": []\n}';
    const signature = signBody(original, SECRET);
    const reserialized = JSON.stringify(JSON.parse(original));

    expect(reserialized).not.toBe(original);
    expect(JSON.parse(reserialized)).toEqual(JSON.parse(original));
    expect(verifySignature(reserialized, signature, SECRET)).toBe(false);
  });
});

describe("verifyHandshake", () => {
  it("accepts a matching subscribe handshake", () => {
    expect(verifyHandshake("subscribe", "tok-12345678", "tok-12345678")).toBe(true);
  });

  it("rejects a wrong token", () => {
    expect(verifyHandshake("subscribe", "tok-wrong-xxx", "tok-12345678")).toBe(false);
  });

  it("rejects a token of a different length without throwing", () => {
    // timingSafeEqual throws on mismatched lengths; the length pre-check is
    // what keeps this a plain false.
    expect(verifyHandshake("subscribe", "short", "tok-12345678")).toBe(false);
  });

  it("rejects a non-subscribe mode", () => {
    expect(verifyHandshake("unsubscribe", "tok-12345678", "tok-12345678")).toBe(false);
    expect(verifyHandshake(null, "tok-12345678", "tok-12345678")).toBe(false);
  });

  it("rejects when no token is stored", () => {
    expect(verifyHandshake("subscribe", "tok-12345678", null)).toBe(false);
    expect(verifyHandshake("subscribe", "tok-12345678", "")).toBe(false);
  });
});
