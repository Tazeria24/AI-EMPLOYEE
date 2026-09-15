import { redirect } from "next/navigation";
import { getCurrentContext } from "@/lib/organizations/service";
import { listFeedback } from "@/lib/feedback/service";
import { submitFeedback } from "@/lib/feedback/actions";
import { FEEDBACK_KINDS, MAX_FEEDBACK_LENGTH } from "@/lib/feedback/validation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AuthMessage } from "@/components/auth/auth-message";

const KIND_LABELS: Record<string, string> = {
  problem: "Something is not working",
  bug: "I found a bug",
  idea: "I have an idea",
  general: "Something else",
};

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string; page?: string }>;
}) {
  const { error, sent, page } = await searchParams;

  const ctx = await getCurrentContext();
  if (!ctx) {
    redirect("/login");
  }

  const previous = await listFeedback();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Send feedback</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          You are one of our first businesses. Tell us what is broken, confusing
          or missing — it goes straight to the people building this.
        </p>
      </div>

      <AuthMessage
        error={error}
        message={sent ? "Thank you — we have it." : undefined}
      />

      <form action={submitFeedback} className="mt-4 flex flex-col gap-4">
        <input type="hidden" name="page" value={page ?? ""} />

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">What kind of thing is it?</legend>
          <div className="mt-1 flex flex-col gap-2">
            {FEEDBACK_KINDS.map((kind, index) => (
              <label key={kind} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="kind"
                  value={kind}
                  defaultChecked={index === 0}
                  className="h-4 w-4"
                />
                {KIND_LABELS[kind]}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <Label htmlFor="message">What happened?</Label>
          <Textarea
            id="message"
            name="message"
            rows={6}
            maxLength={MAX_FEEDBACK_LENGTH}
            required
            placeholder="The AI said we deliver on Sundays, but we don't."
          />
          <p className="text-xs text-muted-foreground">
            If it was a conversation, telling us roughly when it happened helps
            us find it.
          </p>
        </div>

        <div>
          <Button type="submit">Send</Button>
        </div>
      </form>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">What you have sent</h2>
        {previous.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nothing yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {previous.map((item) => (
              <li key={item.id} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {KIND_LABELS[item.kind] ?? item.kind}
                  </span>
                  <span className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="rounded-full border px-2 py-0.5">
                      {item.status}
                    </span>
                    <time dateTime={item.created_at}>
                      {new Date(item.created_at).toLocaleDateString()}
                    </time>
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                  {item.message}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
