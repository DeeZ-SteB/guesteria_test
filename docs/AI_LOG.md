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
