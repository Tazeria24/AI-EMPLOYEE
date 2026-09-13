import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentContext } from "@/lib/organizations/service";
import { canManageOrg } from "@/lib/organizations/validation";
import { getLead, listLeadEvents } from "@/lib/leads/service";
import { LEAD_STATUSES, statusLabel } from "@/lib/leads/status";
import { updateLeadDetails, updateLeadStatus } from "@/lib/leads/actions";
import type { LeadEvent } from "@/lib/leads/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AuthMessage } from "@/components/auth/auth-message";

/** Plain-language description of a timeline entry. */
function describeEvent(event: LeadEvent): string {
  const meta = (event.metadata ?? {}) as Record<string, unknown>;
  switch (event.event_type) {
    case "created":
      return meta.source === "ai_agent"
        ? "Captured by the AI employee"
        : `Created${meta.source ? ` from ${String(meta.source)}` : ""}`;
    case "status_changed":
      return `Status changed from ${String(meta.from)} to ${String(meta.to)}`;
    case "details_updated": {
      const fields = Object.keys(meta);
      return fields.length > 0
        ? `Updated ${fields.join(", ")}`
        : "Details updated";
    }
    default:
      return event.event_type.replace(/_/g, " ");
  }
}

export default async function LeadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const ctx = await getCurrentContext();
  if (!ctx) {
    redirect("/login");
  }

  const lead = await getLead(id);
  if (!lead) {
    notFound();
  }

  const events = await listLeadEvents(id);
  const canManage = canManageOrg(ctx.role);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <div className="mb-6">
        <Link
          href="/dashboard/leads"
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          ← Leads
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {lead.customer_name ?? "Unknown customer"}
          </h1>
          <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
            {statusLabel(lead.status)}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {[lead.customer_phone, lead.customer_email].filter(Boolean).join(" · ") ||
            "No contact details captured"}
        </p>
        {lead.conversation_id ? (
          <Link
            href={`/dashboard/conversations/${lead.conversation_id}`}
            className="mt-2 inline-block text-sm underline underline-offset-4"
          >
            View the conversation this came from
          </Link>
        ) : null}
      </div>

      <AuthMessage error={error} />

      {canManage ? (
        <>
          <section className="mb-8">
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">
              Move through the pipeline
            </h2>
            <div className="flex flex-wrap gap-2">
              {LEAD_STATUSES.filter((value) => value !== lead.status).map((value) => (
                <form key={value} action={updateLeadStatus}>
                  <input type="hidden" name="leadId" value={lead.id} />
                  <input type="hidden" name="status" value={value} />
                  <Button type="submit" size="sm" variant="outline">
                    {statusLabel(value)}
                  </Button>
                </form>
              ))}
            </div>
          </section>

          <section className="mb-8">
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">
              Details
            </h2>
            <form action={updateLeadDetails} className="flex flex-col gap-4">
              <input type="hidden" name="leadId" value={lead.id} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="intent">What they want</Label>
                  <Input
                    id="intent"
                    name="intent"
                    defaultValue={lead.intent ?? ""}
                    maxLength={200}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="score">Score (0–100)</Label>
                  <Input
                    id="score"
                    name="score"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    defaultValue={lead.score ?? ""}
                  />
                  <p className="text-xs text-muted-foreground">
                    Set by you — the AI does not guess a score.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" name="notes" defaultValue={lead.notes ?? ""} />
              </div>
              <div>
                <Button type="submit">Save details</Button>
              </div>
            </form>
          </section>
        </>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Activity
        </h2>
        {events.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No activity recorded yet.
          </p>
        ) : (
          <ol className="space-y-2">
            {events.map((event) => (
              <li key={event.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm">{describeEvent(event)}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(event.created_at).toLocaleString()}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
