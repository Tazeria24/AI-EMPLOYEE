/**
 * Pure follow-up eligibility rules.
 *
 * Kept free of database and clock access so the anti-spam rules — the ones the
 * planning audit flagged as the way to get a business reported for spam — can
 * be tested exhaustively and cheaply.
 *
 * The hard cap of two follow-ups is ALSO enforced by a database constraint
 * (migration 0007). This module decides what *should* happen; the constraint
 * guarantees what *can* happen even if this logic is wrong or bypassed.
 */

export const MAX_FOLLOW_UPS = 2;
/** A lead is "inactive" after this long with no activity. */
export const DEFAULT_INACTIVE_HOURS = 24;
/** Nothing goes out between these hours, local to the business. */
export const QUIET_START_HOUR = 21;
export const QUIET_END_HOUR = 8;

export interface FollowUpCandidate {
  leadId: string;
  /** ISO timestamp of the last activity on this lead. */
  lastActivityAt: string;
  /** How many follow-ups have already been sent (0, 1 or 2). */
  followUpsSent: number;
  /** True when the customer asked not to be contacted. */
  optedOut: boolean;
  /** True when the lead is already won or lost. */
  closed: boolean;
}

export type NotDueReason =
  | "opted_out"
  | "closed"
  | "limit_reached"
  | "still_active";

export type Eligibility =
  | { due: true; followUpNumber: 1 | 2 }
  | { due: false; reason: NotDueReason };

/** Whether `hour` (0–23, business-local) falls inside quiet hours. */
export function isQuietHour(hour: number): boolean {
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

/**
 * The hour of `when` in a given IANA timezone. Falls back to UTC for an
 * unknown timezone rather than throwing — a bad timezone setting should not
 * stop the scheduler, and quiet hours still apply.
 */
export function hourInTimezone(when: Date, timeZone: string): number {
  try {
    const formatted = new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hour12: false,
      timeZone,
    }).format(when);
    const hour = Number(formatted);
    return Number.isFinite(hour) ? hour % 24 : when.getUTCHours();
  } catch {
    return when.getUTCHours();
  }
}

/** Decide whether a follow-up is due for a lead, and which one it would be. */
export function evaluateCandidate(
  candidate: FollowUpCandidate,
  now: Date,
  inactiveHours: number = DEFAULT_INACTIVE_HOURS,
): Eligibility {
  if (candidate.optedOut) return { due: false, reason: "opted_out" };
  if (candidate.closed) return { due: false, reason: "closed" };
  if (candidate.followUpsSent >= MAX_FOLLOW_UPS) {
    return { due: false, reason: "limit_reached" };
  }

  const lastActivity = new Date(candidate.lastActivityAt).getTime();
  const elapsedHours = (now.getTime() - lastActivity) / 3_600_000;
  if (!Number.isFinite(elapsedHours) || elapsedHours < inactiveHours) {
    return { due: false, reason: "still_active" };
  }

  return { due: true, followUpNumber: (candidate.followUpsSent + 1) as 1 | 2 };
}

/**
 * When to send, given quiet hours. Inside quiet hours the send is pushed to
 * the next morning in the business's timezone rather than dropped.
 */
export function scheduleTime(now: Date, timeZone: string): Date {
  const hour = hourInTimezone(now, timeZone);
  if (!isQuietHour(hour)) return now;

  // Hours until QUIET_END_HOUR local time.
  const hoursUntilMorning =
    hour >= QUIET_START_HOUR
      ? 24 - hour + QUIET_END_HOUR
      : QUIET_END_HOUR - hour;

  return new Date(now.getTime() + hoursUntilMorning * 3_600_000);
}
