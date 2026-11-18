import { getReviews } from "@/server/liteapi";
import type { Review } from "@/lib/hotels/types";
import { ReviewsView } from "./reviews-view";

export async function ReviewsSection({ hotelId, rating, reviewCount }: { hotelId: string; rating: number | null; reviewCount: number }) {
  let reviews: Review[] | null;
  try {
    reviews = await getReviews(hotelId);
  } catch {
    reviews = null; // quiet: reviews are secondary, the page stays usable
  }
  return <ReviewsView reviews={reviews} rating={rating} reviewCount={reviewCount} />;
}
