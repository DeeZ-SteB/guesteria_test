/** Booking-style verbal label for a 0–10 guest rating. */
export function ratingLabel(rating: number | null | undefined): string {
  if (rating == null) return "Без оцінок";
  if (rating >= 9) return "Чудово";
  if (rating >= 8) return "Дуже добре";
  if (rating >= 7) return "Добре";
  return "Оцінка";
}

/** 8.9 → "8,9" (Ukrainian decimal comma, one digit). */
export function formatRating(rating: number): string {
  return rating.toFixed(1).replace(".", ",");
}
