import { z } from "zod";
import { PASSWORD_MIN } from "@/features/auth/schemas";

export const ACCOUNT_TABS = ["trips", "favorites", "profile"] as const;
export type AccountTab = (typeof ACCOUNT_TABS)[number];
export const accountTabSchema = z.enum(ACCOUNT_TABS).catch("trips");

export const cancelTripSchema = z.object({ bookingId: z.uuid() });

const name = (label: string, required: boolean) => {
  const base = z.string({ error: `Вкажіть ${label}` }).trim().max(50, { error: "До 50 символів" });
  return required ? base.min(1, { error: `Вкажіть ${label}` }) : base;
};

export const AI_LANGUAGES = ["auto", "uk", "en"] as const;

export const profileSchema = z.object({
  firstName: name("ім'я", true),
  lastName: name("прізвище", false).optional().default(""),
  phone: z
    .string()
    .optional()
    .default("")
    .transform((v) => v.replace(/[\s\-().]/g, ""))
    .refine((v) => v === "" || /^\+?[0-9]{7,15}$/.test(v), { error: "Вкажіть номер у форматі +380XXXXXXXXX" }),
  aiLanguage: z.enum(AI_LANGUAGES, { error: "Оберіть мову" }),
});

const newPassword = z
  .string({ error: "Вкажіть новий пароль" })
  .min(PASSWORD_MIN, { error: `Пароль має містити щонайменше ${PASSWORD_MIN} символів` })
  .max(72, { error: "Пароль задовгий (до 72 символів)" });

const currentPassword = z.string({ error: "Вкажіть поточний пароль" }).min(1, { error: "Вкажіть поточний пароль" }).max(72);

export const passwordSchema = z
  .object({ currentPassword, newPassword, confirm: z.string({ error: "Повторіть пароль" }) })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ["newPassword"], error: "Новий пароль має відрізнятися від поточного" })
  .refine((v) => v.confirm === v.newPassword, { path: ["confirm"], error: "Паролі не збігаються" });

export const DELETE_WORD = "ВИДАЛИТИ";
export const deleteAccountSchema = z.object({
  currentPassword,
  confirm: z.string().trim().refine((v) => v === DELETE_WORD, { error: `Введіть ${DELETE_WORD}` }),
});
