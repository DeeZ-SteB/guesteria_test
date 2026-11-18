# Plan 02 — LiteAPI client (schemas, mappers, fixtures, tests)

Produced by the `planner` agent from SPEC §14 stage 2, grounded in real sandbox responses captured into
`src/server/liteapi/__fixtures__/` (incl. `200 + error 2001`, `hotelIds: ""`, `BI` board code, untaxed tourism fee).

## Key decisions
- Hosts: `api.liteapi.travel/v3.0` for `/data/*`, `/hotels/*`; `book.liteapi.travel/v3.0` for prebook, book, getBooking, cancel (per LiteAPI reference pages).
- Errors: `body.error` checked before HTTP status; normalised to `LiteApiError.kind` (no_availability, unauthorized, invalid_request, timeout, network, upstream, unknown); Ukrainian copy in `src/lib/liteapi-messages.ts`.
- Timeouts: data 10 s, rates 20 s, prebook/book 120 s (with `timeout=110` query), getBooking/cancel 30 s. One retry only for network errors on GET `/data/*`.
- Schemas: only fields we use; cosmetic fields `.catch(null)` / arrays `.catch([])`; `hotelIds` string-or-array quirk.
- Display price = `suggestedSellingPrice` (LiteAPI: floor for public selling), fallback `retailRate.total`; net price kept. Rounded up to whole hryvnias.
- Free cancellation until = earliest `cancelTime` with penalty > 0 (GMT/UTC only, else unknown); shown in Europe/Kyiv.
- HTML descriptions → plain paragraphs (no `dangerouslySetInnerHTML`).
- Caching: `"use cache"` + `cacheLife("days")` + `cacheTag` for hotel lists, details, reviews; prices never cached; API key read inside, never an argument.
- Booking endpoints typed now, marked "untested against sandbox until stage 5".
- Cities: curated list; `scripts/check-cities.mjs` validates spellings against sandbox. `scripts/liteapi-smoke.mjs` is read-only and never runs in CI.

## Tests (fixtures only, injected fetch)
schemas, errors (each error fixture, invalid JSON, timeout, network), client (hosts, header, retry policy), mappers, service join, money, cancellation (DST), board, html-to-text, cities.

## Out of scope
UI, live prebook/book, booking lookup by clientReference, page-1 filters for refundability/breakfast (min-rates has no board data — stage 3 decides).
