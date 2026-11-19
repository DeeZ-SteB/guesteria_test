# AI log

How AI agents were used and checked. One entry per feature or notable decision.
This file is the evidence for "how did you verify the AI's work" in the submission.

Format:

```
## YYYY-MM-DD — <feature / PR>
- Agents: planner, test-writer, code-reviewer, security-auditor, CI review
- Findings: N (H/M/L) — accepted X, rejected Y
- Accepted: <finding> → <fix>
- Rejected: <finding> → <why it was wrong>
- Caught by me (missed by agents): <what>
```

## 2026-11-18 — Project setup
- Agents: Claude Code (main session) scaffolded Next.js 16, Supabase, Docker, CI/CD and this pipeline.
- Checked by me: ports don't collide with other local projects; `.env` is git-ignored; RLS pgTAP tests (7/7) pass; production Docker image builds and `/api/health` answers.
- Decision: Supabase auth cookie name is fixed (`sb-guesteria-auth-token`) because the Docker server reaches Supabase through `host.docker.internal` while the browser uses `localhost`; the default host-derived cookie name would break sessions in Docker.

## 2026-11-18 — Stage 1: design system, shell, auth (`feat/design-system-auth`)
- Agents: `planner` → plan in `docs/plans/01-design-system-auth.md`; main session implemented; `code-reviewer` and `security-auditor` ran in parallel on `git diff main...HEAD` only (no author reasoning).
- Planner caught a SPEC conflict (tab bar < 1024 in §4 vs header from 768 in §8) → resolved to 768, SPEC updated.
- Findings: code-reviewer 5 (1 HIGH, 2 MEDIUM, 2 LOW), security-auditor 7 (4 MEDIUM, 3 LOW). Accepted 10, deferred 1, accepted risk 1.

| # | Agent | Sev | Finding | Resolution |
|---|---|---|---|---|
| 1 | security | MED | `safeReturnTo` bypass: `/..//evil.com`, `/./\evil.com` normalise to `//evil.com` | **Accepted.** Reproduced with 5 failing tests first, then validated the normalised output. Real bug that my own tests missed. |
| 2 | security | MED | Demo script would reset the password of any existing user named in `DEMO_EMAIL`, incl. remote | **Accepted.** `app_metadata.demo` mark, refuses unmarked users, prints target, `--yes` required for remote. Verified it refuses a real test account. |
| 3 | code | HIGH | Auth modal never closed after successful login (provider in root layout) | **Partly disputed, fixed anyway.** Could not reproduce in the browser (redirect remounted the dialog), but that made the open state inconsistent. Actions now return `redirectTo`; client closes and navigates explicitly. Also found by me while fixing: the dialog `close` event raced with navigation → `onClose` now fires only on user dismissal. |
| 4 | code | MED | No route for email-confirmation links (Cloud has confirmations on) | **Accepted.** `/auth/confirm` handles PKCE `code` and `token_hash`; `emailRedirectTo` set on sign-up. |
| 5 | code | MED | `error.tsx` used `reset` (no refetch in Next 16.3+) | **Accepted.** Verified in bundled docs; switched to `retry`. |
| 6 | security | MED | Shared demo account can change its own password without the old one | **Accepted.** `secure_password_change = true` (also set in Cloud). Blocking profile edits for the demo user → stage 6. |
| 7 | security | LOW | `signOut()` is global → one reviewer logs out all demo sessions | **Accepted.** `scope: "local"`. |
| 8 | security | LOW | Supabase no-store headers dropped in proxy (CDN could cache Set-Cookie) | **Accepted.** Headers applied to the response and to proxy redirects. |
| 9 | code | LOW | `?auth=signin` opens the modal for a signed-in user | **Accepted.** Proxy strips `auth`/`next` for signed-in requests. |
| 10 | code | LOW | `<details>` account menu stays open after navigation, no Esc/outside click | **Accepted.** Small `Dropdown` client component. |
| 11 | security | MED | Auth rate limit is per server IP, not per visitor | **Deferred to stage 8** — one shared limiter (`rate_limits` table) for auth and the AI assistant. |
| 12 | security | LOW | "Email already registered" enables account enumeration | **Accepted risk.** Clear UX copy is in the SPEC; mitigated by the limiter in stage 8. |

