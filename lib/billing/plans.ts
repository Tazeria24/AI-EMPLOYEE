/**
 * Plans and entitlements, pure.
 *
 * These mirror `plan_limits` in migration 0010, which is where they are
 * actually enforced. This module exists so the UI can describe a plan and
 * anticipate a limit without a round trip — never as the enforcement point.
 * If the two ever disagree, the database wins, because it is what refuses the
 * write.
 */

export type PlanId = "none" | "starter" | "growth" | "pro";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete";

export interface PlanLimits {
  plan: PlanId;
  name: string;
  priceNgn: number;
  maxProducts: number;
  maxKnowledgeDocuments: number;
  maxAutomations: number;
  maxWidgetMessagesPerDay: number;
  whatsappEnabled: boolean;
}

export const PLANS: Record<PlanId, PlanLimits> = {
  none: {
    plan: "none",
    name: "No active plan",
    priceNgn: 0,
    maxProducts: 0,
    maxKnowledgeDocuments: 0,
    maxAutomations: 0,
    maxWidgetMessagesPerDay: 0,
    whatsappEnabled: false,
  },
  starter: {
    plan: "starter",
    name: "Starter",
    priceNgn: 15000,
    maxProducts: 100,
    maxKnowledgeDocuments: 20,
    maxAutomations: 1,
    maxWidgetMessagesPerDay: 500,
    whatsappEnabled: false,
  },
  growth: {
    plan: "growth",
    name: "Growth",
    priceNgn: 35000,
    maxProducts: 1000,
    maxKnowledgeDocuments: 100,
    maxAutomations: 5,
    maxWidgetMessagesPerDay: 2000,
    whatsappEnabled: true,
  },
  pro: {
    plan: "pro",
    name: "Pro",
    priceNgn: 75000,
    maxProducts: 10000,
    maxKnowledgeDocuments: 500,
    maxAutomations: 25,
    maxWidgetMessagesPerDay: 10000,
    whatsappEnabled: true,
  },
};

/** Plans a business can actually buy, cheapest first. */
export const PURCHASABLE_PLANS: PlanLimits[] = [
  PLANS.starter,
  PLANS.growth,
  PLANS.pro,
];

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && value in PLANS;
}

/**
 * Statuses that entitle an organization to its plan.
 *
 * `past_due` is deliberately included: a failed card should start a
 * conversation, not switch off a business's customer service mid-day. The
 * provider's dunning retries run for days, and `canceled` is where access
 * actually stops.
 */
export function hasEntitlement(status: SubscriptionStatus): boolean {
  return status === "trialing" || status === "active" || status === "past_due";
}

/** The plan actually in force, which is `none` once a subscription lapses. */
export function effectivePlan(plan: PlanId, status: SubscriptionStatus): PlanId {
  return hasEntitlement(status) ? plan : "none";
}

export function limitsFor(plan: PlanId, status: SubscriptionStatus): PlanLimits {
  return PLANS[effectivePlan(plan, status)];
}

/** Human wording for a subscription state, for the dashboard. */
export function describeStatus(
  status: SubscriptionStatus,
  periodEnd: string | Date | null,
): string {
  const when = periodEnd
    ? new Date(periodEnd).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  switch (status) {
    case "trialing":
      return when ? `Free trial until ${when}.` : "Free trial.";
    case "active":
      return when ? `Renews on ${when}.` : "Active.";
    case "past_due":
      return "We could not take your last payment. Please update your card — your account still works for now.";
    case "canceled":
      return "Your subscription has ended. Choose a plan to switch everything back on.";
    case "incomplete":
      return "Your payment was not completed. Choose a plan to try again.";
  }
}

export function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG")}`;
}
