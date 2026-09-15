"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "@/lib/organizations/service";
import { logger } from "@/lib/observability/logger";
import { parseFeedback } from "./validation";

const PAGE = "/dashboard/feedback";

/**
 * Submit beta feedback.
 *
 * Any member may report a problem, not just an admin — restricting this would
 * lose exactly the people who use the product most. The message is stored as
 * written, because paraphrasing a bug report loses the bug.
 */
export async function submitFeedback(formData: FormData): Promise<void> {
  const ctx = await getCurrentContext();
  if (!ctx) redirect("/login");

  const parsed = parseFeedback({
    kind: formData.get("kind"),
    message: formData.get("message"),
    page: formData.get("page"),
  });
  if (!parsed.ok) {
    redirect(`${PAGE}?error=${encodeURIComponent(parsed.error)}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("feedback").insert({
    organization_id: ctx.organizationId,
    user_id: ctx.userId,
    kind: parsed.data.kind,
    message: parsed.data.message,
    page: parsed.data.page,
  });
  if (error) {
    redirect(
      `${PAGE}?error=${encodeURIComponent("Could not send that. Please try again.")}`,
    );
  }

  // Surfaced in logs too, so a beta report is noticed the same day rather than
  // whenever someone next looks at the table.
  logger.info({
    event: "feedback.submitted",
    organizationId: ctx.organizationId,
    kind: parsed.data.kind,
    page: parsed.data.page ?? undefined,
  });

  revalidatePath(PAGE);
  redirect(`${PAGE}?sent=1`);
}
