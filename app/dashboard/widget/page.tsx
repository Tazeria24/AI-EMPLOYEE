import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentContext } from "@/lib/organizations/service";
import { canManageOrg } from "@/lib/organizations/validation";
import { getSiteOrigin } from "@/lib/site-url";
import { getWidgetSettings, getWidgetUsage } from "@/lib/widget/service";
import { saveWidgetSettings, setWidgetEnabled } from "@/lib/widget/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AuthMessage } from "@/components/auth/auth-message";
import { EmbedSnippet } from "./embed-snippet";

export default async function WidgetPage({
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

  const [settings, usage, origin] = await Promise.all([
    getWidgetSettings(),
    getWidgetUsage(),
    getSiteOrigin(),
  ]);

  if (!settings) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Website chat</h1>
        <p className="mt-4 rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Your widget is still being set up. Refresh in a moment.
        </p>
      </main>
    );
  }

  const snippet = `<script async src="${origin}/api/widget/embed?key=${settings.widget_key}"></script>`;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Website chat</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Put your AI employee on your website. Every conversation lands in your
          inbox, and you can take over at any time.
        </p>
      </div>

      <AuthMessage error={error} message={saved ? "Settings saved." : undefined} />

      {/* Status + kill switch */}
      <section className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
        <div>
          <p className="font-medium">
            {settings.enabled ? "Live on your website" : "Switched off"}
          </p>
          <p className="text-sm text-muted-foreground">
            {settings.enabled
              ? "Visitors can chat with your AI employee right now."
              : "Nobody can chat yet. Turn it on when you are ready."}
          </p>
        </div>
        {canManage ? (
          <form action={setWidgetEnabled}>
            <input
              type="hidden"
              name="enabled"
              value={settings.enabled ? "false" : "true"}
            />
            <Button type="submit" variant={settings.enabled ? "outline" : "default"}>
              {settings.enabled ? "Turn off" : "Turn on"}
            </Button>
          </form>
        ) : null}
      </section>

      {/* Embed snippet */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold">Add it to your website</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste this line just before the closing <code>&lt;/body&gt;</code> tag
          of your website. Nothing else to install.
        </p>
        <EmbedSnippet snippet={snippet} />
        <p className="mt-2 text-xs text-muted-foreground">
          Want to see it first? Open{" "}
          <a
            className="underline"
            href={`/widget/${settings.widget_key}`}
            target="_blank"
            rel="noreferrer"
          >
            a preview of your chat
          </a>
          .
        </p>
      </section>

      {/* Usage against the caps */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold">Usage today</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Answering costs money, so your account has daily limits. When a limit
          is reached the chat politely asks visitors to come back later.
        </p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-4">
            <dt className="text-sm text-muted-foreground">Messages today</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">
              {usage.messagesToday}
              <span className="text-base font-normal text-muted-foreground">
                {" / "}
                {settings.max_messages_per_day}
              </span>
            </dd>
          </div>
          <div className="rounded-lg border p-4">
            <dt className="text-sm text-muted-foreground">Chats today</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">
              {usage.sessionsToday}
              <span className="text-base font-normal text-muted-foreground">
                {" / "}
                {settings.max_sessions_per_day}
              </span>
            </dd>
          </div>
          <div className="rounded-lg border p-4">
            <dt className="text-sm text-muted-foreground">Messages, last 30 days</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">
              {usage.messagesLast30Days}
            </dd>
          </div>
        </dl>
      </section>

      {/* Conversion */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold">Results</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border p-4">
            <dt className="text-sm text-muted-foreground">Chats from your website</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">
              {usage.conversationsTotal}
            </dd>
          </div>
          <div className="rounded-lg border p-4">
            <dt className="text-sm text-muted-foreground">Leads captured from them</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">
              {usage.leadsCaptured}
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">
          Every chat appears in your{" "}
          <Link className="underline" href="/dashboard/conversations">
            inbox
          </Link>
          , and anyone who leaves their details shows up in{" "}
          <Link className="underline" href="/dashboard/leads">
            leads
          </Link>
          .
        </p>
      </section>

      {/* Settings */}
      <section>
        <h2 className="text-lg font-semibold">Appearance and limits</h2>
        <form action={saveWidgetSettings} className="mt-3 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="greeting">First message visitors see</Label>
            <Textarea
              id="greeting"
              name="greeting"
              rows={2}
              maxLength={300}
              defaultValue={settings.greeting}
              disabled={!canManage}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="themeColor">Colour</Label>
            <Input
              id="themeColor"
              name="themeColor"
              defaultValue={settings.theme_color}
              pattern="#[0-9a-fA-F]{6}"
              disabled={!canManage}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="allowedOrigins">Websites allowed to show the chat</Label>
            <Textarea
              id="allowedOrigins"
              name="allowedOrigins"
              rows={2}
              placeholder="https://yourshop.com"
              defaultValue={settings.allowed_origins.join("\n")}
              disabled={!canManage}
            />
            <p className="text-xs text-muted-foreground">
              One address per line. Leave empty to allow any website — fine
              while you are testing, worth setting once you go live.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="maxMessagesPerSession">Messages per chat</Label>
              <Input
                id="maxMessagesPerSession"
                name="maxMessagesPerSession"
                type="number"
                min={1}
                max={200}
                defaultValue={settings.max_messages_per_session}
                disabled={!canManage}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="maxMessagesPerDay">Messages per day</Label>
              <Input
                id="maxMessagesPerDay"
                name="maxMessagesPerDay"
                type="number"
                min={1}
                max={100000}
                defaultValue={settings.max_messages_per_day}
                disabled={!canManage}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="maxSessionsPerDay">Chats per day</Label>
              <Input
                id="maxSessionsPerDay"
                name="maxSessionsPerDay"
                type="number"
                min={1}
                max={100000}
                defaultValue={settings.max_sessions_per_day}
                disabled={!canManage}
                required
              />
            </div>
          </div>

          {canManage ? (
            <div>
              <Button type="submit">Save settings</Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Only an owner or admin can change these settings.
            </p>
          )}
        </form>
      </section>
    </main>
  );
}
