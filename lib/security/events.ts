import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";

export type SecuritySeverity = "info" | "warning" | "critical";

/**
 * Record a security-relevant event: escalations, takeovers, auth failures,
 * rejected webhooks, data deletion.
 *
 * `subject` is hashed by the database call site before storage — the log and
 * the table both record that something happened to someone, never who.
 * Failures here are swallowed: an audit write must not break the operation it
 * is auditing.
 */
export async function recordSecurityEvent(
  client: SupabaseClient,
  params: {
    eventType: string;
    severity?: SecuritySeverity;
    organizationId?: string | null;
    userId?: string | null;
    subjectHash?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  logger.info({
    event: `security.${params.eventType}`,
    organizationId: params.organizationId ?? undefined,
    severity: params.severity ?? "info",
    ...params.metadata,
  });

  try {
    await client.rpc("record_security_event", {
      p_event_type: params.eventType,
      p_severity: params.severity ?? "info",
      p_organization_id: params.organizationId ?? null,
      p_user_id: params.userId ?? null,
      p_subject_hash: params.subjectHash ?? null,
      p_metadata: params.metadata ?? null,
    });
  } catch {
    logger.warn({ event: "security_event_write_failed", eventType: params.eventType });
  }
}
