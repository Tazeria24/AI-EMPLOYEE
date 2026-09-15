import type { ConversationStatus, SenderType } from "./types";

/**
 * The conversation state machine, kept pure so the UI and the server actions
 * consult exactly the same rules and it can be tested without a database.
 *
 * AI_ACTIVE    — the AI answers automatically.
 * HUMAN_ACTIVE — a person has taken over; the AI must not post (enforced for
 *                real by append_ai_message() in migration 0006).
 * CLOSED       — finished; nobody posts until it is reopened.
 */
export type ConversationAction = "takeover" | "release" | "close" | "reopen";

const TRANSITIONS: Record<ConversationAction, {
  from: ConversationStatus[];
  to: ConversationStatus;
}> = {
  takeover: { from: ["AI_ACTIVE"], to: "HUMAN_ACTIVE" },
  release: { from: ["HUMAN_ACTIVE"], to: "AI_ACTIVE" },
  close: { from: ["AI_ACTIVE", "HUMAN_ACTIVE"], to: "CLOSED" },
  reopen: { from: ["CLOSED"], to: "AI_ACTIVE" },
};

export function canTransition(
  status: ConversationStatus,
  action: ConversationAction,
): boolean {
  return TRANSITIONS[action].from.includes(status);
}

/** The status after `action`, or null when the transition is not legal. */
export function nextStatus(
  status: ConversationStatus,
  action: ConversationAction,
): ConversationStatus | null {
  return canTransition(status, action) ? TRANSITIONS[action].to : null;
}

/** Who is allowed to post in a given state. */
export function canSend(
  status: ConversationStatus,
  sender: SenderType,
): boolean {
  if (status === "CLOSED") return sender === "system";
  if (sender === "ai") return status === "AI_ACTIVE";
  if (sender === "human") return status === "HUMAN_ACTIVE";
  // Customers may always write in an open conversation; system notes too.
  return sender === "customer" || sender === "system";
}

export function statusLabel(status: ConversationStatus): string {
  switch (status) {
    case "AI_ACTIVE":
      return "AI replying";
    case "HUMAN_ACTIVE":
      return "You replying";
    case "CLOSED":
      return "Closed";
  }
}
