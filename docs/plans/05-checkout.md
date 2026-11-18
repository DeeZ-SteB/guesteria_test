# Plan 05 — Page 3 "Оформлення" (`/checkout`)

Produced by the `planner` agent from SPEC §5.3, grounded in a live sandbox run captured as fixtures
(prebook 1.4 s, book 4.7 s CONFIRMED, duplicate clientReference → 4005, lookup by clientReference, cancel).

## Key decisions
- Prebook on the server during render, inside Suspense, after `requireUser` and `await navigation()` (never on prefetch). `React.cache` per request; reload = new prebook (free; rate limit in stage 8).
- Signed checkout token (HMAC, 30 min) carries user id, prebook id and the quote; `clientReference = HMAC(user|prebook)` → double submit / back / resubmit reuse it; LiteAPI 4005 → resolve as success via lookup.
- Public price = max(net, suggested) in the same currency; stored as `total_amount`; **no net amount in the DB** (owners can SELECT their rows).
- Everything shown/stored comes from prebook/book (+ cached hotel info); URL params are only for matching; mismatch → "link outdated".
- Success = `/checkout?booking=<our uuid>` (same page, `redirect(…, replace)`, outside try).
- `maxDuration = 120`; book 95 s, lookup 20 s.
- Admin Supabase client only in `src/server/bookings.ts` (lint-enforced); `bookings` writes only after CONFIRMED.
- `/checkout` protected by the proxy; `Cache-Control: private, no-store`, `noindex`.

## Steps
1 schemas/client/errors (fixture mismatches, `duplicate` kind, `listBookingsByReference`) · 2 mappers + `lib/booking/checkout.ts` · 3 public API · 4 migration + pgTAP · 5 admin client, bookings DAL, env, token · 6 params/routes/headers · 7 page + UI · 8 server action · 9 docs

## SPEC changes
Success state on the same page; optional display-only `price` in the checkout link; `/checkout` protected; `bookings.prebook_id`, board code, no net amount, room name from prebook, `refundable_until` earliest of book deadlines; env `CHECKOUT_SECRET`; timeouts 95 s / 20 s within 120 s.
