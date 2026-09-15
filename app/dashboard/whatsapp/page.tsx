import { redirect } from "next/navigation";
import { getCurrentContext } from "@/lib/organizations/service";
import { canManageOrg } from "@/lib/organizations/validation";
import { getSiteOrigin } from "@/lib/site-url";
import { getWhatsAppStatus, listIntegrationEvents } from "@/lib/whatsapp/service";
import { saveWhatsAppConnection, setWhatsAppEnabled } from "@/lib/whatsapp/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthMessage } from "@/components/auth/auth-message";

function Secret({ set, label }: { set: boolean; label: string }) {
  return (
    <p className="text-xs text-muted-foreground">
      {set ? `${label} is saved. Leave blank to keep it.` : `${label} is not set yet.`}
    </p>
  );
}

export default async function WhatsAppPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { error, saved } = await searchParams;

  const ctx = await getCurrentContext();
  if (!ctx) {
    redirect("/login");
  }
  const canManage = canManageOrg(ctx.role);

  const [status, events, origin] = await Promise.all([
    getWhatsAppStatus(),
    listIntegrationEvents(),
    getSiteOrigin(),
  ]);

  const callbackUrl = `${origin}/api/webhooks/whatsapp`;
  const ready =
    Boolean(status?.phone_number_id) &&
    Boolean(status?.has_verify_token) &&
    Boolean(status?.has_app_secret) &&
    Boolean(status?.has_access_token);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">WhatsApp</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Let customers reach your AI employee on WhatsApp. Every chat lands in
          your inbox, and you can take over at any time.
        </p>
      </div>

      <AuthMessage error={error} message={saved ? "Connection saved." : undefined} />

      <section className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
        <div>
          <p className="font-medium">
            {status?.enabled ? "Connected and answering" : "Switched off"}
          </p>
          <p className="text-sm text-muted-foreground">
            {status?.enabled
              ? `Replying on ${status.display_phone_number ?? "your WhatsApp number"}.`
              : ready
                ? "Everything is filled in. Turn it on when you are ready to answer real customers."
                : "Add your connection details below first."}
          </p>
        </div>
        {canManage ? (
          <form action={setWhatsAppEnabled}>
            <input
              type="hidden"
              name="enabled"
              value={status?.enabled ? "false" : "true"}
            />
            <Button
              type="submit"
              variant={status?.enabled ? "outline" : "default"}
              disabled={!status?.enabled && !ready}
            >
              {status?.enabled ? "Turn off" : "Turn on"}
            </Button>
          </form>
        ) : null}
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold">Webhook address</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste this into Meta as your callback URL, with the same verify token
          you enter below.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg border bg-muted p-3 text-xs">
          <code>{callbackUrl}</code>
        </pre>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold">Connection details</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          From your Meta app. Secrets are stored write-only — we can use them,
          but this page can never show them back to you.
        </p>

        <form action={saveWhatsAppConnection} className="mt-3 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="phoneNumberId">Phone number ID</Label>
            <Input
              id="phoneNumberId"
              name="phoneNumberId"
              inputMode="numeric"
              defaultValue={status?.phone_number_id ?? ""}
              disabled={!canManage}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="wabaId">WhatsApp Business Account ID</Label>
            <Input
              id="wabaId"
              name="wabaId"
              inputMode="numeric"
              defaultValue={status?.waba_id ?? ""}
              disabled={!canManage}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="displayPhoneNumber">Your WhatsApp number</Label>
            <Input
              id="displayPhoneNumber"
              name="displayPhoneNumber"
              defaultValue={status?.display_phone_number ?? ""}
              placeholder="+234 800 000 0000"
              disabled={!canManage}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="verifyToken">Verify token</Label>
            <Input
              id="verifyToken"
              name="verifyToken"
              type="password"
              autoComplete="off"
              disabled={!canManage}
            />
            <Secret set={Boolean(status?.has_verify_token)} label="The verify token" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="appSecret">App secret</Label>
            <Input
              id="appSecret"
              name="appSecret"
              type="password"
              autoComplete="off"
              disabled={!canManage}
            />
            <Secret set={Boolean(status?.has_app_secret)} label="The app secret" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="accessToken">Access token</Label>
            <Input
              id="accessToken"
              name="accessToken"
              type="password"
              autoComplete="off"
              disabled={!canManage}
            />
            <Secret set={Boolean(status?.has_access_token)} label="The access token" />
          </div>

          {canManage ? (
            <div>
              <Button type="submit">Save connection</Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Only an owner or admin can change these settings.
            </p>
          )}
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Recent activity</h2>
        {events.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed p-10 text-center">
            <p className="font-medium">Nothing received yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Messages from customers will appear here once WhatsApp is
              connected and switched on.
            </p>
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {events.map((event) => (
              <li
                key={event.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">{event.event_type ?? event.provider}</p>
                  {event.error ? (
                    <p className="text-xs text-destructive">{event.error}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="rounded-full border px-2 py-0.5">{event.status}</span>
                  <time dateTime={event.created_at}>
                    {new Date(event.created_at).toLocaleString()}
                  </time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
