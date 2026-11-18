# Plan 03 — Page 1 "Пошук і результати" (`/`) + favorites

Produced by the `planner` agent from SPEC §5.1 (docs verified in node_modules/next/dist/docs).

## Key decisions
- `page.tsx` sync; `searchParams` awaited inside `<Suspense>` (static shell keeps hero/form). Results in a keyed Suspense (city|dates|adults) so a new search shows the skeleton.
- Sort/filter are client-only: `history.replaceState` updates the URL and `useSearchParams` without a server round-trip, so LiteAPI is not called again. Reload re-fetches prices (never cached).
- `next/form` GET submit; Zod-validated on both sides; field errors in Ukrainian.
- Native `<input type="date">` (a11y, mobile pickers, 320 px) instead of a custom range picker.
- `next/image` with `remotePatterns` only for `https://static.cupid.travel`, `qualities: [75]`; first card `loading="eager"` + `fetchPriority="high"` (`priority` is deprecated in 16).
- Favorites: idempotent `setFavorite({favorite: boolean})` server action as the user (RLS), no revalidation (would re-run LiteAPI); optimistic UI; signed-out heart → auth modal + pending intent replayed after login.
- Recent searches in localStorage via `use(browser())` (React 19.3) — no hydration mismatch.

## Steps
1. `lib/format.ts`, `lib/rating.ts`, stay additions (`addDays`, `defaultStay`, `adjustCheckOut`) + tests
2. `lib/search/params.ts` (parse/serialise URL ↔ query/view, hrefs) + tests
3. `lib/search/filter.ts` (applyView, countMatching, priceBounds, activeFilterCount) + tests
4. `lib/search/recent.ts`, `lib/favorites/pending.ts` + tests
5. Migration: `favorites.hotel_image` (https, ≤500), `city`, length checks + pgTAP
6. `lib/hotels/images.ts`, favorites schema, `server/favorites.ts`, `features/favorites/actions.ts`
7. UI primitives: Stepper, RatingBadge, Stars, ErrorState, HotelImage
8. Search form (ARIA combobox, dates, stepper), recent, popular, AI banner
9. Page wiring, results (server), skeleton, error states, next.config images
10. ResultsView (client): summary bar, sort, filters (sheet <1024, column ≥1024), cards, empty states, favorites
11. Browser verification 320/375/768/1280; SPEC + AI_LOG updates

## SPEC changes
1. Page 1 drops "free cancellation" and "breakfast" filters (min-rates has no board/refundability data) → page 2.
2. Two native date inputs instead of a DateRangePicker.
3. First 50 hotels per city, only those with a price; no pagination.
4. 768–1023: 2-column cards, filters in a modal; filter column from 1024.
5. `favorites.hotel_image`, `city` added now (were marked ✅ but missing).
6. LCP < 2.5 s applies to the start state; results are bound by LiteAPI's 2–3 s.
7. Collapsed header search row comes with stage 4.
