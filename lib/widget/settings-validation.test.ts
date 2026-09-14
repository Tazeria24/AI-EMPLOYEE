import { describe, expect, it } from "vitest";
import { parseOrigins, parseWidgetSettings } from "./settings-validation";

const VALID = {
  greeting: "Hi! Ask us anything.",
  themeColor: "#0F5C63",
  allowedOrigins: "https://shop.example.com",
  maxMessagesPerSession: "20",
  maxMessagesPerDay: "500",
  maxSessionsPerDay: "200",
};

describe("parseOrigins", () => {
  it("accepts and de-duplicates well-formed origins", () => {
    const result = parseOrigins(
      "https://a.example.com\nhttps://a.example.com/, http://localhost:3000",
    );
    expect(result).toEqual({
      ok: true,
      data: ["https://a.example.com", "http://localhost:3000"],
    });
  });

  it("treats empty input as 'any website'", () => {
    expect(parseOrigins("")).toEqual({ ok: true, data: [] });
  });

  // These would all end up inside a Content-Security-Policy header, where a
  // stray quote, space or semicolon can change what the directive means.
  it.each([
    "https://evil.com; script-src *",
    "https://evil.com 'unsafe-inline'",
    "*",
    "https://*.example.com",
    "javascript:alert(1)",
    "https://example.com/path",
    'https://example.com"',
  ])("rejects %s", (value) => {
    expect(parseOrigins(value).ok).toBe(false);
  });
});

describe("parseWidgetSettings", () => {
  it("accepts a well-formed form", () => {
    const result = parseWidgetSettings(VALID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.maxMessagesPerSession).toBe(20);
      expect(result.data.allowedOrigins).toEqual(["https://shop.example.com"]);
    }
  });

  it("rejects a colour that is not a hex literal", () => {
    // Anything else would reach a style attribute in the widget.
    expect(parseWidgetSettings({ ...VALID, themeColor: "red" }).ok).toBe(false);
  });

  it("rejects an empty greeting", () => {
    expect(parseWidgetSettings({ ...VALID, greeting: " " }).ok).toBe(false);
  });

  it.each([
    ["maxMessagesPerSession", "0"],
    ["maxMessagesPerSession", "201"],
    ["maxMessagesPerDay", "-1"],
    ["maxSessionsPerDay", "1.5"],
    ["maxMessagesPerDay", "lots"],
  ])("rejects %s = %s", (field, value) => {
    expect(parseWidgetSettings({ ...VALID, [field]: value }).ok).toBe(false);
  });

  it("keeps the caps inside what the database check constraints allow", () => {
    // The database re-checks these; the form must not be able to propose a
    // value that would be rejected there.
    expect(parseWidgetSettings({ ...VALID, maxMessagesPerDay: "100001" }).ok).toBe(
      false,
    );
  });
});
