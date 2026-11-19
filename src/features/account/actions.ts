"use server";

import { refresh } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { verifiedUser } from "@/server/auth";
import { getOwnBooking, hasActiveTrips, markCancelled } from "@/server/bookings";
import { cancelBookingAtLiteApi, getLiteApiBookingStatus } from "@/server/liteapi";
import { deleteUserAccount } from "@/server/users";
import { hit } from "@/server/rate-limit";
import { cancelEligibility, type CancelBlock } from "@/lib/booking/trips";
import { todayInKyiv } from "@/lib/booking/stay";
import { fieldErrors } from "@/features/auth/schemas";
import { cancelTripSchema, deleteAccountSchema, passwordSchema, profileSchema } from "./schemas";

// ---------------------------------------------------------------- cancellation

export type CancelTripResult =
  | { ok: true; state: "cancelled" | "already_cancelled" | "cancelled_with_charges" }
  | { ok: false; reason: "invalid" | "session" | "not_found" | "retry" | "rate_limited" | CancelBlock | "liteapi_failed" | "unknown_outcome" | "save_failed" };

/**
 * Free cancellation of the user's own booking. Ownership is checked against our table before
 * LiteAPI is called; eligibility is re-checked here whatever the UI showed. Any LiteAPI error is
 * reconciled by reading the booking back, so a retry is always safe.
 */
export async function cancelTrip(input: { bookingId: string }): Promise<CancelTripResult> {
  const parsed = cancelTripSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const auth = await verifiedUser();
  if (auth.status !== "ok") return { ok: false, reason: "session" };
  const userId = auth.user.id;
  if (!(await hit("cancelUser", userId)).allowed) return { ok: false, reason: "rate_limited" };

  let booking: Awaited<ReturnType<typeof getOwnBooking>>;
  try {
    booking = await getOwnBooking(userId, parsed.data.bookingId);
  } catch {
    return { ok: false, reason: "retry" };
  }
  if (!booking) return { ok: false, reason: "not_found" }; // also for other users' ids
  if (booking.status === "cancelled") return { ok: true, state: "already_cancelled" };

  const eligible = cancelEligibility(
    {
      status: booking.status,
      checkIn: booking.check_in,
      refundable: booking.refundable,
      refundableUntil: booking.refundable_until,
      hasLiteApiId: booking.liteapi_booking_id !== null,
    },
    new Date(),
  );
  if (!eligible.ok) return { ok: false, reason: eligible.reason };
  const liteapiId = booking.liteapi_booking_id as string;

  let cancelled = false;
  let charged = false;
  try {
    const outcome = await cancelBookingAtLiteApi(liteapiId);
    // Should not happen inside the free window (clock skew, hotel-side deadline). No amounts in logs.
    charged = outcome.charged;
    if (charged) console.error(`[cancel] booking ${booking.id} cancelled with charges`);
    cancelled = true;
  } catch {
    // Timeout, double submit, LiteAPI hiccup: ask LiteAPI what is true now.
    try {
      const status = await getLiteApiBookingStatus(liteapiId);
      if (status === "cancelled") cancelled = true;
      else if (status === "confirmed") return { ok: false, reason: "liteapi_failed" };
      else return { ok: false, reason: "unknown_outcome" };
    } catch {
      return { ok: false, reason: "unknown_outcome" };
    }
  }

  if (cancelled) {
    try {
      await markCancelled(userId, booking.id);
    } catch {
      console.error(`[cancel] booking ${booking.id} cancelled at LiteAPI but not saved`);
      return { ok: false, reason: "save_failed" };
    }
  }
  refresh();
  return { ok: true, state: charged ? "cancelled_with_charges" : "cancelled" };
}

// ---------------------------------------------------------------- profile

