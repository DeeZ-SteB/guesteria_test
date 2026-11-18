import { z } from "zod";
import { findCity } from "@/lib/cities";
import { isAllowedImageUrl } from "@/lib/hotels/images";

export const favoriteInputSchema = z.object({
  hotelId: z.string().regex(/^[a-z0-9]{3,32}$/i),
  hotelName: z.string().trim().min(1).max(200),
  // Anything but our image host is dropped rather than stored.
  hotelImage: z
    .string()
    .max(500)
    .nullable()
    .transform((url) => (isAllowedImageUrl(url) ? url : null)),
  cityId: z.string().refine((id) => !!findCity(id)),
  favorite: z.boolean(),
});

export type FavoriteInput = z.input<typeof favoriteInputSchema>;
