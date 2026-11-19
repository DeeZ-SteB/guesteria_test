# Plan 06 — Personal cabinet `/account` (trips, favorites, profile)

Produced by the `planner` agent, saved verbatim in substance; implementation notes added at the end.

## Goal
Replace the `/account` placeholder with a `?tab=trips|favorites|profile` cabinet: trips grouped from our own bookings (incl. `pending` attempts) with ownership-checked free cancellation; saved hotels with remove; profile edit (name, phone, AI language), password change, sign-out and account deletion — with the demo account locked server-side.

## Steps
1. **Pure trip logic** — `src/lib/booking/trips.ts`: `groupTrips(rows, today)` → `{upcoming, past, cancelled}` (upcoming = confirmed|pending with `check_out >= today`, pending first; past = `check_out < today`; cancelled by status), `tripBadge(row, today)` (in N days / today / ongoing / processing, nearest confirmed only), `cancelEligibility(row, now)` → `ok | not_confirmed | no_liteapi_id | non_refundable | deadline_passed | stay_started` (10-minute safety margin before the deadline; `stay_started` by Kyiv date), `cancelReasonText`.
2. **Bookings DAL** — `src/server/bookings.ts`: `listOwnBookings(userId)` (RLS client + explicit filter, limit 200), `markCancelled(userId, id)` (admin, only `confirmed → cancelled`, idempotent), `hasActiveTrips(userId, today)`.
3. **LiteAPI** — remove `cancelLiteApiBooking(rawId)`; add `cancelBookingAtLiteApi(liteapiId)` → `{status: cancelled | cancelled_with_charges, fee}` and `getLiteApiBookingStatus(liteapiId)` → `confirmed | cancelled | other` (15 s). Both documented "callers must have passed `getOwnBooking`". Map error code 204 → `invalid_request`, 304 → `upstream`. Never store/show LiteAPI `refund_amount` (it is our net cost).
4. **Cancel action** — `src/features/account/actions.ts` `cancelTrip({bookingId})`: Zod uuid → `verifiedUser()` (Auth server) → `getOwnBooking` (null = `not_found`, also for others' ids) → already cancelled = no-op → `cancelEligibility` server-side → PUT cancel → `markCancelled`. On any LiteAPI error reconcile with GET: cancelled → mark; confirmed → `liteapi_failed`; unknown → `unknown_outcome` (retry is safe). DB failure after cancel → `save_failed` (retry self-heals). `refresh()`; `maxDuration = 60`.
5. **Page shell** — `?tab` via `z.enum(...).catch("trips")`; mobile: h1 + link tabs (`aria-current`); ≥1024: 240 px left menu (avatar, name, email, links, «Вийти») + content. Only the active tab renders, each in its own Suspense. `/account*` → `private, no-store` + `noindex`.
6. **Auth helpers** — `verifiedUser()` (getUser, `isDemo` from server-verified `app_metadata.demo`, `emailConfirmed`); `verifiedBookingUser` built on it. `getAccountProfile()` reads `user_metadata` through Zod `.catch` (user-writable, never used for authorization).
7. **Trips UI** — server section + client view with sub-tabs Майбутні / Минулі / Скасовані (counts, empty states), trip card (status chip, badge, pending → `/checkout?booking=`), cancel sheet (terms, «Повернення: повна сума», irreversible warning, pending-disabled button, `aria-live` result). DTO without `client_reference`/`prebook_id`. Trip page placeholder gets the ownership check (404 for others).
8. **Favorites UI** — `listOwnFavorites()` (RLS, newest first); grid 1/2/3 columns; reuse `useFavoriteToggle` (removed card dims with «Повернути»); per-hotel city kept on re-add.
9. **Profile** — Zod schemas (names ≤ 50, phone `^\+?[0-9]{7,15}$` after stripping separators, `aiLanguage: auto|uk|en`; password: current required, new ≠ current, confirm matches; delete: current password + literal «ВИДАЛИТИ»). `updateProfile` → `updateUser({data})` + `refreshSession()` (names come from JWT claims). `changePassword` verifies the current password by re-sign-in (also satisfies `secure_password_change`), then `updateUser({password})` + `signOut({scope:"others"})`. `deleteAccount`: password check, **blocked while active trips exist** (a cascade would orphan live LiteAPI bookings), admin `deleteUser` in new `src/server/users.ts`, sign out, redirect home. All three refuse the demo account.
10. **Docs** — SPEC §17 stage-6 notes; AI_LOG closes "cancel without ownership check".

## Data & security
- No migration. `bookings` read via RLS; only new write is `markCancelled` (admin, conditional on `user_id` and `status='confirmed'`). `favorites` existing policies. Profile in `auth.users.user_metadata`.
- Every booking action goes through `getOwnBooking` before LiteAPI; the raw-id cancel export is removed.
- Admin client limited to `server/bookings.ts` and `server/users.ts` (lint).
- Demo guard from `auth.getUser()` in profile/password/delete; cancellation allowed for demo (showcase flow).
- Zod on tab, all action inputs, metadata read back, LiteAPI responses.

## Tests
- `src/lib/booking/trips.test.ts`: grouping around Kyiv midnight, ongoing stay, past pending, sort orders; badges; every eligibility branch incl. the 10-minute margin.
- `src/features/account/actions.test.ts`: cancel — invalid id, no session, foreign booking never reaches LiteAPI, already cancelled, ineligible refused, happy path, with-charges, timeout→GET cancelled, error→GET confirmed, both fail, DB fail after cancel; demo guard on profile/password/delete; wrong current password; refreshSession; delete blocked by active trips; success path.
- `src/features/account/schemas.test.ts`: phone normalisation, limits, password rules, delete literal, tab fallback.
- Mapper test for `toCancelOutcome`; error-code mapping 204/304; security headers for `/account`.
- pgTAP: `authenticated` cannot update `bookings.status`; deleting an `auth.users` row cascades bookings/favorites.

## Done when
- Tabs render by `?tab`, unknown → trips; nav highlights right item.
- 375 px: one column, no horizontal scroll, cancel sheet as bottom sheet; 1024 px: left menu, trips 2 cols, favorites 3.
- Skeleton, empty and error states per tab.
- Pending attempt in Майбутні as «Обробляється».
- Refundable confirmed booking cancels once (sandbox verified), double click safe; ineligible has no button and forged calls are refused.
- `/account/trips/<foreign id>` → 404.
- Profile save updates header name immediately; wrong current password refused; deletion blocked with active trips, otherwise removes everything and signs out.
- Demo: forms disabled + server refuses.
- lint, typecheck, tests, pgTAP pass.

## Out of scope
Rate limits (stage 8); trip page content and check-in badge (stage 7); paid cancellation and showing fees; email change, avatar, reset-by-email; pagination; E2E (stage 9).
