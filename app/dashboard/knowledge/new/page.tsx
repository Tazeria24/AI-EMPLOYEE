import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentContext } from "@/lib/organizations/service";
import { canManageOrg } from "@/lib/organizations/validation";
import { createKnowledgeDocument } from "@/lib/knowledge/actions";
import { SOURCE_TYPES } from "@/lib/knowledge/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AuthMessage } from "@/components/auth/auth-message";

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default async function NewKnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const ctx = await getCurrentContext();
  if (!ctx) {
    redirect("/login");
  }
  if (!canManageOrg(ctx.role)) {
    redirect("/dashboard/knowledge");
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <div className="mb-6">
        <Link
          href="/dashboard/knowledge"
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          ← Knowledge
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Add knowledge
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Only add information you can stand behind — the AI treats this as
          verified and may quote it to customers.
        </p>
      </div>

      <form action={createKnowledgeDocument} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="title">Title *</Label>
          <Input id="title" name="title" required maxLength={200} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="sourceType">Type</Label>
            <select
              id="sourceType"
              name="sourceType"
              defaultValue="document"
              className={selectClass}
            >
              {SOURCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sourceUrl">Source URL</Label>
            <Input
              id="sourceUrl"
              name="sourceUrl"
              type="url"
              placeholder="https://example.com/returns"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="content">Content *</Label>
          <Textarea
            id="content"
            name="content"
            required
            rows={12}
            className="min-h-64"
            placeholder="Paste your FAQ answers, delivery terms or returns policy."
          />
          <p className="text-xs text-muted-foreground">
            Saved content is chunked and indexed for retrieval immediately.
          </p>
        </div>

        <AuthMessage error={error} />
        <Button type="submit">Save and index</Button>
      </form>
    </main>
  );
}
