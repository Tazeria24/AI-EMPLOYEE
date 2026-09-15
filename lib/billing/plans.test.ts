import { describe, expect, it } from "vitest";
import {
  PLANS,
  PURCHASABLE_PLANS,
  describeStatus,
  effectivePlan,
  formatNaira,
  hasEntitlement,
  isPlanId,
  limitsFor,
  type SubscriptionStatus,
} from "./plans";

describe("hasEntitlement", () => {
  it.each(["trialing", "active", "past_due"] as SubscriptionStatus[])(
    "%s keeps access",
    (status) => {
      expect(hasEntitlement(status)).toBe(true);
    },
  );

  it("past_due keeps access deliberately", () => {
    // A failed card should start a conversation, not switch a business's
    // customer service off mid-day. `canceled` is where access stops.
    expect(hasEntitlement("past_due")).toBe(true);
    expect(hasEntitlement("canceled")).toBe(false);
  });

  it.each(["canceled", "incomplete"] as SubscriptionStatus[])(
    "%s removes access",
    (status) => {
      expect(hasEntitlement(status)).toBe(false);
    },
  );
});

describe("effectivePlan", () => {
  it("keeps the paid plan while entitled", () => {
    expect(effectivePlan("pro", "active")).toBe("pro");
    expect(effectivePlan("growth", "trialing")).toBe("growth");
    expect(effectivePlan("growth", "past_due")).toBe("growth");
  });

  it("falls back to none once the subscription lapses", () => {
    expect(effectivePlan("pro", "canceled")).toBe("none");
    expect(effectivePlan("pro", "incomplete")).toBe("none");
  });
});

describe("limitsFor", () => {
  it("allows nothing on a lapsed subscription", () => {
    const limits = limitsFor("pro", "canceled");
    expect(limits.maxProducts).toBe(0);
    expect(limits.maxWidgetMessagesPerDay).toBe(0);
    expect(limits.whatsappEnabled).toBe(false);
  });

  it("gates WhatsApp to the paid tiers above Starter", () => {
    expect(limitsFor("starter", "active").whatsappEnabled).toBe(false);
    expect(limitsFor("growth", "active").whatsappEnabled).toBe(true);
    expect(limitsFor("pro", "active").whatsappEnabled).toBe(true);
  });
});

describe("plan table", () => {
  it("increases every limit as the price increases", () => {
    // A plan that costs more must never allow less; an inversion here would be
    // invisible in the UI and infuriating to a customer.
    for (let i = 1; i < PURCHASABLE_PLANS.length; i += 1) {
      const lower = PURCHASABLE_PLANS[i - 1];
      const higher = PURCHASABLE_PLANS[i];
      expect(higher.priceNgn).toBeGreaterThan(lower.priceNgn);
      expect(higher.maxProducts).toBeGreaterThanOrEqual(lower.maxProducts);
      expect(higher.maxKnowledgeDocuments).toBeGreaterThanOrEqual(
        lower.maxKnowledgeDocuments,
      );
      expect(higher.maxAutomations).toBeGreaterThanOrEqual(lower.maxAutomations);
      expect(higher.maxWidgetMessagesPerDay).toBeGreaterThanOrEqual(
        lower.maxWidgetMessagesPerDay,
      );
    }
  });

  it("matches the prices in docs/BILLING.md", () => {
    expect(PLANS.starter.priceNgn).toBe(15000);
    expect(PLANS.growth.priceNgn).toBe(35000);
    expect(PLANS.pro.priceNgn).toBe(75000);
  });

  it("does not offer `none` as something to buy", () => {
    expect(PURCHASABLE_PLANS.map((plan) => plan.plan)).not.toContain("none");
  });
});

describe("isPlanId", () => {
  it.each(["starter", "growth", "pro", "none"])("accepts %s", (value) => {
    expect(isPlanId(value)).toBe(true);
  });

  it.each([null, undefined, 42, "enterprise", "", "STARTER"])(
    "rejects %s",
    (value) => {
      expect(isPlanId(value)).toBe(false);
    },
  );
});

describe("describeStatus", () => {
  it("explains a failed payment without threatening", () => {
    expect(describeStatus("past_due", null)).toMatch(/still works/i);
  });

  it("names the renewal date when there is one", () => {
    expect(describeStatus("active", "2026-12-01T00:00:00.000Z")).toMatch(/Renews on/);
  });
});

describe("formatNaira", () => {
  it("formats with the naira sign and thousands separators", () => {
    expect(formatNaira(35000)).toBe("₦35,000");
  });
});
