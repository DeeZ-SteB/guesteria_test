import { Star } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatRating, ratingLabel } from "@/lib/rating";
import { pluralUk, reviewsLabel } from "@/lib/format";

export function RatingBadge({ rating, className }: { rating: number; className?: string }) {
  return (
    <span
      className={cn("inline-grid min-w-9 place-items-center rounded-lg rounded-bl-none bg-primary px-1.5 py-1 text-sm font-bold text-on-primary", className)}
    >
      {formatRating(rating)}
    </span>
  );
}

/** Badge + verbal label + reviews count. Renders nothing useful-looking when there is no rating. */
export function RatingSummary({ rating, reviewCount, align = "left" }: { rating: number | null; reviewCount: number; align?: "left" | "right" }) {
  if (rating == null) return <p className="text-xs text-muted">Ще немає оцінок</p>;
  return (
    <div className={cn("flex items-center gap-2", align === "right" && "flex-row-reverse text-right")}>
      <RatingBadge rating={rating} />
      <div className="leading-tight">
        <p className="text-sm font-semibold">{ratingLabel(rating)}</p>
        {reviewCount > 0 && <p className="text-xs text-muted">{reviewsLabel(reviewCount)}</p>}
      </div>
    </div>
  );
}

export function Stars({ count, className }: { count: number | null; className?: string }) {
  if (!count) return null;
  const n = Math.round(count);
  return (
    <span className={cn("inline-flex text-accent", className)} role="img" aria-label={`${n} ${pluralUk(n, ["зірка", "зірки", "зірок"])}`}>
      {Array.from({ length: n }, (_, i) => (
        <Star key={i} className="size-3.5 fill-current" aria-hidden />
      ))}
    </span>
  );
}
