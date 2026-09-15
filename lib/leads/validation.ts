export interface LeadCaptureValues {
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  intent: string | null;
  notes: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Permissive on purpose: international formats vary and a customer typing a
// slightly odd number is better captured than dropped.
const PHONE_RE = /^[+()\-\s\d]{7,20}$/;

function trimmed(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (s.length === 0) return null;
  return s.slice(0, max);
}

type ParseResult =
  | { ok: true; data: LeadCaptureValues }
  | { ok: false; error: string };

/**
 * Validate lead details proposed by the model. A lead with no way to reach the
 * customer is not useful, so at least one of email/phone/name is required.
 */
export function parseLeadCapture(input: {
  contact_name?: unknown;
  contact_email?: unknown;
  contact_phone?: unknown;
  intent?: unknown;
  notes?: unknown;
}): ParseResult {
  const contactName = trimmed(input.contact_name, 120);
  const contactEmail = trimmed(input.contact_email, 200);
  const contactPhone = trimmed(input.contact_phone, 40);

  if (contactEmail && !EMAIL_RE.test(contactEmail)) {
    return { ok: false, error: "The email address is not valid." };
  }
  if (contactPhone && !PHONE_RE.test(contactPhone)) {
    return { ok: false, error: "The phone number is not valid." };
  }
  if (!contactName && !contactEmail && !contactPhone) {
    return {
      ok: false,
      error: "A lead needs at least a name, email or phone number.",
    };
  }

  return {
    ok: true,
    data: {
      contactName,
      contactEmail,
      contactPhone,
      intent: trimmed(input.intent, 200),
      notes: trimmed(input.notes, 2000),
    },
  };
}

export interface LeadUpdateValues {
  score: number | null;
  intent: string | null;
  notes: string | null;
}

type UpdateResult =
  | { ok: true; data: LeadUpdateValues }
  | { ok: false; error: string };

/**
 * Validate the editable lead fields. `score` is entered by the business, not
 * computed: there is no conversion history yet to tune an automatic score
 * against, and a made-up number would be worse than an honest blank.
 */
export function parseLeadUpdate(input: {
  score?: unknown;
  intent?: unknown;
  notes?: unknown;
}): UpdateResult {
  const rawScore = typeof input.score === "string" ? input.score.trim() : input.score;

  let score: number | null = null;
  if (rawScore !== "" && rawScore !== null && rawScore !== undefined) {
    const parsed = Number(rawScore);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
      return { ok: false, error: "Score must be a whole number between 0 and 100." };
    }
    score = parsed;
  }

  return {
    ok: true,
    data: {
      score,
      intent: trimmed(input.intent, 200),
      notes: trimmed(input.notes, 2000),
    },
  };
}
