"use server";

import { redirect } from "next/navigation";
import { forgetRoomRates, hotelIdSchema } from "@/server/liteapi";
import { isHotelHref } from "@/lib/search/params";

/**
 * "Back to the hotel" after a rate turned out to be gone or stale: drops the hotel's cached rates
 * first, so the hotel page shows fresh offers instead of the dead one again. Only redirects to the
 * hotel's own page (no open redirect).
 */
export async function backToHotel(hotelId: string, href: string): Promise<never> {
  const id = hotelIdSchema.safeParse(hotelId);
  if (!id.success) redirect("/");
  forgetRoomRates(id.data);
  redirect(isHotelHref(id.data, href) ? href : `/hotels/${id.data}`);
}