- Caught by me (missed by agents): Next.js 16 `Date.now()` prerender error from Supabase `getClaims()` in the header → `connection()` in `getCurrentUser`.
- Manual checks (browser, 375 px and 1280 px): protected-page redirect → modal → demo login → back to `/account?tab=trips`; sign-up; wrong password copy; `?next=//evil.com` stays on `/`; reopening the modal after sign-out; Esc on the account menu; no horizontal scroll.

## 2026-11-18 — Stage 2: LiteAPI data layer (`feat/liteapi-client`)
- Before planning, I captured real sandbox responses (incl. errors) into `__fixtures__` so agents worked from ground truth, not docs. This surfaced: `HTTP 200 + error 2001`, `hotelIds: ""`, board code `BI` (not `BB`), untaxed tourism fee, 1 250-char `offerId`.
- `planner` → `docs/plans/02-liteapi-client.md`. It found the separate booking host (`book.liteapi.travel`) and the rule that public prices must not go below `suggestedSellingPrice`.
- `scripts/check-cities.mjs` (proposed by planner) caught 3 wrong city spellings that returned ~2 hotels instead of 80–150: LiteAPI uses `Ternopilʼ`, `Ivano-Frankivsʼk` (U+02BC) and `Vinnytsya`. Lutsk removed (1 hotel). Threshold raised to ≥ 20 hotels to catch near-misses.
- Findings: code-reviewer 17 (2 HIGH, 6 MEDIUM, 9 LOW), security-auditor 8 (2 MEDIUM, 6 LOW). Overlap 2. **All accepted** except where noted; every behavioural fix got a failing test first (20 new tests, 118 total).

| Agent | Sev | Finding | Resolution |
|---|---|---|---|
| code | HIGH | One malformed cancel-policy entry wiped the penalty list → RFN rate shown as free cancellation the supplier never promised | Per-item parsing; any unreadable/undatable entry → not refundable. Test. |
| code | HIGH | RFN with no penalties: data said refundable, UI said "Без повернення" | `cancellationText` now takes `{refundable, freeCancellationUntil}`; "Безкоштовне скасування" without a date. Test. |
| code | MED | One malformed fee dropped all fees → tourism fee hidden | Per-item fee parsing. Test. |
| code | MED | Penalty `type` ignored (percent shown as ₴) | Only `type: amount` becomes a hryvnia penalty. Test. |
| code | MED | `data.catch([])` turned a broken upstream shape into "no hotels", cached for days | Top-level `data` strict → upstream error, never cached. Test. |
| code | MED | Unlisted 2xxx/4xxx codes classified as server errors (`code >= 500`) | Unknown codes fall back to HTTP status. Test. |
| code | MED | Past check-in reached LiteAPI and looked like "no rooms" | `isPastCheckIn` (Kyiv date) → `invalid_request`. Test incl. UTC/Kyiv midnight edge. |
| code | MED | `netPrice` (our cost/margin) in public types that reach client components and the AI | Removed from domain types; stage 5 takes the payable price from prebook. Test asserts absence. |
| security | MED | `&#99999999;` in a supplier description → `RangeError` → hotel page permanently broken | Range-checked decoding (U+FFFD). Reproduced with a failing test first. |
| security | MED | Booking calls act on all bookings under our key | No change now (not wired). **Stage 5 must**: session check, Zod, ownership lookup in `bookings` before get/cancel, server-generated unique `clientReference`, no retry of `book`, server-only `bookings` writes, per-user rate limit, never expose to AI without the same checks. |
| security | LOW | `..` as bookingId would retarget the booking-host path | `pathId` allowlist before building the URL. Test. |
| both | LOW | `cacheTag` built from unvalidated `hotelId` | Validation moved to uncached wrappers; cached functions only see parsed ids. |
| security | LOW | Supplier image URLs could be `javascript:`/`http:` | `https` only. Test. |
| security | LOW | Bidi/zero-width characters survive into text and AI prompts | Stripped after decoding. Test. |
| security | LOW | Caller could override `currency`/`guestNationality` | Removed from the input type; defaults applied last. |
| security | LOW | Error `cause` may hold supplier internals | Documented contract: callers return only `{kind, message}`. |
| code | LOW | Unknown `mappedRoomId` duplicated a room card | Fallback match by room name. Test. |
| code | LOW | Missing board became "Без харчування"; empty `boardName` → empty label | Neutral "уточнюйте в готелі". Test. |
| code | LOW | Suggested price in another currency compared numerically | Ignored unless currencies match. |
| code | LOW | Expected 2001 logged as `console.error` | Logged at info level. |
| code | LOW | Mixed error types from `searchHotels` (ZodError vs LiteApiError) | Single `LiteApiError("invalid_request")`. |
| code | LOW | Missing retry/timeout/unknown-code tests | Added. |

