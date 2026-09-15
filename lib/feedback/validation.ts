export const FEEDBACK_KINDS = ["problem", "bug", "idea", "general"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const MAX_FEEDBACK_LENGTH = 4000;

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface FeedbackInput {
  kind: FeedbackKind;
  message: string;
  page: string | null;
}

export function isFeedbackKind(value: unknown): value is FeedbackKind {
  return (
    typeof value === "string" && (FEEDBACK_KINDS as readonly string[]).includes(value)
  );
}

/**
 * Validate a feedback submission.
 *
 * `page` is kept because "the leads list is slow" is a different report from
 * "the app is slow", but it is bounded and must be an in-app path — a free
 * text field that ends up rendered elsewhere is not somewhere to accept a URL.
 */
export function parseFeedback(input: Record<string, unknown>): ParseResult<FeedbackInput> {
  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (message.length === 0) {
    return { ok: false, error: "Tell us what happened first." };
  }
  if (message.length > MAX_FEEDBACK_LENGTH) {
    return { ok: false, error: "That message is too long." };
  }

  const kind = isFeedbackKind(input.kind) ? input.kind : "general";

  const rawPage = typeof input.page === "string" ? input.page.trim() : "";
  const page =
    rawPage.startsWith("/") && rawPage.length <= 200 && !rawPage.includes("//")
      ? rawPage
      : null;

  return { ok: true, data: { kind, message, page } };
}
