/**
 * Meta's 24-hour customer service window.
 *
 * A business may send free-form text only within 24 hours of the customer's
 * last inbound message. Outside it, Meta rejects free-form sends and requires
 * a pre-approved template — which needs per-business approval and is billed
 * separately, so this milestone does not send them (see the ADR).
 *
 * The rule lives here, pure, so it is exhaustively testable without a clock or
 * a network call, and so the refusal is a deliberate decision rather than an
 * error we discover from Meta's response.
 */
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWithinServiceWindow(
  lastInboundAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!lastInboundAt) return false;

  const last =
    lastInboundAt instanceof Date ? lastInboundAt : new Date(lastInboundAt);
  const elapsed = now.getTime() - last.getTime();
  if (!Number.isFinite(elapsed)) return false;

  // A timestamp in the future means clock skew, not an open window.
  if (elapsed < 0) return false;
  return elapsed < SERVICE_WINDOW_MS;
}

/** Milliseconds until the window closes, or 0 if it already has. */
export function serviceWindowRemainingMs(
  lastInboundAt: Date | string | null | undefined,
  now: Date = new Date(),
): number {
  if (!isWithinServiceWindow(lastInboundAt, now)) return 0;
  const last =
    lastInboundAt instanceof Date ? lastInboundAt : new Date(lastInboundAt!);
  return SERVICE_WINDOW_MS - (now.getTime() - last.getTime());
}
