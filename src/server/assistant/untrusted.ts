import { cleanUserText } from "@/lib/text/html-to-text";

/** Tags that only the server may produce in a model prompt. */
const OUR_TAGS = ["verified_context", "hotel_data", "hotel_reviews", "trip_data"] as const;
export type UntrustedTag = Exclude<(typeof OUR_TAGS)[number], "verified_context">;

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Supplier text (hotel descriptions, reviews), guest-typed notes and anything client-written
 * (hotel names in bookings/favorites) reach the model only inside one of these tags, escaped so
 * it can never close the tag, with invisible/bidi characters removed and a length cap.
 */
export function wrapUntrusted(tag: UntrustedTag, text: string, max = 3000): string {
  const clean = cleanUserText(text).slice(0, max);
  return `<${tag}>${escape(clean)}</${tag}>`;
}

/**
 * A short untrusted value inside our own line-based structured text (e.g. a hotel name). All
 * whitespace collapses to single spaces, so a value can never start a new "key: value" line.
 */
export function untrustedValue(text: string | null | undefined, max = 200): string {
  return escape(cleanUserText(text ?? "").replace(/\s+/g, " ").slice(0, max));
}

/** User messages may not impersonate our tags (e.g. typing "</verified_context>"). */
export function neutralizeTags(text: string): string {
  const pattern = new RegExp(`<\\s*/?\\s*(${OUR_TAGS.join("|")})\\b[^>]*>`, "gi");
  return text.replace(pattern, (m) => m.replace(/</g, "‹").replace(/>/g, "›"));
}