- Caught by me: one of my own tests asserted the wrong ranking ("ри" is a prefix of both Рим and Рига) — fixed the test, not the code. Live probe after fixes: Lviv 16 hotels, no `netPrice` keys in output, past date / unknown city / `../etc` all → `invalid_request` without calling LiteAPI.

## 2026-11-18 — Stage 3: search page + favorites (`feat/search-page`)
- `planner` → `docs/plans/03-search-page.md`. Key calls it got right from the Next 16 docs: client-only sort/filter via the History API (measured: **0 network requests** on sort), `use(browser())` for localStorage, `priority` deprecated → `loading="eager"` + `fetchPriority`, idempotent `setFavorite(bool)` instead of a toggle, and dropping the breakfast/free-cancellation filters because min-rates has no such data (SPEC §17).
- Caught by me in the browser before review: `new Date()` during prerender on `/` (fixed with `connection()`), date text clipped at 375 px, heart overlapping the rating on desktop cards, no visible keyboard focus on cards, 28 px logo target.
- Findings: code-reviewer 15 (1 HIGH, 8 MEDIUM, 6 LOW), security-auditor 6 (1 MEDIUM, 5 LOW). Accepted 19, deferred 1, accepted risk 1. 10 regression tests first (163 unit, 16 pgTAP total).

