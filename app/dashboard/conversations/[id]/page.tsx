import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentContext } from "@/lib/organizations/service";
import { canManageOrg } from "@/lib/organizations/validation";
import { getConversation, listMessages } from "@/lib/conversations/service";
import { canSend, canTransition, statusLabel } from "@/lib/conversations/state";
import {
  closeConversation,
  releaseConversation,
  reopenConversation,
  requestAiReply,
  sendHumanMessage,
  takeOverConversation,
} from "@/lib/conversations/actions";
import type { SenderType } from "@/lib/conversations/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AuthMessage } from "@/components/auth/auth-message";
import { LiveRefresh } from "../live-refresh";

const SENDER_LABEL: Record<SenderType, string> = {
  customer: "Customer",
  ai: "AI employee",
  human: "You",
  system: "System",
};

function bubbleClass(sender: SenderType): string {
  if (sender === "customer") return "bg-muted/40";
  if (sender === "system") return "border-dashed text-muted-foreground";
  return "";
}

export default async function ConversationPage({
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

  const conversation = await getConversation(id);
  if (!conversation) {
    notFound();
  }

  const messages = await listMessages(id);
  const canManage = canManageOrg(ctx.role);
  const humanCanReply = canSend(conversation.status, "human");

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <LiveRefresh conversationId={id} />

      <div className="mb-6">
        <Link
          href="/dashboard/conversations"
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          ← Conversations
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Conversation</h1>
          <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
            {statusLabel(conversation.status)}
          </span>
        </div>
      </div>

      <AuthMessage error={error} />

      {canManage ? (
        <div className="mb-6 flex flex-wrap gap-2">
          {canTransition(conversation.status, "takeover") ? (
            <form action={takeOverConversation}>
              <input type="hidden" name="conversationId" value={id} />
              <Button type="submit" size="sm">
                Take over
              </Button>
            </form>
          ) : null}
          {canTransition(conversation.status, "release") ? (
            <form action={releaseConversation}>
              <input type="hidden" name="conversationId" value={id} />
              <Button type="submit" size="sm" variant="outline">
                Hand back to AI
              </Button>
            </form>
          ) : null}
          {canSend(conversation.status, "ai") ? (
            <form action={requestAiReply}>
              <input type="hidden" name="conversationId" value={id} />
              <Button type="submit" size="sm" variant="outline">
                Let the AI reply
              </Button>
            </form>
          ) : null}
          {canTransition(conversation.status, "close") ? (
            <form action={closeConversation}>
              <input type="hidden" name="conversationId" value={id} />
              <Button type="submit" size="sm" variant="ghost">
                Close
              </Button>
            </form>
          ) : null}
          {canTransition(conversation.status, "reopen") ? (
            <form action={reopenConversation}>
              <input type="hidden" name="conversationId" value={id} />
              <Button type="submit" size="sm" variant="outline">
                Reopen
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}

      {messages.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No messages in this conversation yet.
        </div>
      ) : (
        <ul className="mb-6 space-y-3">
          {messages.map((message) => (
            <li
              key={message.id}
              className={`rounded-lg border p-4 ${bubbleClass(message.sender_type)}`}
            >
              <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>{SENDER_LABEL[message.sender_type]}</span>
                <span>{new Date(message.created_at).toLocaleString()}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{message.content}</p>
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <form action={sendHumanMessage} className="flex flex-col gap-3">
          <Textarea
            name="content"
            rows={3}
            maxLength={4000}
            disabled={!humanCanReply}
            placeholder={
              humanCanReply
                ? "Reply to the customer…"
                : "Take over the conversation to reply yourself."
            }
          />
          <input type="hidden" name="conversationId" value={id} />
          <div>
            <Button type="submit" disabled={!humanCanReply}>
              Send reply
            </Button>
          </div>
        </form>
      ) : null}
    </main>
  );
}
