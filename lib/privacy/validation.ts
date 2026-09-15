export const MIN_RETENTION_DAYS = 30;
export const MAX_RETENTION_DAYS = 3650;

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Retention period, in days.
 *
 * Bounded on both sides, and the same bounds the database check constraint
 * enforces: below a month the business loses its own conversation history, and
 * "forever" is not a retention policy — NDPR expects a stated limit.
 */
export function parseRetentionDays(value: unknown): ParseResult<number> {
  const days = Number(typeof value === "string" ? value.trim() : value);
  if (!Number.isInteger(days) || days < MIN_RETENTION_DAYS || days > MAX_RETENTION_DAYS) {
    return {
      ok: false,
      error: `Keep conversations for between ${MIN_RETENTION_DAYS} and ${MAX_RETENTION_DAYS} days.`,
    };
  }
  return { ok: true, data: days };
}

/**
 * Deleting every customer record is irreversible, so it takes a typed
 * confirmation rather than one click.
 */
export function isDeletionConfirmed(value: unknown): boolean {
  return typeof value === "string" && value.trim().toUpperCase() === "DELETE";
}
