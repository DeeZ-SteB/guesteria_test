# Plan 07 — Trip page `/account/trips/[bookingId]` («Моя поїздка»)

Produced by the `planner` agent; condensed here.

## Goal
SPEC §5.5 blocks 1–6: header + details (with the stage-6 cancel flow), directions, online check-in (new `checkins` table), guest requests with live statuses (Supabase Realtime), hotel info from the cached LiteAPI `getHotel`. Block 7 (AI) is only a slot. The page works from our `bookings` row when LiteAPI is down.

## Decisions
1. `tripMode(b, today)`: `pending` → redirect to `/checkout?booking=`; `cancelled` and `past` (check_out < today) → read-only (requests listed, no forms, no Realtime); `active` → everything. Kyiv dates.
2. Check-in editable while `today <= check_in`; re-save overwrites; `completed_at` keeps the first time (trigger).
3. Requests while `active`; `early_check_in` only until the check-in day. DB enforces the general rule, app code the per-type rule.
4. Writes go through server actions with the **user** client (RLS as the second layer). No admin client. Stage 8 tools reuse `src/server/trip.ts`.
5. `guest_requests.source in ('guest','assistant')`, default `guest`. Clients get a **column-level** insert grant (`id, booking_id, type, details`) so they can never fake `source`, `status` or `user_id`.
6. Limits: details ≤ 500 (Zod: trimmed, control/bidi chars stripped; DB check), details required for `transfer`/`other`; 20 requests per booking (trigger with advisory lock); one open request per type (except `other`) via a partial unique index; client-generated `requestId` makes double submits idempotent.
7. Realtime: table added to `supabase_realtime`; postgres_changes respects the SELECT policy using the socket JWT; the hook sets auth before subscribing, refetches on every `SUBSCRIBED` and on tab focus, validates every payload with Zod.

## Steps
1. Migration `20261122000000_trip.sql`: `checkins` (+RLS, touch trigger, no delete); `guest_requests` (+`source`, `updated_at`, details ≤ 500, unique open-per-type index, cap trigger, stricter insert policy, column grants, publication).
2. Pure logic `src/lib/booking/trip-page.ts`: `tripMode`, `ARRIVAL_SLOTS`, `defaultArrival`, `checkinEligibility`, `requestEligibility`, `requestTypeAvailable`, labels, `isEarlierThan`, `mapsUrl`, `applyRequestEvent`; `tripBadgeText` moved to `trips.ts`.
3. Schemas `src/features/trip/schemas.ts` (check-in, request input, row/payload schema, `cleanText`).
4. Server data `src/server/trip.ts`: `getCheckin`, `listGuestRequests`, `upsertCheckin`, `insertGuestRequest` (error mapping), `listCheckedInIds`.
5. Actions `src/features/trip/actions.ts`: `saveCheckin`, `createGuestRequest` — Zod → `verifiedUser` → `getOwnBooking` → mode/eligibility → write; return the row (no `refresh()`).
6. Page rewrite: ownership 404, DB error → retryable error, pending redirect, LiteAPI blocks behind their own Suspense, 2 columns ≥1024 with a 420 px assistant slot.
7. Components: header, details (+cancel), directions, hotel info, check-in card, guest requests (+Realtime hook), assistant slot.
8. Cabinet badge «Чекін не пройдено».
9. Seed a future confirmed booking for the demo user (Realtime demo via Studio).
10. Docs: SPEC §17, AI_LOG.

## Tests
- Pure: slots, rounding, modes around Kyiv midnight, eligibility, `mapsUrl` (bad coordinates, encoding), `applyRequestEvent` (insert/update/stale/sort).
- Schemas: slot validation, lengths, required details, bidi stripping, bad Realtime payloads.
- Actions: invalid, session, foreign booking → not_found with no write, closed modes, type_closed, idempotent duplicate, duplicate_open, limit, retry, no `refresh`.
- pgTAP `trip.test.sql`: checkins RLS (own / foreign / cancelled / past, slot and length checks, forged `completed_at`, no delete); guest_requests (`source` default, forged `source`/`status` denied, cancelled/ended denied, open-per-type, cap, length, no owner update, isolation); publication membership. `rls.test.sql` fixed dates → relative to `current_date`.
- Manual: two accounts → 404; Studio status change → live chip; offline → catch-up; check-in survives reload.

## Done when
375 / 768 / ≥1024 px without overflow; pending redirects; cancelled/past read-only; foreign id 404; LiteAPI down → page still works; check-in saved and editable until the check-in day; request appears once after a double click and updates live; limits enforced with clear messages; cabinet badge; all checks green.

## Out of scope
AI behaviour and the `source='assistant'` write path (stage 8), hotel-side UI, notifications, documents, hotel-local time zones, rate limits (stage 8).
