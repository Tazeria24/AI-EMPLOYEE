import { describe, it, expect } from "vitest";
import {
  LEAD_STATUSES,
  OPEN_STATUSES,
  classifyTransition,
  isLeadStatus,
  isTerminal,
  statusLabel,
} from "@/lib/leads/status";

describe("lead statuses", () => {
  it("matches the statuses in the database check constraint", () => {
    expect(LEAD_STATUSES).toEqual([
      "NEW",
      "CONTACTED",
      "INTERESTED",
      "NEGOTIATING",
      "WON",
      "LOST",
    ]);
  });

  it("treats only WON and LOST as terminal", () => {
    expect(isTerminal("WON")).toBe(true);
    expect(isTerminal("LOST")).toBe(true);
    expect(OPEN_STATUSES.every((s) => !isTerminal(s))).toBe(true);
  });

  it("validates unknown values safely", () => {
    expect(isLeadStatus("NEW")).toBe(true);
    expect(isLeadStatus("PENDING")).toBe(false);
    expect(isLeadStatus(7)).toBe(false);
    expect(isLeadStatus(null)).toBe(false);
  });
});

describe("classifyTransition", () => {
  it("rejects a no-op or unknown status", () => {
    expect(classifyTransition("NEW", "NEW")).toBe("invalid");
    expect(classifyTransition("NEW", "PENDING" as never)).toBe("invalid");
  });

  it("labels forward and backward movement", () => {
    expect(classifyTransition("NEW", "CONTACTED")).toBe("progress");
    expect(classifyTransition("NEGOTIATING", "CONTACTED")).toBe("regress");
  });

  it("labels the outcomes", () => {
    expect(classifyTransition("NEGOTIATING", "WON")).toBe("won");
    expect(classifyTransition("NEW", "LOST")).toBe("lost");
  });

  it("labels bringing a dead deal back as a reopen", () => {
    expect(classifyTransition("LOST", "NEGOTIATING")).toBe("reopen");
    expect(classifyTransition("WON", "CONTACTED")).toBe("reopen");
  });

  it("still classifies terminal-to-terminal by outcome", () => {
    expect(classifyTransition("WON", "LOST")).toBe("lost");
  });
});

describe("statusLabel", () => {
  it("gives every status a human label", () => {
    for (const status of LEAD_STATUSES) {
      expect(statusLabel(status)).toMatch(/^[A-Z]/);
    }
  });
});
