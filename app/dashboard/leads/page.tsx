import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentContext } from "@/lib/organizations/service";
import { countLeadsByStatus, listLeads } from "@/lib/leads/service";
import { LEAD_STATUSES, statusLabel } from "@/lib/leads/status";
import type { LeadStatus } from "@/lib/leads/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthMessage } from "@/components/auth/auth-message";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; error?: string }>;
}) {
  const { q, status, error } = await searchParams;

  const ctx = await getCurrentContext();
  if (!ctx) {
    redirect("/login");
  }

  const statusFilter = (LEAD_STATUSES as string[]).includes(status ?? "")
    ? (status as LeadStatus)
    : undefined;

  const [leads, counts] = await Promise.all([
    listLeads({ status: statusFilter, search: q?.trim() || undefined }),
    countLeadsByStatus(),
  ]);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Buying intent your AI employee captured, plus anything you add yourself.
        </p>
      </div>

      <AuthMessage error={error} />

      <div className="mb-6 flex flex-wrap gap-2">
        {LEAD_STATUSES.map((value) => {
          const active = statusFilter === value;
          return (
            <Link
              key={value}
              href={active ? "/dashboard/leads" : `/dashboard/leads?status=${value}`}
              className={`rounded-full border px-3 py-1 text-xs ${
                active ? "bg-foreground text-background" : "text-muted-foreground"
              }`}
            >
              {statusLabel(value)} · {counts[value] ?? 0}
            </Link>
          );
        })}
      </div>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        {statusFilter ? (
          <input type="hidden" name="status" value={statusFilter} />
        ) : null}
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="q" className="text-xs text-muted-foreground">
            Search
          </label>
          <Input
            id="q"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Name, phone, email or what they want"
          />
        </div>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      {leads.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="font-medium">No leads yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {q || statusFilter
              ? "Try a different search or status."
              : "Leads appear here when the AI captures buying intent, or when you create one from a conversation."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Customer</th>
                <th className="px-4 py-2 font-medium">Wants</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Score</th>
                <th className="px-4 py-2 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-b last:border-0">
                  <td className="px-4 py-2">
                    <Link
                      href={`/dashboard/leads/${lead.id}`}
                      className="underline underline-offset-4"
                    >
                      {lead.customer_name ?? "Unknown"}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {lead.customer_phone ?? lead.customer_email ?? "No contact details"}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {lead.intent ?? "—"}
                  </td>
                  <td className="px-4 py-2">{statusLabel(lead.status)}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {lead.score ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {lead.source ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
