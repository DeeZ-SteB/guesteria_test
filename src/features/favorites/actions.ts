"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/server/auth";
import { favoriteInputSchema, type FavoriteInput } from "./schemas";

export type SetFavoriteResult = { ok: true } | { ok: false; reason: "unauthenticated" | "invalid" | "failed" };

/**
 * Idempotent "set" (not "toggle"): double clicks, retries and queued actions converge
 * on the state the user last saw. Runs as the user, so RLS decides what may change.
 * No revalidation on purpose: it would re-render the page and call LiteAPI again.
 */
export async function setFavorite(input: FavoriteInput): Promise<SetFavoriteResult> {
  const parsed = favoriteInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "unauthenticated" };

  const { hotelId, hotelName, hotelImage, cityId, favorite } = parsed.data;
  const supabase = await createClient();
  const { error } = favorite
    ? await supabase
        .from("favorites")
        .insert({ hotel_id: hotelId, hotel_name: hotelName, hotel_image: hotelImage, city: cityId })
    : // RLS already scopes this to the user; the explicit filter is defence in depth.
      await supabase.from("favorites").delete().eq("hotel_id", hotelId).eq("user_id", user.id);

  // 23505 = already saved: the desired state already holds.
  if (error && error.code !== "23505") {
    console.error("[favorites] write failed", error.code);
    return { ok: false, reason: "failed" };
  }
  return { ok: true };
}
