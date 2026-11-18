import { z } from "zod";
import { safeReturnTo } from "@/lib/return-to";

export const PASSWORD_MIN = 8;

const email = z
  .string({ error: "Вкажіть email" })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Вкажіть коректний email" }));

const next = z
  .unknown()
  .optional()
  .transform((value) => safeReturnTo(value));

export const signInSchema = z.object({
  email,
  password: z.string({ error: "Вкажіть пароль" }).min(1, { error: "Вкажіть пароль" }),
  next,
});

export const signUpSchema = z.object({
  firstName: z
    .string({ error: "Вкажіть ім'я" })
    .trim()
    .min(1, { error: "Вкажіть ім'я" })
    .max(50, { error: "Ім'я задовге (до 50 символів)" }),
  email,
  password: z
    .string({ error: "Вкажіть пароль" })
    .min(PASSWORD_MIN, { error: `Пароль має містити щонайменше ${PASSWORD_MIN} символів` })
    .max(72, { error: "Пароль задовгий (до 72 символів)" }),
  next,
});

export const nextOnlySchema = z.object({ next });

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;

/** First error message per field, in the shape the forms render. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    result[key] ??= issue.message;
  }
  return result;
}
