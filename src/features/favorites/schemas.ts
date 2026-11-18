import { z } from "zod";
import { findCity } from "@/lib/cities";
import { isAllowedImageUrl } from "@/lib/hotels/images";

export const favoriteInputSchema = z.object({
  hotelId: z.string().regex(/^[a-z0-9]{3,32}$/i),
  // Some supplier names are long: keep the first 200 chars instead of failing the save.
  hotelName: z
    .string()
    .trim()
    .min(1)
    .transform((name) => name.slice(0, 200)),
  // Anything but our image host is dropped rather than stored.
  hotelImage: z
    .string()
    .max(500)
    .nullable()
    .transform((url) => (isAllowedImageUrl(url) ? url : null)),
  // Null for hotels outside our city list (e.g. opened from a shared link).
  cityId: z.string().refine((id) => !!findCity(id)).nullable(),
  favorite: z.boolean(),
});

export type FavoriteInput = z.input<typeof favoriteInputSchema>;
