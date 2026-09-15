import { describe, expect, it } from "vitest";
import {
  MAX_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  isDeletionConfirmed,
  parseRetentionDays,
} from "./validation";

describe("parseRetentionDays", () => {
  it("accepts the bounds", () => {
    expect(parseRetentionDays(String(MIN_RETENTION_DAYS))).toEqual({
      ok: true,
      data: MIN_RETENTION_DAYS,
    });
    expect(parseRetentionDays(String(MAX_RETENTION_DAYS))).toEqual({
      ok: true,
      data: MAX_RETENTION_DAYS,
    });
  });

  it.each([
    ["below the minimum", "29"],
    ["above the maximum", "3651"],
    ["zero, which is not a policy", "0"],
    ["negative", "-30"],
    ["fractional", "30.5"],
    ["not a number", "forever"],
    ["empty", ""],
  ])("rejects %s", (_label, value) => {
    expect(parseRetentionDays(value).ok).toBe(false);
  });

  it("matches the database check constraint bounds", () => {
    // migration 0011: check (retention_days between 30 and 3650)
    expect(MIN_RETENTION_DAYS).toBe(30);
    expect(MAX_RETENTION_DAYS).toBe(3650);
  });
});

describe("isDeletionConfirmed", () => {
  it("accepts DELETE in any case, with surrounding space", () => {
    expect(isDeletionConfirmed("DELETE")).toBe(true);
    expect(isDeletionConfirmed(" delete ")).toBe(true);
  });

  it.each(["", "yes", "DEL", "DELETE ALL", null, undefined, 1])(
    "rejects %s",
    (value) => {
      expect(isDeletionConfirmed(value)).toBe(false);
    },
  );
});
