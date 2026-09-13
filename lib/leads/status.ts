import type { LeadStatus } from "./types";

/** Pipeline order, left to right. WON/LOST are the terminal outcomes. */
export const LEAD_STATUSES: LeadStatus[] = [
  "NEW",
  "CONTACTED",
  "INTERESTED",
  "NEGOTIATING",
  "WON",
  "LOST",
];

/** The statuses that represent a deal still in play. */
export const OPEN_STATUSES: LeadStatus[] = [
  "NEW",
  "CONTACTED",
  "INTERESTED",
  "NEGOTIATING",
];

export function isLeadStatus(value: unknown): value is LeadStatus {
  return typeof value === "string" && (LEAD_STATUSES as string[]).includes(value);
}

export function isTerminal(status: LeadStatus): boolean {
  return status === "WON" || status === "LOST";
}

export type TransitionKind =
  | "invalid"
  | "progress"
  | "regress"
  | "won"
  | "lost"
  | "reopen";

/**
 * Classify a status change, for the activity timeline.
 *
 * Deliberately permissive: real sales conversations move backwards and dead
 * deals come back, so any status may follow any other. The only thing rejected
 * is a no-op or an unknown status — what matters is that every change is
 * described accurately in the timeline.
 */
export function classifyTransition(
  from: LeadStatus,
  to: LeadStatus,
): TransitionKind {
  if (!isLeadStatus(from) || !isLeadStatus(to) || from === to) return "invalid";
  if (to === "WON") return "won";
  if (to === "LOST") return "lost";
  if (isTerminal(from)) return "reopen";
  return LEAD_STATUSES.indexOf(to) > LEAD_STATUSES.indexOf(from)
    ? "progress"
    : "regress";
}

export function statusLabel(status: LeadStatus): string {
  switch (status) {
    case "NEW":
      return "New";
    case "CONTACTED":
      return "Contacted";
    case "INTERESTED":
      return "Interested";
    case "NEGOTIATING":
      return "Negotiating";
    case "WON":
      return "Won";
    case "LOST":
      return "Lost";
  }
}