export type AccountFormState = {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

const DEMO_LOCKED = "Це спільний демо-акаунт: профіль, пароль і видалення вимкнено.";

const str = (formData: FormData, key: string) => {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
};

export async function updateProfile(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const values = { firstName: str(formData, "firstName"), lastName: str(formData, "lastName"), phone: str(formData, "phone"), aiLanguage: str(formData, "aiLanguage") };
  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const auth = await verifiedUser();
  if (auth.status !== "ok") return { error: "Сесія завершилась. Увійдіть знову.", values };
  if (auth.isDemo) return { error: DEMO_LOCKED, values };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    data: { first_name: parsed.data.firstName, last_name: parsed.data.lastName, phone: parsed.data.phone, ai_language: parsed.data.aiLanguage },
  });
  if (error) return { error: "Не вдалося зберегти. Спробуйте ще раз.", values };
  // The header reads names from JWT claims: issue a fresh token so they update now, not in an hour.
  await supabase.auth.refreshSession();
  refresh();
  return { notice: "Збережено", values: { ...values, phone: parsed.data.phone } };
}

const MAX_PASSWORD_FAILURES = 5; // per 15 minutes, counted in the database per user

/**
 * Proves the person at the keyboard knows the password (also refreshes the session for
 * secure_password_change). Failures are counted per user; after the limit we stop asking Supabase
 * at all, so a hijacked session cannot guess and cannot exhaust the shared per-IP sign-in limit.
 * Fails closed if the counter is unavailable.
 */
async function checkPassword(email: string, userId: string, password: string): Promise<"ok" | "wrong" | "locked"> {
  const supabase = await createClient();
  const recent = await supabase.rpc("recent_password_failures");
  if (recent.error || typeof recent.data !== "number" || recent.data >= MAX_PASSWORD_FAILURES) return "locked";
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error && data.user?.id === userId) return "ok";
  await supabase.rpc("record_password_failure");
  return "wrong";
}

function passwordProblem(result: "wrong" | "locked"): AccountFormState {
  return result === "locked"
    ? { error: "Забагато спроб. Спробуйте за 15 хвилин." }
    : { fieldErrors: { currentPassword: "Невірний поточний пароль" } };
}

export async function changePassword(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const parsed = passwordSchema.safeParse({
    currentPassword: str(formData, "currentPassword"),
    newPassword: str(formData, "newPassword"),
    confirm: str(formData, "confirm"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const auth = await verifiedUser();
  if (auth.status !== "ok") return { error: "Сесія завершилась. Увійдіть знову." };
  if (auth.isDemo) return { error: DEMO_LOCKED };
  const password = await checkPassword(auth.user.email, auth.user.id, parsed.data.currentPassword);
  if (password !== "ok") return passwordProblem(password);

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
  if (error) return { error: error.code === "weak_password" ? "Пароль надто простий" : "Не вдалося змінити пароль. Спробуйте ще раз." };
  // Anyone else holding an old session is signed out.
  await supabase.auth.signOut({ scope: "others" });
  return { notice: "Пароль змінено. Інші пристрої вийшли з акаунта." };
}

export async function deleteAccount(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const parsed = deleteAccountSchema.safeParse({ currentPassword: str(formData, "currentPassword"), confirm: str(formData, "confirm") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const auth = await verifiedUser();
  if (auth.status !== "ok") return { error: "Сесія завершилась. Увійдіть знову." };
  if (auth.isDemo) return { error: DEMO_LOCKED };
  const password = await checkPassword(auth.user.email, auth.user.id, parsed.data.currentPassword);
  if (password !== "ok") return passwordProblem(password);

  // Deleting would cascade the booking row while the hotel booking stays live and ownerless.
  let active: Awaited<ReturnType<typeof hasActiveTrips>>;
  try {
    active = await hasActiveTrips(auth.user.id, todayInKyiv());
  } catch {
    return { error: "Не вдалося перевірити поїздки. Спробуйте ще раз." };
  }
  if (active === "pending") {
    // Opening it resolves the attempt (confirmed, or released once LiteAPI shows nothing).
    return { error: "Одне з бронювань ще обробляється. Відкрийте його в «Поїздках», щоб оновити статус, і спробуйте знову." };
  }
  if (active === "confirmed") return { error: "Спочатку скасуйте або завершіть майбутні поїздки — інакше бронювання залишиться в готелі без власника." };

  try {
    await deleteUserAccount(auth.user.id);
  } catch {
    return { error: "Не вдалося видалити акаунт. Спробуйте ще раз." };
  }
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  redirect("/", RedirectType.replace);
}
