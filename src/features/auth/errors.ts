const MESSAGES: Record<string, string> = {
  invalid_credentials: "Невірний email або пароль",
  user_already_exists: "Такий email уже зареєстровано",
  email_exists: "Такий email уже зареєстровано",
  weak_password: "Пароль надто простий. Спробуйте довший або складніший",
  over_request_rate_limit: "Забагато спроб. Зачекайте хвилину й спробуйте ще",
  over_email_send_rate_limit: "Забагато спроб. Зачекайте хвилину й спробуйте ще",
  email_not_confirmed: "Підтвердьте email: ми надіслали лист із посиланням",
  user_banned: "Цей акаунт заблоковано",
};

export const GENERIC_AUTH_ERROR = "Щось пішло не так. Спробуйте ще";

/** Maps a Supabase auth error to user-facing Ukrainian copy. Never leaks raw server messages. */
export function authErrorMessage(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
  return (code && MESSAGES[code]) || GENERIC_AUTH_ERROR;
}
