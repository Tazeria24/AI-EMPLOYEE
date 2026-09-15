"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "@/lib/organizations/service";
import { canManageOrg } from "@/lib/organizations/validation";
import { getSiteOrigin } from "@/lib/site-url";
import { getPaymentProvider } from "@/lib/payments";
import { isPlanId } from "./plans";

const PAGE = "/dashboard/billing";

function fail(message: string): never {
  redirect(`${PAGE}?error=${encodeURIComponent(message)}`);
}

/**
 * Start a hosted checkout for a plan.
 *
 * Note what this action does NOT do: it never writes the plan. It asks the
 * provider for a checkout URL and sends the customer there. The subscription
 * only changes when the provider's signed webhook says it did — which is the
 * whole point of `authenticated` having no UPDATE grant on `subscriptions`.
 * A tampered form can at most start a checkout for a different plan, which
 * then has to be paid for.
 */
export async function startCheckout(formData: FormData): Promise<void> {
  const ctx = await getCurrentContext();
  if (!ctx) redirect("/login");
  if (!canManageOrg(ctx.role)) {
    fail("You do not have permission to change the plan.");
  }

  const plan = formData.get("plan");
  if (!isPlanId(plan) || plan === "none") {
    fail("Choose one of the available plans.");
  }

  let provider;
  try {
    provider = getPaymentProvider();
  } catch {
    fail("Payments are not set up yet.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const origin = await getSiteOrigin();
  const result = await provider.createCheckout({
    organizationId: ctx.organizationId,
    plan,
    returnUrl: `${origin}${PAGE}`,
    customerEmail: user?.email ?? null,
  });

  if (!result.ok) fail(result.error);

  redirect(result.url);
}
