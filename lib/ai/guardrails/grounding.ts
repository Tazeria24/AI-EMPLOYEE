/**
 * Grounded-claim checking.
 *
 * CLAUDE.md forbids inventing price, stock, discounts, delivery times, policy
 * or order status. A system prompt alone cannot enforce that, so every draft
 * reply is checked: any price or stock figure it states must also appear in the
 * tool results from this turn. Anything else is treated as unverified and the
 * reply is withheld in favour of a human handoff.
 *
 * This is deliberately narrow — it targets the numeric claims that cause real
 * customer harm, rather than flagging every number (a reply may legitimately
 * say "2 working days" when that text came from a knowledge chunk).
 */

export interface GroundingViolation {
  kind: "price" | "stock";
  claim: string;
  value: string;
}

export interface GroundingResult {
  ok: boolean;
  violations: GroundingViolation[];
}

/** "₦12,500.00" / "NGN 12500" / "12,500 naira" */
const PRICE_PATTERNS: RegExp[] = [
  /(?:₦|\bNGN\b|\bUSD\b|\$)\s*([\d][\d,]*(?:\.\d{1,2})?)/gi,
  /\b([\d][\d,]*(?:\.\d{1,2})?)\s*(?:naira|dollars?)\b/gi,
  /\b(?:price|costs?|priced at|sells? for)\D{0,12}?([\d][\d,]*(?:\.\d{1,2})?)/gi,
];

/** "3 in stock" / "5 units" / "we have 7 left" */
const STOCK_PATTERNS: RegExp[] = [
  /\b([\d][\d,]*)\s*(?:units?|pieces?|items?)\b/gi,
  /\b([\d][\d,]*)\s*(?:in stock|left|remaining|available)\b/gi,
  /\b(?:stock|quantity|we have)\D{0,12}?([\d][\d,]*)\b/gi,
];

/** Normalize a numeric token for comparison: strip separators, drop .00 */
function normalizeNumber(raw: string): string {
  const cleaned = raw.replace(/,/g, "");
  const asNumber = Number(cleaned);
  if (!Number.isFinite(asNumber)) return cleaned;
  return String(asNumber);
}

/** Every number appearing anywhere in the evidence, normalized. */
function evidenceNumbers(evidence: string): Set<string> {
  const found = new Set<string>();
  for (const match of evidence.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    found.add(normalizeNumber(match[0]));
  }
  return found;
}

function collect(
  reply: string,
  patterns: RegExp[],
  kind: GroundingViolation["kind"],
  allowed: Set<string>,
  violations: GroundingViolation[],
): void {
  for (const pattern of patterns) {
    // Patterns are module-level and carry /g, so reset before each use.
    pattern.lastIndex = 0;
    for (const match of reply.matchAll(pattern)) {
      const value = normalizeNumber(match[1]);
      if (!allowed.has(value)) {
        violations.push({ kind, claim: match[0].trim(), value });
      }
    }
  }
}

/**
 * Check a draft reply against the evidence gathered this turn.
 * `evidence` is the concatenated text of every tool result.
 */
export function checkGrounding(reply: string, evidence: string): GroundingResult {
  const allowed = evidenceNumbers(evidence);
  const violations: GroundingViolation[] = [];

  collect(reply, PRICE_PATTERNS, "price", allowed, violations);
  collect(reply, STOCK_PATTERNS, "stock", allowed, violations);

  // De-duplicate identical claims found by overlapping patterns.
  const seen = new Set<string>();
  const unique = violations.filter((violation) => {
    const key = `${violation.kind}:${violation.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { ok: unique.length === 0, violations: unique };
}

/** Shown instead of an ungrounded reply. Never guesses on the customer's behalf. */
export const UNGROUNDED_FALLBACK =
  "I don't want to give you the wrong details on that, so let me get a colleague to confirm. Could you share the best way to reach you?";
