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
