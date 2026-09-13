"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site-url";
import { parseCredentials, parseEmail, validatePassword } from "@/lib/auth/validation";

function encode(message: string): string {
  return encodeURIComponent(message);
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
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
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
  // Errors are intentionally not surfaced to avoid leaking which emails exist.
  await supabase.auth.resetPasswordForEmail(parsed.email, {
    redirectTo: `${origin}/auth/confirm?next=/reset-password`,
  });

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
