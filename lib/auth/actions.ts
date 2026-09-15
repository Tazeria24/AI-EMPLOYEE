"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site-url";
import { parseCredentials, parseEmail, validatePassword } from "@/lib/auth/validation";
import {
  bucketKey,
  clientIp,
  consumeRateLimit,
  type RateLimitName,
} from "@/lib/security/rate-limit";
import { recordSecurityEvent } from "@/lib/security/events";
import type { SupabaseClient } from "@supabase/supabase-js";

function encode(message: string): string {
  return encodeURIComponent(message);
}

const TOO_MANY =
  "Too many attempts. Please wait a few minutes and try again.";

/**
 * Consume a rate limit for an unauthenticated action, and record the refusal.
 *
 * The auth routes are the ones an attacker can reach without an account, so
 * they are where password guessing happens (docs/SECURITY.md has required
 * limits here since Milestone 00; there were none until this milestone).
 */
async function allowAttempt(
  supabase: SupabaseClient,
  name: RateLimitName,
  subject: string,
): Promise<boolean> {
  const allowed = await consumeRateLimit(supabase, name, subject);
  if (!allowed) {
    await recordSecurityEvent(supabase, {
      eventType: "rate_limited",
      severity: "warning",
      // Hashed: the log records that someone was throttled, never who.
      subjectHash: bucketKey(name, subject),
      metadata: { limit: name },
    });
  }
  return allowed;
}

/** Sign in with email + password. */
export async function signIn(formData: FormData): Promise<void> {
  const parsed = parseCredentials({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.ok) {
    redirect(`/login?error=${encode(parsed.error)}`);
  }

  const redirectTo = formData.get("redirect");
  const destination =
    typeof redirectTo === "string" && redirectTo.startsWith("/")
      ? redirectTo
      : "/dashboard";

  const supabase = await createClient();

  // Two limits, because they stop different attacks: per email stops guessing
  // one account's password, per IP stops spraying one password at many
  // accounts. The IP is attacker-controlled, so it is a speed bump, not a wall.
  const ip = clientIp(await headers());
  if (
    !(await allowAttempt(supabase, "signIn", parsed.data.email)) ||
    !(await allowAttempt(supabase, "signInPerIp", ip))
  ) {
    redirect(`/login?error=${encode(TOO_MANY)}`);
  }

  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    await recordSecurityEvent(supabase, {
      eventType: "sign_in_failed",
      severity: "info",
      subjectHash: bucketKey("signIn", parsed.data.email),
    });
    // Deliberately identical for a wrong password and an unknown account.
    redirect(`/login?error=${encode("Invalid email or password.")}`);
  }

  revalidatePath("/", "layout");
  redirect(destination);
}

/** Register a new user; sends a verification email. */
export async function signUp(formData: FormData): Promise<void> {
  const parsed = parseCredentials({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.ok) {
    redirect(`/signup?error=${encode(parsed.error)}`);
  }

  const origin = await getSiteOrigin();
  const supabase = await createClient();

  if (!(await allowAttempt(supabase, "signUp", clientIp(await headers())))) {
    redirect(`/signup?error=${encode(TOO_MANY)}`);
  }

  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${origin}/auth/confirm?next=/dashboard`,
    },
  });
  if (error) {
    redirect(`/signup?error=${encode(error.message)}`);
  }

  redirect(
    `/login?message=${encode("Check your email to verify your account.")}`,
  );
}

/** Sign out the current user. */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

/** Send a password-reset email. */
export async function requestPasswordReset(formData: FormData): Promise<void> {
  const parsed = parseEmail(formData.get("email"));
  if (!parsed.ok) {
    redirect(`/forgot-password?error=${encode(parsed.error)}`);
  }

  const origin = await getSiteOrigin();
  const supabase = await createClient();

  // Unthrottled, this endpoint is a way to send someone else a lot of email.
  // The response below is identical either way, so a throttled attacker
  // cannot use it to discover which addresses are registered.
  if (await allowAttempt(supabase, "passwordReset", parsed.email)) {
    // Errors are intentionally not surfaced to avoid leaking which emails exist.
    await supabase.auth.resetPasswordForEmail(parsed.email, {
      redirectTo: `${origin}/auth/confirm?next=/reset-password`,
    });
  }

  redirect(
    `/forgot-password?message=${encode(
      "If that email is registered, a reset link is on its way.",
    )}`,
  );
}

/** Set a new password for the user in the current (recovery) session. */
export async function updatePassword(formData: FormData): Promise<void> {
  const password = formData.get("password");
  const passwordError = validatePassword(
    typeof password === "string" ? password : "",
  );
  if (passwordError) {
    redirect(`/reset-password?error=${encode(passwordError)}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: password as string,
  });
  if (error) {
    redirect(`/reset-password?error=${encode(error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect(`/dashboard?message=${encode("Your password has been updated.")}`);
}
