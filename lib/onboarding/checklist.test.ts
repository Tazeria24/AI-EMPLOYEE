import { describe, expect, it } from "vitest";
import {
  TOTAL_STEPS,
  buildChecklist,
  completedCount,
  isActivated,
  type ActivationSignals,
} from "./checklist";

const NOTHING: ActivationSignals = {
  hasBusinessProfile: false,
  hasProducts: false,
  hasKnowledge: false,
  hasWidgetEnabled: false,
  hasConversation: false,
  hasLead: false,
};

const EVERYTHING: ActivationSignals = {
  hasBusinessProfile: true,
  hasProducts: true,
  hasKnowledge: true,
  hasWidgetEnabled: true,
  hasConversation: true,
  hasLead: true,
};

function currentId(signals: ActivationSignals): string | null {
  return buildChecklist(signals).find((step) => step.current)?.id ?? null;
}

describe("buildChecklist", () => {
  it("returns every step, in a stable order", () => {
    const ids = buildChecklist(NOTHING).map((step) => step.id);
    expect(ids).toEqual([
      "profile",
      "products",
      "knowledge",
      "widget",
      "conversation",
      "lead",
    ]);
    expect(ids).toHaveLength(TOTAL_STEPS);
  });

  it("points at the first thing to do", () => {
    expect(currentId(NOTHING)).toBe("profile");
  });

  it("advances as each step is completed", () => {
    expect(currentId({ ...NOTHING, hasBusinessProfile: true })).toBe("products");
    expect(
      currentId({ ...NOTHING, hasBusinessProfile: true, hasProducts: true }),
    ).toBe("knowledge");
    expect(
      currentId({
        ...NOTHING,
        hasBusinessProfile: true,
        hasProducts: true,
        hasKnowledge: true,
      }),
    ).toBe("widget");
  });

  it("never points at a step the business cannot act on", () => {
    // "Your first conversation" happens when a customer arrives. Making it the
    // next action would be telling someone to go and wait.
    const allActionsDone: ActivationSignals = {
      ...NOTHING,
      hasBusinessProfile: true,
      hasProducts: true,
      hasKnowledge: true,
      hasWidgetEnabled: true,
    };
    expect(currentId(allActionsDone)).toBeNull();

    for (const step of buildChecklist(NOTHING)) {
      if (step.current) expect(step.passive).toBe(false);
    }
  });

  it("skips a completed step even when a later one is outstanding", () => {
    // A business that added products before filling in their profile should be
    // sent back to the profile, not told to redo the products.
    expect(currentId({ ...NOTHING, hasProducts: true })).toBe("profile");
  });

  it("marks nothing current once everything is done", () => {
    expect(currentId(EVERYTHING)).toBeNull();
  });

  it("gives every step somewhere to go", () => {
    for (const step of buildChecklist(NOTHING)) {
      expect(step.href.startsWith("/"), step.id).toBe(true);
      expect(step.cta.length, step.id).toBeGreaterThan(0);
      expect(step.description.length, step.id).toBeGreaterThan(0);
    }
  });
});

describe("completedCount", () => {
  it("counts the done steps", () => {
    expect(completedCount(buildChecklist(NOTHING))).toBe(0);
    expect(completedCount(buildChecklist(EVERYTHING))).toBe(TOTAL_STEPS);
    expect(
      completedCount(buildChecklist({ ...NOTHING, hasBusinessProfile: true })),
    ).toBe(1);
  });
});

describe("isActivated", () => {
  it("is true once the four steps the business controls are done", () => {
    // Waiting on a customer to arrive is not an unfinished setup.
    expect(
      isActivated({
        ...NOTHING,
        hasBusinessProfile: true,
        hasProducts: true,
        hasKnowledge: true,
        hasWidgetEnabled: true,
      }),
    ).toBe(true);
  });

  it("is false while the widget is still off", () => {
    // The widget is what makes the AI reachable at all.
    expect(
      isActivated({
        ...NOTHING,
        hasBusinessProfile: true,
        hasProducts: true,
        hasKnowledge: true,
      }),
    ).toBe(false);
  });

  it("is false with nothing set up", () => {
    expect(isActivated(NOTHING)).toBe(false);
  });
});
