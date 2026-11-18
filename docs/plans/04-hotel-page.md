# Plan 04 — Page 2 "Готель" (`/hotels/[hotelId]`)

Produced by the `planner` agent from SPEC §5.2 (Next 16 docs cited in the agent report).

## Key decisions
- Sync page; params/searchParams awaited inside Suspense; `connection()` before "today". Cached hotel info + reviews render first; live rates stream in a Suspense keyed on the stay. `React.cache` so rooms + booking summary share one rates call.
- Unknown hotel: LiteAPI answers HTTP 400 / 4002 (probed live, fixture `error-hotel-not-found.json`) → `invalid_request` → `notFound()` (streamed: 200 + noindex, accepted).
- `hotelHref` gets an optional `city` (backward compatible); fallback `findCityByLiteApiName(details.city)`.
- Checkout handoff: offerId (base64url, 976–1236 chars, probed) travels in the URL; prebook (stage 5) validates it and is the source of the price. `safeReturnTo` max length 512 → 2048 (structural checks unchanged).
- Mobile sticky booking bar; FAB lifted via CSS `:has([data-sticky-cta])`, no JS. Desktop sticky card in the grid column.
- Header search row (SPEC §17 item 7) dropped: the page has its own stay form + back link.
- Gallery capped at 60 photos; mobile carousel 10 slides + «Усі N фото»; lightbox mounts current ±1.
- Breakfast / free-cancellation chips live here (local state, not URL).
- Shared `useFavoriteToggle` hook extracted from the results view.

## Steps
1. Data fixes (not-found fixture, review language, offerId schema)
2. `lib/hotels/facilities.ts` (+ icons) — 3. `lib/hotels/page.ts` — 4. `lib/hotels/rates.ts` — 5. links (`hotelHref` city, `stayKey`, `checkoutHref`, return-to 2048)
6. `useFavoriteToggle` — 7. UI: Lightbox, Chip, assistant context, CTA CSS
8. Page shell, metadata, 404, errors — 9. Gallery — 10. Header + info — 11. Stay form + rooms — 12. Booking summary — 13. Reviews — 14. Browser check, SPEC, AI_LOG

## SPEC changes
Chips on page 2; `hotelHref` city param; checkout URL carries offerId; return-to 2048; header search row dropped; gallery cap 60; unknown hotel = 404 (200 + noindex); favorite city may be null.
