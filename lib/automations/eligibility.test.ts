import { describe, it, expect } from "vitest";
import {
  DEFAULT_INACTIVE_HOURS,
  MAX_FOLLOW_UPS,
  evaluateCandidate,
  hourInTimezone,
  isQuietHour,
  scheduleTime,
  type FollowUpCandidate,
} from "@/lib/automations/eligibility";

const now = new Date("2026-09-14T12:00:00Z");

function candidate(overrides: Partial<FollowUpCandidate> = {}): FollowUpCandidate {
  return {
    leadId: "lead-1",
    lastActivityAt: "2026-09-13T06:00:00Z", // 30h earlier
    followUpsSent: 0,
    optedOut: false,
    closed: false,
    ...overrides,
  };
}

describe("evaluateCandidate", () => {
  it("schedules the first follow-up for an inactive lead", () => {
    expect(evaluateCandidate(candidate(), now)).toEqual({
      due: true,
      followUpNumber: 1,
    });
  });

  it("schedules the second follow-up after one has been sent", () => {
    expect(evaluateCandidate(candidate({ followUpsSent: 1 }), now)).toEqual({
      due: true,
      followUpNumber: 2,
    });
  });

  it("never schedules a third follow-up", () => {
    expect(evaluateCandidate(candidate({ followUpsSent: MAX_FOLLOW_UPS }), now)).toEqual({
      due: false,
      reason: "limit_reached",
    });
    expect(evaluateCandidate(candidate({ followUpsSent: 5 }), now)).toEqual({
      due: false,
      reason: "limit_reached",
    });
  });

  it("respects an opt-out before anything else", () => {
    expect(evaluateCandidate(candidate({ optedOut: true }), now)).toEqual({
      due: false,
      reason: "opted_out",
    });
  });

  it("skips won/lost leads", () => {
    expect(evaluateCandidate(candidate({ closed: true }), now)).toEqual({
      due: false,
      reason: "closed",
    });
  });

  it("leaves a lead alone until the inactivity window passes", () => {
    const recent = candidate({ lastActivityAt: "2026-09-14T11:00:00Z" }); // 1h ago
    expect(evaluateCandidate(recent, now)).toEqual({
      due: false,
      reason: "still_active",
    });
  });

  it("uses the boundary inclusively", () => {
    const exactly = candidate({ lastActivityAt: "2026-09-13T12:00:00Z" }); // 24h
    expect(evaluateCandidate(exactly, now, DEFAULT_INACTIVE_HOURS).due).toBe(true);
  });

  it("treats an unparseable timestamp as still active rather than sending", () => {
    expect(evaluateCandidate(candidate({ lastActivityAt: "not-a-date" }), now)).toEqual({
      due: false,
      reason: "still_active",
    });
  });
});

describe("quiet hours", () => {
  it("covers the evening and the early morning", () => {
    expect(isQuietHour(21)).toBe(true);
    expect(isQuietHour(23)).toBe(true);
    expect(isQuietHour(3)).toBe(true);
    expect(isQuietHour(7)).toBe(true);
  });

  it("allows normal working hours", () => {
    expect(isQuietHour(8)).toBe(false);
    expect(isQuietHour(12)).toBe(false);
    expect(isQuietHour(20)).toBe(false);
  });

  it("reads the hour in the business timezone", () => {
    // 12:00 UTC is 13:00 in Lagos (UTC+1).
    expect(hourInTimezone(new Date("2026-09-14T12:00:00Z"), "Africa/Lagos")).toBe(13);
  });

  it("falls back to UTC for an unknown timezone instead of throwing", () => {
    expect(hourInTimezone(new Date("2026-09-14T12:00:00Z"), "Not/AZone")).toBe(12);
  });
});

describe("scheduleTime", () => {
  it("sends immediately during working hours", () => {
    const at = new Date("2026-09-14T12:00:00Z"); // 13:00 Lagos
    expect(scheduleTime(at, "Africa/Lagos").getTime()).toBe(at.getTime());
  });

  it("defers a late-night send to the next morning", () => {
    const at = new Date("2026-09-14T21:00:00Z"); // 22:00 Lagos
    const scheduled = scheduleTime(at, "Africa/Lagos");
    expect(scheduled.getTime()).toBeGreaterThan(at.getTime());
    expect(hourInTimezone(scheduled, "Africa/Lagos")).toBe(8);
  });

  it("defers an early-morning send to opening time", () => {
    const at = new Date("2026-09-14T02:00:00Z"); // 03:00 Lagos
    expect(hourInTimezone(scheduleTime(at, "Africa/Lagos"), "Africa/Lagos")).toBe(8);
  });
});
