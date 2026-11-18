"use client";

import { useState } from "react";
import type { Review } from "@/lib/hotels/types";
import { latestReviews, reviewLanguageLabel, reviewMonth } from "@/lib/hotels/page";
import { pluralUk } from "@/lib/format";
import { formatRating } from "@/lib/rating";
import { RatingSummary } from "@/components/ui/rating";
import { Sheet } from "@/components/ui/sheet";

const shortDate = reviewMonth;

function ReviewItem({ review }: { review: Review }) {
  const language = reviewLanguageLabel(review.language);
  return (
    <article className="rounded-button bg-bg p-3 text-sm">
      <header className="flex items-start justify-between gap-2">
        <p className="font-medium">
          {review.name}
          <span className="font-normal text-muted">
            {[review.country?.toUpperCase(), shortDate(review.date)].filter(Boolean).length > 0 &&
              ` · ${[review.country?.toUpperCase(), shortDate(review.date)].filter(Boolean).join(" · ")}`}
          </span>
        </p>
        {review.score != null && <span className="font-bold text-primary">{formatRating(review.score)}</span>}
      </header>
      {review.headline && <p className="mt-1 font-medium">{review.headline}</p>}
      {review.pros && <p className="mt-1">👍 {review.pros}</p>}
      {review.cons && <p className="mt-1 text-muted">👎 {review.cons}</p>}
      {language && <p className="mt-1 text-xs text-muted">Мова відгуку: {language}</p>}
    </article>
  );
}

export function ReviewsView({ reviews, rating, reviewCount }: { reviews: Review[] | null; rating: number | null; reviewCount: number }) {
  const [open, setOpen] = useState(false);
  const withText = (reviews ?? []).filter((r) => r.pros || r.cons || r.headline);
  const latest = latestReviews(withText, 3);

  return (
    <section className="bg-surface px-4 py-4 md:rounded-card md:border md:border-line md:p-6" aria-labelledby="reviews-title">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="reviews-title" className="text-lg font-semibold">
          Відгуки гостей
        </h2>
        {withText.length > 3 && (
          <button type="button" onClick={() => setOpen(true)} className="min-h-11 text-sm font-medium text-primary">
            Ще відгуки
          </button>
        )}
      </div>
      <RatingSummary rating={rating} reviewCount={reviewCount} />
      {reviews === null ? (
        <p className="mt-3 text-sm text-muted">Відгуки зараз недоступні.</p>
      ) : latest.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Поки немає текстових відгуків.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {latest.map((review) => (
            <ReviewItem key={review.id} review={review} />
          ))}
        </div>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title="Відгуки гостей" description={`Останні ${withText.length} ${pluralUk(withText.length, ["відгук", "відгуки", "відгуків"])} з текстом, мовою оригіналу.`}>
        <div className="space-y-2">
          {latestReviews(withText, withText.length).map((review) => (
            <ReviewItem key={review.id} review={review} />
          ))}
        </div>
      </Sheet>
    </section>
  );
}
