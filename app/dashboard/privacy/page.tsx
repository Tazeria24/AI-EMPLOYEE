import { redirect } from "next/navigation";
import { getCurrentContext } from "@/lib/organizations/service";
import { canManageOrg } from "@/lib/organizations/validation";
import { getPrivacySummary } from "@/lib/privacy/service";
import { purgeCustomerData, saveRetention } from "@/lib/privacy/actions";
import { MAX_RETENTION_DAYS, MIN_RETENTION_DAYS } from "@/lib/privacy/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthMessage } from "@/components/auth/auth-message";

export default async function PrivacyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; message?: string }>;
}) {
  const { error, saved, message } = await searchParams;

  const ctx = await getCurrentContext();
  if (!ctx) {
    redirect("/login");
  }
  const canManage = canManageOrg(ctx.role);
  const summary = await getPrivacySummary();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Privacy &amp; data</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What customer information your AI employee holds, how long it keeps
          it, and how to delete it.
        </p>
      </div>

      <AuthMessage error={error} message={saved ? "Saved." : message} />

      <section className="mb-8">
        <h2 className="text-lg font-semibold">What you hold right now</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-4">
            <dt className="text-sm text-muted-foreground">Customers</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">
              {summary.customers}
            </dd>
          </div>
          <div className="rounded-lg border p-4">
            <dt className="text-sm text-muted-foreground">Conversations</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">
              {summary.conversations}
            </dd>
          </div>
          <div className="rounded-lg border p-4">
            <dt className="text-sm text-muted-foreground">Messages</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">
              {summary.messages}
            </dd>
          </div>
        </dl>
        {summary.oldestConversationAt ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Oldest conversation:{" "}
            {new Date(summary.oldestConversationAt).toLocaleDateString()}
          </p>
        ) : null}
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold">How long you keep conversations</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Conversations older than this are deleted automatically, along with
          their messages. Nigeria&apos;s data-protection rules expect a stated
          limit rather than keeping everything forever.
        </p>
        <form action={saveRetention} className="mt-3 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="retentionDays">Days</Label>
            <Input
              id="retentionDays"
              name="retentionDays"
              type="number"
              min={MIN_RETENTION_DAYS}
              max={MAX_RETENTION_DAYS}
              defaultValue={summary.retentionDays}
              disabled={!canManage}
              required
              className="w-32"
            />
          </div>
          {canManage ? <Button type="submit">Save</Button> : null}
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Delete customer data</h2>
        <div className="mt-3 rounded-lg border border-destructive/40 p-4">
          <p className="text-sm">
            Deletes every customer record, conversation, message and lead. Your
            products, knowledge base and settings are kept. This cannot be
            undone.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Use this when a customer asks you to erase their information, or
            before handing the account to someone else.
          </p>
          {canManage ? (
            <form action={purgeCustomerData} className="mt-4 flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="confirm">Type DELETE to confirm</Label>
                <Input
                  id="confirm"
                  name="confirm"
                  autoComplete="off"
                  placeholder="DELETE"
                  className="w-40"
                />
              </div>
              <Button type="submit" variant="outline">
                Delete customer data
              </Button>
            </form>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Only an owner or admin can delete customer data.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
