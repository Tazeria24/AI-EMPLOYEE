import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentContext } from "@/lib/organizations/service";
import { listConversations } from "@/lib/conversations/service";
import { statusLabel } from "@/lib/conversations/state";
import type { ConversationStatus } from "@/lib/conversations/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthMessage } from "@/components/auth/auth-message";

const STATUSES: ConversationStatus[] = ["AI_ACTIVE", "HUMAN_ACTIVE", "CLOSED"];

function when(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; error?: string }>;
}) {
  const { q, status, error } = await searchParams;

  const ctx = await getCurrentContext();
  if (!ctx) {
    redirect("/login");
  }

  const statusFilter = STATUSES.includes(status as ConversationStatus)
    ? (status as ConversationStatus)
    : undefined;

  const conversations = await listConversations({
    search: q?.trim() || undefined,
    status: statusFilter,
  });

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Conversations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every customer conversation. Take over any of them at any time.
        </p>
      </div>

      <AuthMessage error={error} />

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="q" className="text-xs text-muted-foreground">
            Search
          </label>
          <Input
            id="q"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Customer name or message text"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="status" className="text-xs text-muted-foreground">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status ?? "all"}
            className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">All</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {statusLabel(value)}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      {conversations.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="font-medium">No conversations yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {q || statusFilter
              ? "Try adjusting your search or filter."
              : "Conversations appear here once customers start chatting."}
          </p>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <Link
                href={`/dashboard/conversations/${conversation.id}`}
                className="flex flex-col gap-1 p-4 hover:bg-muted/40"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">
                    {conversation.customer_name ?? "Unknown customer"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {statusLabel(conversation.status)} ·{" "}
                    {when(conversation.last_message_at)}
                  </span>
                </div>
                <p className="line-clamp-1 text-sm text-muted-foreground">
                  {conversation.last_message ?? "No messages yet"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
