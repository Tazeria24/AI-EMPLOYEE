import { describe, expect, it } from "vitest";
import {
  SERVICE_WINDOW_MS,
  isWithinServiceWindow,
  serviceWindowRemainingMs,
} from "./window";

const NOW = new Date("2026-09-14T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe("isWithinServiceWindow", () => {
  it("is open just inside 24 hours", () => {
    expect(isWithinServiceWindow(ago(SERVICE_WINDOW_MS - 1000), NOW)).toBe(true);
  });

  it("is closed exactly at 24 hours and after", () => {
    expect(isWithinServiceWindow(ago(SERVICE_WINDOW_MS), NOW)).toBe(false);
    expect(isWithinServiceWindow(ago(SERVICE_WINDOW_MS + 1000), NOW)).toBe(false);
  });

  it("is closed when the customer has never messaged", () => {
    expect(isWithinServiceWindow(null, NOW)).toBe(false);
    expect(isWithinServiceWindow(undefined, NOW)).toBe(false);
  });

  it("is closed for an unparseable timestamp", () => {
    expect(isWithinServiceWindow("not a date", NOW)).toBe(false);
  });

  it("is closed for a future timestamp", () => {
    // Clock skew must not be readable as a freshly opened window.
    expect(isWithinServiceWindow(new Date(NOW.getTime() + 60_000), NOW)).toBe(false);
  });

  it("accepts an ISO string, as read from the database", () => {
    expect(isWithinServiceWindow(ago(60_000).toISOString(), NOW)).toBe(true);
  });
});

describe("serviceWindowRemainingMs", () => {
  it("reports the time left while open", () => {
    expect(serviceWindowRemainingMs(ago(60_000), NOW)).toBe(SERVICE_WINDOW_MS - 60_000);
  });

  it("reports zero once closed", () => {
    expect(serviceWindowRemainingMs(ago(SERVICE_WINDOW_MS), NOW)).toBe(0);
    expect(serviceWindowRemainingMs(null, NOW)).toBe(0);
  });
});
