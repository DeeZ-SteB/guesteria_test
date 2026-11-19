import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./auth";

/**
 * Which of these hotels the current user has saved. Runs as the user (RLS), so it can only
 * ever see their own rows. Signed-out or failing → [] (hearts just show as empty).
 */
export async function getFavoriteHotelIds(hotelIds: string[]): Promise<string[]> {
  if (hotelIds.length === 0) return [];
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("favorites").select("hotel_id").in("hotel_id", hotelIds);
  if (error) {
    console.error("[favorites] read failed", error.code);
    return [];
  }
  return data.map((row) => row.hotel_id as string);
}

export type SavedHotel = { hotelId: string; hotelName: string; hotelImage: string | null; cityId: string | null };

/** The signed-in user's saved hotels, newest first (RLS; the DB caps them at 500). Throws on failure. */
export async function listOwnFavorites(): Promise<SavedHotel[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("favorites")
    .select("hotel_id, hotel_name, hotel_image, city")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`favorites list failed (${error.code})`);
  return data.map((r) => ({ hotelId: r.hotel_id as string, hotelName: r.hotel_name as string, hotelImage: (r.hotel_image as string | null) ?? null, cityId: (r.city as string | null) ?? null }));
}
