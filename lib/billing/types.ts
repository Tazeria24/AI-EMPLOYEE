import type { PlanId, SubscriptionStatus } from "./plans";

export interface Subscription {
  organization_id: string;
  provider: string;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  plan: PlanId;
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
}

/** What the organization is using, against what its plan allows. */
export interface UsageAgainstLimits {
  products: number;
  knowledgeDocuments: number;
  automations: number;
  widgetMessagesToday: number;
}
