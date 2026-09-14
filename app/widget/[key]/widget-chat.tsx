"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_MESSAGE_LENGTH } from "@/lib/widget/validation";

interface Entry {
  id: number;
  from: "visitor" | "assistant" | "system";
  text: string;
}

/** Only accept a literal hex colour from the database into a style value. */
function safeColor(value: string): string {
  return /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : "#0F5C63";
}

export function WidgetChat({
  widgetKey,
  businessName,
  greeting,
  themeColor,
}: {
  widgetKey: string;
  businessName: string;
  greeting: string;
  themeColor: string;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const tokenRef = useRef<string | null>(null);
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);

  const accent = safeColor(themeColor);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries, sending]);

  function append(from: Entry["from"], text: string) {
    setEntries((current) => [...current, { id: nextId.current++, from, text }]);
  }

  /**
   * Sessions are created on the first message, not on load: a page that merely
   * has the widget on it should not consume the business's daily session quota.
   */
  async function ensureToken(): Promise<string | null> {
    if (tokenRef.current) return tokenRef.current;

    const response = await fetch("/api/widget/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: widgetKey }),
    });
    const body = (await response.json().catch(() => null)) as
      | { token?: string; error?: string }
      | null;

    if (!response.ok || !body?.token) {
      setError(body?.error ?? "Could not start this chat.");
      return null;
    }
    tokenRef.current = body.token;
    return body.token;
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;

    setError(null);
    setSending(true);
    setDraft("");
    append("visitor", content);

    try {
      const token = await ensureToken();
      if (!token) return;

      const response = await fetch("/api/widget/message", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, content }),
      });
      const body = (await response.json().catch(() => null)) as
        | { reply?: string | null; error?: string; handedOff?: boolean }
        | null;

      if (body?.handedOff) {
        append("system", `Someone from ${businessName} is replying to you.`);
        return;
      }
      if (!response.ok || !body?.reply) {
        setError(body?.error ?? "Could not send that message.");
        // 429/403/404 mean this chat is over; stop offering the composer.
        if (response.status === 429 || response.status === 403 || response.status === 404) {
          setClosed(true);
        }
        return;
      }
      append("assistant", body.reply);
    } catch {
      setError("Could not reach the assistant. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="flex h-dvh flex-col bg-background text-foreground">
      <header
        className="flex items-center gap-3 px-4 py-3 text-white"
        style={{ backgroundColor: accent }}
      >
        <span
          aria-hidden
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-sm font-semibold"
        >
          {businessName.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{businessName}</p>
          <p className="truncate text-xs text-white/80">Usually replies instantly</p>
        </div>
      </header>

      <div
        className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
        role="log"
        aria-live="polite"
        aria-label="Conversation"
      >
        <p className="max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm">
          {greeting}
        </p>

        {entries.map((entry) =>
          entry.from === "system" ? (
            <p key={entry.id} className="text-center text-xs text-muted-foreground">
              {entry.text}
            </p>
          ) : (
            <p
              key={entry.id}
              className={
                entry.from === "visitor"
                  ? "ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm px-3 py-2 text-sm text-white"
                  : "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm"
              }
              style={entry.from === "visitor" ? { backgroundColor: accent } : undefined}
            >
              {entry.text}
            </p>
          ),
        )}

        {sending ? (
          <p className="max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm text-muted-foreground">
            Typing…
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="text-center text-xs text-destructive">
            {error}
          </p>
        ) : null}

        <div ref={endRef} />
      </div>

      {closed ? (
        <p className="border-t px-4 py-3 text-center text-xs text-muted-foreground">
          This chat has ended.
        </p>
      ) : (
        <form onSubmit={send} className="flex items-end gap-2 border-t p-3">
          <label htmlFor="widget-message" className="sr-only">
            Your message
          </label>
          <input
            id="widget-message"
            name="message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={MAX_MESSAGE_LENGTH}
            autoComplete="off"
            placeholder="Type your message…"
            className="h-10 flex-1 rounded-full border px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={sending || draft.trim().length === 0}
            className="h-10 rounded-full px-4 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: accent }}
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </form>
      )}
    </main>
  );
}
