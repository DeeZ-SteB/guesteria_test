"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { demoCredentials } from "@/server/env";
import { authErrorMessage } from "./errors";
import { fieldErrors, nextOnlySchema, signInSchema, signUpSchema } from "./schemas";
import { emailSafeReturnPath } from "@/lib/return-to";

export type AuthFormState = {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string>;
  /** Echo back non-secret input so the form keeps it after a failed attempt. */
  values?: { email?: string; firstName?: string };
  /**
   * Set on success. The client closes the modal and navigates there itself:
   * the modal lives in the root layout, which a server redirect would not reset.
   */
  redirectTo?: string;
};

function formValues(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const raw = formValues(formData);
  const parsed = signInSchema.safeParse(raw);
  const values = { email: String(raw.email ?? "") };
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) return { error: authErrorMessage(error), values };

  return { redirectTo: parsed.data.next };
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const raw = formValues(formData);
  const parsed = signUpSchema.safeParse(raw);
  const values = { email: String(raw.email ?? ""), firstName: String(raw.firstName ?? "") };
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  // Where the confirmation email link lands when confirmations are on (Supabase Cloud).
  // Supabase only accepts URLs from the project's redirect allow-list.
  const origin = (await headers()).get("origin");
  const emailRedirectTo = origin
    ? `${origin}/auth/confirm?next=${encodeURIComponent(emailSafeReturnPath(parsed.data.next))}`
    : undefined;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { first_name: parsed.data.firstName }, emailRedirectTo },
  });
  if (error) return { error: authErrorMessage(error), values };

  // Accepted risk (see docs/AI_LOG.md): we tell the visitor the email is taken, which
  // reveals that an account exists. Supabase hides this behind a user with no identities.
  if (data.user && data.user.identities?.length === 0) {
    return { error: authErrorMessage({ code: "user_already_exists" }), values };
  }
  if (!data.session) {
    return { notice: "Перевірте пошту: ми надіслали лист для підтвердження email", values };
  }

  return { redirectTo: parsed.data.next };
}

export async function signInAsDemo(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const { next } = nextOnlySchema.parse(formValues(formData));
  const demo = demoCredentials();
  if (!demo) return { error: "Демо-доступ зараз недоступний" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(demo);
  if (error) return { error: "Демо-доступ зараз недоступний" };

  return { redirectTo: next };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  // Local scope: the demo account is shared, so a global sign-out would log out every reviewer.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/");
}
