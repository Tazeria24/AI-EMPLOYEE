import { logger } from "./logger";
import { redact, redactText } from "./redact";

export interface ErrorContext {
  event: string;
  organizationId?: string;
  [key: string]: unknown;
}

/**
 * Report an error somewhere a human will see it.
 *
 * It **always** writes a structured log line, and additionally posts to Sentry
 * when `SENTRY_DSN` is set. The log line is the part that is guaranteed to
 * work: hosts capture stdout, so "monitoring captures actionable errors" does
 * not depend on a third party being configured, reachable, or within quota.
 *
 * Sentry is reached over its HTTP store endpoint rather than through
 * `@sentry/nextjs`. That SDK brings a build plugin, instrumentation files and
 * a large dependency tree, for a single POST — and CLAUDE.md says not to
 * install dependencies without justification. The trade-off is real and worth
 * stating: no automatic breadcrumbs, no release tracking, no source maps.
 * Revisit if those turn out to matter in beta.
 */
export async function captureError(
  error: unknown,
  context: ErrorContext,
): Promise<void> {
  logger.error({ ...context, error });

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  try {
    await postToSentry(dsn, error, context);
  } catch {
    // Reporting must never be the thing that fails a request.
    logger.warn({ event: "sentry_report_failed", original: context.event });
  }
}

interface ParsedDsn {
  endpoint: string;
  publicKey: string;
}

/** A Sentry DSN is `https://<key>@<host>/<project>`. */
export function parseDsn(dsn: string): ParsedDsn | null {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, "");
    if (!url.username || !projectId) return null;
    return {
      endpoint: `${url.protocol}//${url.host}/api/${projectId}/store/`,
      publicKey: url.username,
    };
  } catch {
    return null;
  }
}

async function postToSentry(
  dsn: string,
  error: unknown,
  context: ErrorContext,
): Promise<void> {
  const parsed = parseDsn(dsn);
  if (!parsed) return;

  const normalized =
    error instanceof Error
      ? { type: error.name, value: redactText(error.message), stacktrace: error.stack }
      : { type: "Error", value: redactText(String(error)) };

  const body = {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: new Date().toISOString(),
    platform: "node",
    level: "error",
    logger: context.event,
    environment: process.env.NODE_ENV ?? "development",
    exception: {
      values: [
        {
          type: normalized.type,
          value: normalized.value,
          // Stack frames can carry query strings and argument values.
          ...(normalized.stacktrace
            ? { stacktrace: { frames: [] }, raw_stacktrace: redactText(normalized.stacktrace) }
            : {}),
        },
      ],
    },
    // The same redaction as the log line: an error report is not an exemption.
    extra: redact({ ...context, error: undefined }),
  };

  await fetch(parsed.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sentry-auth": [
        "Sentry sentry_version=7",
        "sentry_client=ai-sales-employee/1.0",
        `sentry_key=${parsed.publicKey}`,
      ].join(", "),
    },
    body: JSON.stringify(body),
    // Never let a slow reporter hold a request open.
    signal: AbortSignal.timeout(3000),
  });
}
