import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentContext } from "@/lib/organizations/service";
import { canManageOrg } from "@/lib/organizations/validation";
import {
  countChunksByDocument,
  listDocuments,
  searchKnowledge,
} from "@/lib/knowledge/service";
import {
  deleteKnowledgeDocument,
  reprocessKnowledgeDocument,
} from "@/lib/knowledge/actions";
import type { KnowledgeStatus } from "@/lib/knowledge/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthMessage } from "@/components/auth/auth-message";

function statusLabel(status: KnowledgeStatus): string {
  return status === "ready" ? "indexed" : status;
}

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; error?: string }>;
}) {
  const { q, error } = await searchParams;

  const ctx = await getCurrentContext();
  if (!ctx) {
    redirect("/login");
  }
  const canManage = canManageOrg(ctx.role);
  const query = q?.trim() ?? "";

  const [documents, chunkCounts, matches] = await Promise.all([
    listDocuments(),
    countChunksByDocument(),
    query ? searchKnowledge(ctx.organizationId, query) : Promise.resolve([]),
  ]);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Knowledge</h1>
          <p className="text-sm text-muted-foreground">
            FAQs, policies and documents your AI employee may quote from.
          </p>
        </div>
        {canManage ? (
          <Link href="/dashboard/knowledge/new" className={buttonVariants({})}>
            Add knowledge
          </Link>
        ) : null}
      </div>

      <AuthMessage error={error} />

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="q" className="text-xs text-muted-foreground">
            Test retrieval
          </label>
          <Input
            id="q"
            name="q"
            defaultValue={query}
            placeholder="Ask a question the way a customer would"
          />
        </div>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      {query ? (
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Top matches for “{query}”
          </h2>
          {matches.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No matching knowledge yet. Add documents, or try different wording.
            </div>
          ) : (
            <ul className="space-y-3">
              {matches.map((match) => (
                <li key={match.id} className="rounded-lg border p-4">
                  <div className="mb-1 text-xs text-muted-foreground">
                    similarity {match.similarity.toFixed(3)} · chunk{" "}
                    {match.chunk_index}
                  </div>
                  <p className="text-sm">{match.content}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {documents.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="font-medium">No knowledge yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your FAQs, delivery and returns policies so the AI can answer
            from verified information instead of guessing.
          </p>
          {canManage ? (
            <Link
              href="/dashboard/knowledge/new"
              className={`${buttonVariants({ variant: "outline" })} mt-4`}
            >
              Add knowledge
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Title</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Chunks</th>
                {canManage ? <th className="px-4 py-2" /> : null}
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => (
                <tr key={document.id} className="border-b last:border-0 align-top">
                  <td className="px-4 py-2">
                    <div>{document.title}</div>
                    {document.status === "error" && document.error ? (
                      <div className="mt-1 text-xs text-destructive">
                        {document.error}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {document.source_type}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        document.status === "error"
                          ? "text-destructive"
                          : document.status === "ready"
                            ? "text-foreground"
                            : "text-muted-foreground"
                      }
                    >
                      {statusLabel(document.status)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {chunkCounts[document.id] ?? 0}
                  </td>
                  {canManage ? (
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <form action={reprocessKnowledgeDocument}>
                          <input type="hidden" name="id" value={document.id} />
                          <Button type="submit" variant="ghost" size="sm">
                            Reindex
                          </Button>
                        </form>
                        <form action={deleteKnowledgeDocument}>
                          <input type="hidden" name="id" value={document.id} />
                          <Button type="submit" variant="ghost" size="sm">
                            Delete
                          </Button>
                        </form>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
