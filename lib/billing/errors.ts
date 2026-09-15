/**
 * SQLSTATE raised by the plan-limit triggers in migration 0010.
 *
 * The limits are enforced in the database so they hold for every write path.
 * This lets a server action recognise that particular refusal and show the
 * business a useful message — "you are at your plan's limit" — instead of a
 * generic failure.
 */
export const PLAN_LIMIT_SQLSTATE = "PLIM1";

export interface PostgrestLikeError {
  code?: string | null;
  message?: string | null;
}

export function isPlanLimitError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as PostgrestLikeError).code === PLAN_LIMIT_SQLSTATE
  );
}

/**
 * The database raises a message already written for the business
 * ("Your starter plan allows 100 products. Upgrade to add more."), so it is
 * passed through rather than replaced with something vaguer.
 */
export function planLimitMessage(error: unknown, fallback: string): string {
  if (!isPlanLimitError(error)) return fallback;
  const message = (error as PostgrestLikeError).message;
  return message && message.length > 0 ? message : fallback;
}
