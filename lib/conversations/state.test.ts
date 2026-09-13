import { describe, it, expect } from "vitest";
import {
  canSend,
  canTransition,
  nextStatus,
  statusLabel,
} from "@/lib/conversations/state";

describe("conversation transitions", () => {
  it("allows takeover only from AI_ACTIVE", () => {
    expect(nextStatus("AI_ACTIVE", "takeover")).toBe("HUMAN_ACTIVE");
    expect(nextStatus("HUMAN_ACTIVE", "takeover")).toBeNull();
    expect(nextStatus("CLOSED", "takeover")).toBeNull();
  });

  it("allows release only from HUMAN_ACTIVE", () => {
    expect(nextStatus("HUMAN_ACTIVE", "release")).toBe("AI_ACTIVE");
    expect(nextStatus("AI_ACTIVE", "release")).toBeNull();
  });

  it("allows closing an open conversation from either active state", () => {
    expect(nextStatus("AI_ACTIVE", "close")).toBe("CLOSED");
    expect(nextStatus("HUMAN_ACTIVE", "close")).toBe("CLOSED");
    expect(nextStatus("CLOSED", "close")).toBeNull();
  });

  it("reopens a closed conversation into AI_ACTIVE", () => {
    expect(nextStatus("CLOSED", "reopen")).toBe("AI_ACTIVE");
    expect(canTransition("AI_ACTIVE", "reopen")).toBe(false);
  });
});

describe("who may post", () => {
  it("lets the AI post only while AI_ACTIVE", () => {
    expect(canSend("AI_ACTIVE", "ai")).toBe(true);
    expect(canSend("HUMAN_ACTIVE", "ai")).toBe(false);
    expect(canSend("CLOSED", "ai")).toBe(false);
  });

  it("lets a human post only after taking over", () => {
    expect(canSend("HUMAN_ACTIVE", "human")).toBe(true);
    expect(canSend("AI_ACTIVE", "human")).toBe(false);
  });

  it("lets customers write while the conversation is open", () => {
    expect(canSend("AI_ACTIVE", "customer")).toBe(true);
    expect(canSend("HUMAN_ACTIVE", "customer")).toBe(true);
    expect(canSend("CLOSED", "customer")).toBe(false);
  });

  it("allows system notes even on a closed conversation", () => {
    expect(canSend("CLOSED", "system")).toBe(true);
  });
});

describe("statusLabel", () => {
  it("describes each state", () => {
    expect(statusLabel("AI_ACTIVE")).toBe("AI replying");
    expect(statusLabel("HUMAN_ACTIVE")).toBe("You replying");
    expect(statusLabel("CLOSED")).toBe("Closed");
  });
});