| Agent | Sev | Finding | Resolution |
|---|---|---|---|
| code | HIGH | Clearing a date or a 5-digit year → `addDays` throws → whole search UI replaced by the error boundary | `addDays` returns "" on bad input, `adjustCheckOut` falls back to 3 nights, min/max only for valid dates. Reproduced (`RangeError`) in tests first, then in the browser. |
| code | MED | Hearts not re-synced after sign-in/out (same Suspense key keeps client state) | `ResultsView` keyed by `signedIn` + favorite ids. Verified both saved hotels show after login. |
| code | MED | Fast double-click rollback race could leave a "saved" heart that isn't in the DB | Per-hotel request tracker (`lib/favorites/tracker.ts`): only the latest request rolls back, to its own previous value. Unit tested. |
| code | MED | Typing "Львів" and tapping «Знайти» failed once (match resolved on a 120 ms blur timer) | Exact name resolved synchronously in `onChange` via tested `findCityByName` (handles ʼ and "Львів, Україна"). Verified first-click submit. |
| code | MED | Start form kept stale errors/values between URLs | Keyed by `{initial, errors}`. |
| code | MED | Signing in from a heart re-rendered `/` twice → 2 extra LiteAPI searches | `finish` skips `replace` when the target is the current URL; one refresh remains (needed to load the user's hearts). |
| code | MED | Pending heart not replayed after sign-out → sign-in in place; replayed later after a dismissed modal | Replay flag resets on sign-out; dismissing the modal clears the pending intent. |
| code | MED | Pure logic without tests (name match, rollback order, price clamp, validateSearch boundary) | Extracted to `lib/` and tested. |
| code | LOW | URL price range not clamped to current prices | `clampPrice`; full range = no filter. Tested. |
| code | LOW | ArrowDown on a closed list skipped the first option; `aria-controls` to a missing element | Opens at index 0; `aria-controls` only when open. |
| code | LOW | Duplicate date-field ids when the mobile + desktop form copies both mount | `useId()`. |
| code | LOW | Auth failure shown as "couldn't get prices" | User lookup falls back to signed-out separately. |
| code | LOW | Long supplier names (>200) failed the save | Truncated instead of rejected. |
| code | LOW | Favorite delete relied only on RLS | Added `.eq("user_id", user.id)` (defence in depth). |
| security | MED | Anonymous visitors can trigger unlimited live LiteAPI searches | **Deferred to stage 8** (shared per-IP limiter). Bounded now: check-in ≤ 365 days ahead (form `max` + server). |
| security | LOW | Image pattern without `port` → optimizer could probe other ports on the CDN host | `port: ""` in `remotePatterns`; `isAllowedImageUrl` rejects ports. Test. |
| security | LOW | Zod accepted URLs the DB check rejects (`@evil.com`, backslashes, uppercase) | Zod now requires the exact `https://static.cupid.travel/` prefix like the DB. Tests on both layers. |
| security | LOW | No cap on favorites per user (direct API inserts) | DB trigger caps at 500; pgTAP test. |
| security | LOW | `hotel_name` is client-supplied | **Accepted risk**: self-only, React-escaped. Stage 8 must treat it as untrusted text in AI prompts. |
| security | LOW | `city` not tied to the city list in the DB | Consumers already handle `findCity()` → undefined. |

## 2026-11-18 — Stage 4: hotel page (`feat/hotel-page`)
- Before planning-follow-up I probed LiteAPI live: unknown hotel → HTTP 400 / 4002 (fixture added); offer tokens are base64url, 976–1236 chars; review languages pl/uk/en-gb/en-us/ru/da/fr. This tightened the planner's proposed offer regex.
- `planner` → `docs/plans/04-hotel-page.md`. Notable: resolved the 512-char return-path vs ~1.2k-char offer-token conflict (limit → 2048, structural checks kept), React.cache to share one rates call between rooms and both booking summaries, CSS-only FAB lift, dropping the header search row.
- Caught by me in the browser: unknown hotel showed a generic error instead of 404 — errors thrown inside `"use cache"` come back as plain `Error`s (class/fields lost; verified with a probe route); FAB covering the sticky booking card on desktop; desktop hero image downloaded on phones; a stale orphaned dev server serving old CSS.
- Findings: code-reviewer 15 (1 HIGH, 4 MEDIUM, 10 LOW), security-auditor 7 (1 MEDIUM, 6 LOW). 22 regression tests before fixes (192 unit total).

| Agent | Sev | Finding | Resolution |
|---|---|---|---|
| code | HIGH | `reviveLiteApiError` only works in dev: in production React Flight keeps just a digest | **Disputed with evidence, fixed anyway.** `next build && next start` showed the 404 working with revival. But it relies on undocumented Flight behaviour, so cached functions now *return* `{ok:false, kind}` instead of throwing (conditional `cacheLife`: minutes for invalid ids, seconds for transient errors). Re-verified 404 on a production build twice. |
| code | MED | Lightbox with 1–2 photos repeated keys; ±1 neighbours never preloaded (`display:none` + lazy) | `lightboxWindow` (unique, tested); neighbours invisible + eager. |
| code | MED | Booking card/bar said «Немає вільних номерів» on a pricing *error* | Distinguishes `no_availability` from failures («Ціни тимчасово недоступні»). |
| code | MED | A rate with a malformed offer token made «Обрати» silently throw | Mapper drops such rates (tested); click handler guarded. |
| code | MED | Untested logic in components (stay state, carousel maths, review dates, lightbox) | Moved to `lib/` (`hotelStayState`, `carouselPosition`, `reviewMonth`, `lightboxWindow`) with tests. |
| code | LOW | Sticky bar appeared late → 72 px layout shift | Bar-shaped skeleton with `data-sticky-cta`. |
| code | LOW | Bar covered the footer at 768–1023 px | Footer bottom margin = bar height on tablets. |
| code | LOW | Carousel counter read 11/60 on «all photos» | Clamped (tested). |
| code | LOW | Mobile hero eager → desktop downloaded it too | Lazy + `fetchPriority="high"` (docs pattern for responsive variants). |
| code | LOW | «Найдешевше» badge ignored active chips | Computed on visible rates (tested). |
| code | LOW | Chips reset on date change | **Accepted & documented**: rates differ per stay anyway. |
| code | LOW | Re-submitting the same dates re-fetched rates | Skipped when the stay is unchanged. |
| code | LOW | `/checkout` is a 404 until stage 5 | **Accepted**: stage 5 is next; local only. |
| code | LOW | Wrong plural «4 відгуків»; «Усі відгуки» overstated | `pluralUk`; «Ще відгуки». |
| code | LOW | Duplicate fee labels; raw English fee names | De-duplicated; untranslated → «збір» (tested). |
| security | MED | Unlimited live LiteAPI calls per anonymous visitor; random ids hit `/data/hotel` every time | Negative cache for invalid ids (minutes). **Per-IP limiter deferred to stage 8.** |
| security | LOW | Longest accepted token made the checkout link exceed 2048 → silent drop to `/` after login | `OFFER_ID_MAX = 1900`; test with the longest token + 8 adults + 32-char hotel id. |
| security | LOW | Offer token would be embedded in the sign-up confirmation email | `emailSafeReturnPath` swaps `/checkout?…` for the hotel page (tested). |
| security | LOW | No security headers | `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`; config test; verified on `next start`. |
| security | LOW | Offer token in history/logs | **Accepted** (not secret; prebook validates). Stage 5: don't log full checkout URLs. |
| security | LOW | Assistant context (`hotelName`) is client-supplied | Stage 8 rule: send only `hotelId`, load facts server-side, delimit supplier text. |
| security | LOW | /checkout must not trust URL data | Stage 5 checklist recorded: session check, Zod, prebook is the only source of hotel/stay/price, server `clientReference`, no `book` retry, per-user limit. |

## 2026-11-19 — Stage 5: checkout (`feat/checkout`)
- Before planning I ran the whole booking cycle live in the sandbox (prebook → book `ACC_CREDIT_CARD` → get → duplicate reference → cancel → lookup by reference) and saved the responses as fixtures. Facts the plan relied on: prebook 1.4 s / book 4.7 s, **duplicate `clientReference` → 4005**, `GET /bookings?clientReference=` works (empty → `data: []`), sandbox book quirks (swapped board fields, later cancellation deadline than prebook).
- `planner` → `docs/plans/05-checkout.md`: prebook during render behind `navigation()` (never on prefetch), HMAC-signed checkout token, `clientReference = HMAC(user|prebook)`, no net price in the DB, success state on the same page.
- Caught by me in the sandbox E2E run: the stored free-cancellation deadline (from book, 17 Dec) was later than the one shown at checkout (prebook, 13 Dec) → now the earliest is kept. Also a bad date display in my own summary code.
- Findings: code-reviewer 17 (3 HIGH, 9 MEDIUM, 5 LOW), security-auditor 7 (2 MEDIUM, 5 LOW). Both independently pointed at the same root cause: an in-flight/failed attempt was invisible, so a reload could book twice.

| Agent | Sev | Finding | Resolution |
|---|---|---|---|
| code | HIGH | Expired token after "pending/unsaved" → "reload" → new prebook → second booking | **Redesigned:** the attempt is recorded as `pending` **before** book (unique `client_reference` = lock). An expired token may still *resolve* an existing attempt, never start one. Tests. |
| code | HIGH | 4005 with an empty lookup said "pick another rate" (booking existed) | Pending + error log; lookup failure ≠ "not found". Tests. |
| code | HIGH | Booked but not `CONFIRMED` (or mismatch) → "failed" forever | Not confirmed → pending (LiteAPI id remembered); mismatch → `support` state. Tests. |
| security | LOW | Check-then-act race: two simultaneous submits both call book | Same redesign: only the request that inserted the pending row books; the other resolves by lookup. Test. |
| code | MED | 2001/4002 on a retry → "rate gone" without checking an earlier book | Lookup first; only a definite "nothing booked" frees the attempt. 4000 → own `guest_rejected` copy. Tests. |
| code | MED | Re-render swaps the hidden token → retry books a new prebook | Action returns its token; the form keeps using it. Test. |
| code | MED | Pending attempts invisible to the same-stay banner / reloads | Banner includes pending; `/checkout?booking=` resolves pending attempts by lookup on open. |
| code | MED | Time budget could exceed `maxDuration` | book 80 s, lookup 15 s, no lookup retry. |
| code | MED | NRFN booking stored as refundable (null meant both "unknown" and "non-refundable") | Explicit `refundable` column + `storedCancellation` (never more generous than either side). Tests + pgTAP. |
| code | MED | Token signed values the verifier rejects → every submit failed | Same schema at sign time; unsignable → friendly error. Tests. |
| code | MED | Cyrillic guest names might be rejected by LiteAPI | **Rejected with evidence:** sandbox booking with «Олена Коваль-Сидоренкоʼ» → CONFIRMED (then cancelled). |
| code | MED | Success page ignored status | Confirmed / pending (with «Оновити статус») / cancelled / gone states. |
| code | LOW | Refundable-without-deadline shown as «Без повернення» | Fixed by the explicit `refundable` flag. |
| code | LOW | `matches()` didn't check hotel/reference strictly | Hotel must match; reference checked when present. Price comparison skipped (public price comes from the signed quote). |
| code | LOW | Currency not checked in `max(net, price)`; multi-rate prebook retried forever | Currency guard; multi-rate → `offer_stale`. |
| code | LOW | "Unsaved" button label suggested a new booking | «Зберегти бронювання». |
| security | MED | Unlimited prebook/book per account (spending) | **Deferred to stage 8**: per-user and global caps on prebook/book, alerts. |
| security | MED | Open sign-up without email confirmation can book | Booking now requires a confirmed email (`email_confirmed_at`, checked via Auth server). **Cloud: enable confirmations** (deploy checklist). |
| security | LOW | `getClaims` accepts a revoked JWT until expiry | Booking re-checks with `auth.getUser()`. |
| security | LOW | Admin-client lint guard bypassable (dynamic import, `.ts`, reading the key elsewhere) | Patterns + `no-restricted-syntax`; the key is read only inside `admin.ts`. Verified with a probe file. |
| security | LOW | `cancelLiteApiBooking(rawId)` exported without ownership check | Stage 6: replaced by an ownership-checked function. |
- Re-verified live after the redesign: double click → 1 row (`confirmed`, refundable) and 1 LiteAPI booking; deadline = the one shown at checkout.

## 2026-11-19 — Stage 6: personal cabinet (`feat/account`)
- `planner` → `docs/plans/06-account.md`. Before coding I probed the sandbox: re-cancelling an already cancelled booking answers `200 CANCELLED` again (idempotent), an unknown id → `404 / 4008`. The plan's "already-cancelled response is undocumented" became a verified fact.
- Overrode the planner: no `?deleted=1` toast (redirect home is enough); `refund_amount` dropped entirely (planner said "don't show" — I also don't return it from the mapper).
- Caught by me in the browser: trip cards overflowed the 375 px viewport (grid items with `truncate` text need `grid-cols-1` = `minmax(0,1fr)`).
- **My own mistake, caught only by the dev server:** exporting a constant from a `"use server"` file breaks every action in it. Lint, typecheck and 292 unit tests all passed — `npm run build` is now part of my check before any commit.
- Findings: code-reviewer 7 (2 MEDIUM, 5 LOW), security-auditor 7 (1 MEDIUM, 6 LOW).

| Agent | Sev | Finding | Resolution |
|---|---|---|---|
| security | MED | Current-password check had no limit: a hijacked session could guess it, and failed attempts exhaust Supabase's per-IP sign-in limit shared by all users | `password_failures` table (no client access) + `security definer` RPCs; 5 failures / 15 min per user, fails closed. pgTAP + unit tests; verified through the real API. |
| both | MED/LOW | `CANCELLED_WITH_CHARGES` reported as a free cancellation | Distinct `cancelled_with_charges` result; the sheet tells the guest to contact support. Test. |
| code | MED | A long-lived `pending` attempt blocked account deletion with no way out | Pending gets its own message pointing to its status page (opening it resolves or releases the attempt). Test. |
| security | LOW | Account deletion erased booking records (money trail) | Migration: `bookings.user_id … on delete set null`. pgTAP. This also defuses the check-then-delete race below: a booking confirmed mid-deletion stays recorded. |
| both | LOW | Race between `hasActiveTrips` and delete | Accepted (narrow window, user acting against themselves); with `set null` no record is lost. |
| code | LOW | DB error in `getOwnBooking` looked like 404 / "not found" | Throws; the page shows the error boundary, `cancelTrip` returns retryable `retry`. Test. |
| code | LOW | `cancelEligibility(new Date())` during client render → hydration mismatch near the deadline | `cancellable` computed on the server with one clock. |
| code | LOW | `getBooking` default query timeout margin shrank 5 s → 3 s | Margin back to 5 s. |
| code | LOW | No tests for status mapping / metadata parsing | Pure `toBookingState` and `parseProfileMeta` with tests. |
| security | LOW | Shared demo account: visitors can cancel each other's demo bookings | Accepted: sandbox only, the demo banner says the account is shared; cancellation is the showcase flow. |
| security | LOW | Phone in `user_metadata` travels in the JWT | Accepted: the user's own data in their own token; SPEC lists phone in the profile. Revisit if a `profiles` table appears. |
| security | LOW | No rate limit on `cancelTrip` | Stage 8 (with prebook/book limits). Duplicate cancels are harmless (idempotent at LiteAPI). |
- Verified live: double-click cancel → 1 LiteAPI call result `CANCELLED`, DB `cancelled`; favorites remove/undo; profile save updates the header at once; wrong / right current password; deletion of a test account; foreign trip id → 404; password-failure RPCs deny direct table access and anon calls.

## 2026-11-19 — Stage 7: trip page (`feat/trip`)
- `planner` → `docs/plans/07-trip.md`. Key decisions taken from it: server actions with the *user* client (RLS as second layer), column-level insert grants for `guest_requests`, client-generated request ids for idempotency, refetch on every Realtime (re)subscribe.
- Verified live: check-in persists; double-click → one request; a status change in the DB reaches the page in ~1 s without reload; **a probe script subscribed as a second user received 0 events while the owner received 1** (Realtime honours RLS).
- **My mistake:** to apply a new migration I ran `supabase db reset` instead of `migration up` — it wiped local data (demo user and two booking rows). Recreated the demo user and restored both rows from LiteAPI's own records (the sandbox bookings were never affected). Local resets only through `migration up` from now on.
- Findings: code-reviewer 8 (3 MEDIUM, 5 LOW), security-auditor 5 (2 MEDIUM, 3 LOW). Both reviewers independently found the same main issue.

| Agent | Sev | Finding | Resolution |
|---|---|---|---|
| both | MED | Browser can insert into `guest_requests`/`checkins` via REST, bypassing rules that existed only in TypeScript (early check-in after arrival, empty details, invisible/bidi characters that could smuggle text into the stage-8 AI prompt) | Migration `…trip_hardening`: rules moved into the DB (policy + CHECKs + `has_invisible_chars`); `checkins` column grants. pgTAP for each bypass. |
| security | LOW | `security definer` cap trigger answered "limit" for a foreign booking (count oracle) | Trigger runs as invoker; foreign booking → RLS refusal. pgTAP. |
| code | LOW | Retry of the 20th request answered "limit" instead of returning it | Trigger skips existing ids → unique violation → idempotent replay. pgTAP. |
| code | MED | No tests for the DB error → result mapping (idempotency hinges on it) | `src/server/trip.test.ts` with a stubbed client. |
| code | MED | Check-in and requests waited for LiteAPI (only a hint) | Hotel time raced against 1.5 s; the block renders from our DB. |
| code | LOW | `crypto.randomUUID` missing on http LAN testing → form crash | `newUuid()` with a `getRandomValues` fallback. Test. |
| code | LOW | Requests creatable while the list failed to load; new ones hidden behind the error | No request buttons without the list; created rows still shown. |
| code | LOW | Early-arrival hint opened a request that was already pending | Hook lifted up; hint only when no open early request. Verified in browser. |
| code | LOW | No tests for Kyiv-day boundaries, cross-user update, moving a check-in | pgTAP with Kyiv-date fixtures. |
| security | LOW | Realtime DELETE events are not RLS-filtered (ids only); deleted rows stayed in the UI | UI removes deleted rows (test). Leak of random ids accepted; Broadcast with private channels if requests ever get deleted routinely. |
