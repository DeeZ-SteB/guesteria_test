"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { demoCredentials } from "@/server/env";
import { authErrorMessage } from "./errors";
import { fieldErrors, nextOnlySchema, signInSchema, signUpSchema } from "./schemas";

export type AuthFormState = {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string>;
  /** Echo back non-secret input so the form keeps it after a failed attempt. */
  values?: { email?: string; firstName?: string };
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

  redirect(parsed.data.next);
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const raw = formValues(formData);
  const parsed = signUpSchema.safeParse(raw);
  const values = { email: String(raw.email ?? ""), firstName: String(raw.firstName ?? "") };
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { first_name: parsed.data.firstName } },
  });
  if (error) return { error: authErrorMessage(error), values };

  // With email confirmation on, Supabase hides existing accounts behind a user with no identities.
  if (data.user && data.user.identities?.length === 0) {
    return { error: authErrorMessage({ code: "user_already_exists" }), values };
  }
  if (!data.session) {
    return { notice: "Перевірте пошту: ми надіслали лист для підтвердження email", values };
  }

  redirect(parsed.data.next);
}

export async function signInAsDemo(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const { next } = nextOnlySchema.parse(formValues(formData));
  const demo = demoCredentials();
  if (!demo) return { error: "Демо-доступ зараз недоступний" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(demo);
  if (error) return { error: "Демо-доступ зараз недоступний" };

  redirect(next);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
