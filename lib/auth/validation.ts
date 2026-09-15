/**
 * Pure validation for auth credentials. External input is untrusted, so it is
 * validated server-side before any Supabase call.
 */

export interface Credentials {
  email: string;
  password: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MIN_PASSWORD_LENGTH = 8;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

type ParseResult =
  | { ok: true; data: Credentials }
  | { ok: false; error: string };

/** Validate and normalize an email/password pair from untrusted form input. */
export function parseCredentials(input: {
  email: unknown;
  password: unknown;
}): ParseResult {
  const email = typeof input.email === "string" ? input.email.trim() : "";
  const password = typeof input.password === "string" ? input.password : "";

  if (!isValidEmail(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  const passwordError = validatePassword(password);
  if (passwordError) {
    return { ok: false, error: passwordError };
  }
  return { ok: true, data: { email, password } };
}

/** Validate and normalize a single email address from untrusted form input. */
export function parseEmail(
  input: unknown,
): { ok: true; email: string } | { ok: false; error: string } {
  const email = typeof input === "string" ? input.trim() : "";
  if (!isValidEmail(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  return { ok: true, email };
}
