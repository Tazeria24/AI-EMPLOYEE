import { redact } from "./redact";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  /** What happened, as a stable machine-readable name. */
  event: string;
  /** Tenant, when there is one. Ids are safe; names and emails are not. */
  organizationId?: string;
  [key: string]: unknown;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function minimumLevel(): LogLevel {
  const configured = process.env.LOG_LEVEL;
  if (configured && configured in LEVEL_ORDER) return configured as LogLevel;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

/**
 * Structured JSON logging.
 *
 * One JSON object per line, because that is what every host's log viewer can
 * actually query — a human-formatted string is unsearchable the moment it
 * matters. Every field passes through `redact()` on the way out, so adding a
 * field to a log call can never be the thing that leaks a token.
 *
 * Deliberately not a dependency: this is a `console` call with a shape.
 */
export function log(level: LogLevel, fields: LogFields): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minimumLevel()]) return;

  const line = {
    level,
    time: new Date().toISOString(),
    ...(redact(fields) as Record<string, unknown>),
  };

  const serialized = safeStringify(line);
  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.log(serialized);
}

export const logger = {
  debug: (fields: LogFields) => log("debug", fields),
  info: (fields: LogFields) => log("info", fields),
  warn: (fields: LogFields) => log("warn", fields),
  error: (fields: LogFields) => log("error", fields),
};

/** Never let logging throw: a failed log must not take a request down. */
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ level: "error", event: "log_serialization_failed" });
  }
}
