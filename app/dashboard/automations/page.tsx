import { redirect } from "next/navigation";
import { getCurrentContext } from "@/lib/organizations/service";
import { canManageOrg } from "@/lib/organizations/validation";
import { listAutomations, listRecentRuns } from "@/lib/automations/service";
import {
  createFollowUpAutomation,
  setAutomationEnabled,
} from "@/lib/automations/actions";
import { MAX_FOLLOW_UPS } from "@/lib/automations/eligibility";
import { Button } from "@/components/ui/button";
import { AuthMessage } from "@/components/auth/auth-message";

export default async function AutomationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const ctx = await getCurrentContext();
  if (!ctx) {
    redirect("/login");
  }
  const canManage = canManageOrg(ctx.role);

  const [automations, runs] = await Promise.all([
    listAutomations(),
    listRecentRuns(),
  ]);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Automations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Automatic follow-up on leads that have gone quiet. Capped at{" "}
          {MAX_FOLLOW_UPS} messages per lead, never sent during the night, and
          never sent to someone who opted out.
        </p>
      </div>

      <AuthMessage error={error} />

      {automations.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="font-medium">No automations yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add follow-up for quiet leads. It starts switched off so nothing
            goes out until you turn it on.
          </p>
          {canManage ? (
            <form action={createFollowUpAutomation} className="mt-4">
              <Button type="submit" variant="outline">
                Add lead follow-up
              </Button>
            </form>
          ) : null}
        </div>
      ) : (
        <ul className="mb-10 space-y-3">
          {automations.map((automation) => (
            <li
              key={automation.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
            >
              <div>
                <p className="font-medium">{automation.name}</p>
                <p className="text-sm text-muted-foreground">
                  After {automation.conditions?.inactive_hours ?? 24}h of
                  silence · via {automation.action_config?.channel ?? "conversation"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {automation.enabled ? "On" : "Off"}
                </span>
                {canManage ? (
                  <form action={setAutomationEnabled}>
                    <input type="hidden" name="automationId" value={automation.id} />
                    <input
                      type="hidden"
                      name="enabled"
                      value={automation.enabled ? "false" : "true"}
                    />
                    <Button
                      type="submit"
                      size="sm"
                      variant={automation.enabled ? "ghost" : "default"}
                    >
                      {automation.enabled ? "Turn off" : "Turn on"}
                    </Button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Recent runs
        </h2>
        {runs.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nothing has run yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">Follow-up</th>
                  <th className="px-4 py-2 font-medium">Channel</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b last:border-0">
                    <td className="px-4 py-2 text-muted-foreground">
                      {new Date(run.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2">
                      {run.follow_up_number ? `#${run.follow_up_number}` : "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {run.channel ?? "—"}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={
                          run.status === "failed" ? "text-destructive" : undefined
                        }
                      >
                        {run.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {run.error ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
