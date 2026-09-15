/**
 * Customer messages and retrieved documents are untrusted input. They are data
 * the model may read, never instructions it may follow (docs/AI_AGENT.md,
 * docs/SECURITY.md).
 */

/** Strip delimiter lookalikes so content cannot forge a block boundary. */
function neutralize(content: string): string {
  return content.replace(/<\/?untrusted[^>]*>/gi, "[removed]");
}

/**
 * Wrap untrusted content in a labelled block. The system prompt tells the model
 * that anything inside such a block is reference data only.
 */
export function wrapUntrusted(label: string, content: string): string {
  const safeLabel = label.replace(/[^a-z0-9 _-]/gi, "");
  return [
    `<untrusted source="${safeLabel}">`,
    neutralize(content),
    "</untrusted>",
  ].join("\n");
}
