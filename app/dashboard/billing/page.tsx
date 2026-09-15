import { redirect } from "next/navigation";
import { getCurrentContext } from "@/lib/organizations/service";
import { canManageOrg } from "@/lib/organizations/validation";
import { getSubscription, getUsageAgainstLimits } from "@/lib/billing/service";
import { startCheckout } from "@/lib/billing/actions";
import {
  PLANS,
  PURCHASABLE_PLANS,
  describeStatus,
  effectivePlan,
  formatNaira,
  limitsFor,
} from "@/lib/billing/plans";
import { Button } from "@/components/ui/button";
import { AuthMessage } from "@/components/auth/auth-message";

function UsageRow({
  label,
  used,
  allowed,
}: {
  label: string;
  used: number;
  allowed: number;
}) {
  const atLimit = allowed > 0 && used >= allowed;
  const percent = allowed > 0 ? Math.min(100, Math.round((used / allowed) * 100)) : 100;

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-sm font-medium tabular-nums">
          {used} / {allowed}
        </p>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${used} of ${allowed} ${label} used`}
      >
        <div
          className={atLimit ? "h-full bg-destructive" : "h-full bg-foreground/70"}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; stub_checkout?: string }>;
}) {
  const { error, stub_checkout: stubCheckout } = await searchParams;

  const ctx = await getCurrentContext();
  if (!ctx) {
    redirect("/login");
  }
  const canManage = canManageOrg(ctx.role);

  const [subscription, usage] = await Promise.all([
    getSubscription(),
    getUsageAgainstLimits(),
  ]);

  if (!subscription) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Plan &amp; billing</h1>
        <p className="mt-4 rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Your plan is still being set up. Refresh in a moment.
        </p>
      </main>
    );
  }

  const current = effectivePlan(subscription.plan, subscription.status);
  const limits = limitsFor(subscription.plan, subscription.status);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Plan &amp; billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What your account includes, and how much of it you are using.
        </p>
      </div>

      <AuthMessage
        error={error}
        message={
          stubCheckout
            ? "Payments are not connected yet, so nothing was charged. Your plan is unchanged."
            : undefined
        }
      />

      <section className="mb-8 rounded-lg border p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-lg font-semibold">{PLANS[current].name}</p>
          {PLANS[current].priceNgn > 0 ? (
            <p className="text-sm text-muted-foreground">
              {formatNaira(PLANS[current].priceNgn)} / month
            </p>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {describeStatus(subscription.status, subscription.current_period_end)}
        </p>
        {subscription.cancel_at_period_end ? (
          <p className="mt-2 text-sm text-destructive">
            This plan is set to end at the close of the current period.
          </p>
        ) : null}
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold">What you are using</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <UsageRow label="Products" used={usage.products} allowed={limits.maxProducts} />
          <UsageRow
            label="Knowledge documents"
            used={usage.knowledgeDocuments}
            allowed={limits.maxKnowledgeDocuments}
          />
          <UsageRow
            label="Automations"
            used={usage.automations}
            allowed={limits.maxAutomations}
          />
          <UsageRow
            label="Website chat messages today"
            used={usage.widgetMessagesToday}
            allowed={limits.maxWidgetMessagesPerDay}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          These limits are enforced on your account, not just shown here — going
          over is refused rather than billed as an extra.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Plans</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {PURCHASABLE_PLANS.map((plan) => {
            const isCurrent = plan.plan === current;
            return (
              <div
                key={plan.plan}
                className={
                  isCurrent
                    ? "flex flex-col rounded-lg border-2 border-foreground/70 p-4"
                    : "flex flex-col rounded-lg border p-4"
                }
              >
                <p className="font-semibold">{plan.name}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {formatNaira(plan.priceNgn)}
                  <span className="text-sm font-normal text-muted-foreground">
                    {" "}
                    / month
                  </span>
                </p>
                <ul className="mt-3 flex-1 space-y-1 text-sm text-muted-foreground">
                  <li>{plan.maxProducts.toLocaleString()} products</li>
                  <li>{plan.maxKnowledgeDocuments} knowledge documents</li>
                  <li>
                    {plan.maxAutomations} follow-up{" "}
                    {plan.maxAutomations === 1 ? "automation" : "automations"}
                  </li>
                  <li>
                    {plan.maxWidgetMessagesPerDay.toLocaleString()} chat messages a day
                  </li>
                  <li>{plan.whatsappEnabled ? "WhatsApp included" : "Website chat only"}</li>
                </ul>

                {isCurrent ? (
                  <p className="mt-4 text-sm font-medium">Your current plan</p>
                ) : canManage ? (
                  <form action={startCheckout} className="mt-4">
                    <input type="hidden" name="plan" value={plan.plan} />
                    <Button type="submit" variant="outline" className="w-full">
                      Choose {plan.name}
                    </Button>
                  </form>
                ) : null}
              </div>
            );
          })}
        </div>
        {!canManage ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Only an owner or admin can change the plan.
          </p>
        ) : null}
      </section>
    </main>
  );
}
