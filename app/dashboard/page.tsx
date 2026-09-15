import Link from "next/link";
import { redirect } from "next/navigation";
import { getBusinessProfile, getCurrentContext } from "@/lib/organizations/service";
import {
  getActivationSignals,
  getDashboardCounts,
} from "@/lib/onboarding/service";
import {
  TOTAL_STEPS,
  buildChecklist,
  completedCount,
  isActivated,
} from "@/lib/onboarding/checklist";
import { buttonVariants } from "@/components/ui/button";
import { AuthMessage } from "@/components/auth/auth-message";

function Stat({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg border p-4 transition-colors hover:bg-muted/50"
    >
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
    </Link>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;

  const ctx = await getCurrentContext();
  if (!ctx) {
    redirect("/login");
  }

  const profile = await getBusinessProfile(ctx.organizationId);
  if (!profile?.business_name) {
    redirect("/onboarding");
  }

  const [signals, counts] = await Promise.all([
    getActivationSignals(ctx.organizationId),
    getDashboardCounts(),
  ]);

  const steps = buildChecklist(signals);
  const done = completedCount(steps);
  const activated = isActivated(signals);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      {message ? (
        <div className="mb-6">
          <AuthMessage message={message} />
        </div>
      ) : null}

      <p className="text-sm font-medium text-muted-foreground">
        {profile.business_name}
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">
        {activated ? "Your AI employee is working" : "Let's get you set up"}
      </h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        {activated
          ? "Everything is connected. Below is what has happened today, and you can step into any conversation whenever you want to."
          : "Your AI employee can only tell customers what you have told it. Work through this list and it starts answering for you."}
      </p>

      <section className="mt-8 grid gap-3 sm:grid-cols-3">
        <Stat
          label="Open conversations"
          value={counts.openConversations}
          href="/dashboard/conversations"
        />
        <Stat label="New leads" value={counts.newLeads} href="/dashboard/leads" />
        <Stat
          label="Chat messages today"
          value={counts.widgetMessagesToday}
          href="/dashboard/widget"
        />
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Setup</h2>
          <p className="text-sm text-muted-foreground tabular-nums">
            {done} of {TOTAL_STEPS} done
          </p>
        </div>

        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={`${done} of ${TOTAL_STEPS} setup steps complete`}
        >
          <div
            className="h-full bg-foreground/70"
            style={{ width: `${Math.round((done / TOTAL_STEPS) * 100)}%` }}
          />
        </div>

        <ol className="mt-4 space-y-3">
          {steps.map((step) => (
            <li
              key={step.id}
              className={
                step.current
                  ? "flex flex-wrap items-start justify-between gap-3 rounded-lg border-2 border-foreground/70 p-4"
                  : "flex flex-wrap items-start justify-between gap-3 rounded-lg border p-4"
              }
            >
              <div className="flex min-w-0 items-start gap-3">
                <span
                  aria-hidden
                  className={
                    step.done
                      ? "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-xs text-background"
                      : "mt-0.5 h-5 w-5 shrink-0 rounded-full border"
                  }
                >
                  {step.done ? "✓" : null}
                </span>
                <div className="min-w-0">
                  <p className="font-medium">
                    {step.title}
                    {step.done ? (
                      <span className="sr-only"> — done</span>
                    ) : step.passive ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        happens on its own
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </div>

              {step.done ? null : (
                <Link
                  href={step.href}
                  className={buttonVariants({
                    variant: step.current ? "default" : "outline",
                    size: "sm",
                  })}
                >
                  {step.cta}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10 rounded-lg border border-dashed p-4">
        <p className="font-medium">Something not working?</p>
        <p className="mt-1 text-sm text-muted-foreground">
          You are one of our first businesses, so tell us when something is
          wrong or missing — it goes straight to the people building this.
        </p>
        <Link
          href="/dashboard/feedback"
          className={buttonVariants({ variant: "outline", size: "sm", className: "mt-3" })}
        >
          Send feedback
        </Link>
      </section>
    </main>
  );
}
