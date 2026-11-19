# Plan 08 — Guesteria AI assistant (SPEC §6)

Produced by the `planner` agent; condensed here.

## Goal
`POST /api/assistant`: server-side tool loop on Claude Sonnet 5.5 (SPEC §6.3) streamed as SSE (text + typed UI blocks); history for signed-in users; write actions only as drafts confirmed by a separate user request; rate limits and cost caps for the assistant and the deferred prebook / book / cancel limits.

## Decisions
1. **Assistant-created requests/check-ins** are written by `confirm_assistant_action(uuid)` — a `security definer` SQL function callable by `authenticated`, scoped to `auth.uid()`, that locks the pending draft, re-checks the booking with the same SQL rules as the stage-7 policies, writes (`source='assistant'`) and stores the result (idempotent). Rejected: an admin-client module (rules would live only in TypeScript again).
2. Drafts, threads, messages: written by the server (secret key) in `src/server/assistant/store.ts`; rate-limit counters via a `service_role`-only RPC. Both modules on the ESLint admin allowlist; every query filtered by the session user.
3. Replay = raw API content blocks, append-only (thinking blocks are bound to the conversation). Thread cap 30 user turns → «Нова розмова». Fallback echo rule applied before replay.
4. Page context goes into the user turn as `<verified_context>` (not a mid-conversation system message — the fallback model may not support it). The system prompt is frozen (cacheable).
5. Anonymous history: text only (≤ 20 items, size caps) — tool results / thinking can never be forged by the client. Our tags are neutralised in user text.
6. Proactive hints (check-in missing, early arrival) are computed by the server and shown without a model call.
7. Rate limits: Postgres fixed window (`rate_limits` + `rate_limit_hit`), fails closed. IP from `x-forwarded-for` only on Vercel, stored as HMAC; elsewhere all anonymous users share one key; daily caps on all / anonymous model calls.

## Steps
1. Migration: `assistant_threads`, `assistant_messages`, `assistant_actions`, `rate_limits`; RLS (owner read, no client writes); functions `rate_limit_hit`, `confirm_assistant_action`, `cancel_assistant_action`.
2. Env + Anthropic client (lazy singleton, `maxRetries: 1`) behind a `StepStreamer` port for tests.
3. Shared protocol (`src/features/assistant/protocol.ts`): request schema, SSE events (`meta`, `status`, `text`, `reset`, `block`, `error`, `done`), UI blocks (`hotel_cards`, `rate_cards`, `checkout_card`, `trip_cards`, `confirm_action`) with safe hrefs/images; SSE encoder/parser.
4. Untrusted data wrapping (`<hotel_data>`, `<hotel_reviews>`, `<trip_data>`), escaping, caps; `neutralizeTags` for user text.
5. Frozen system prompt; `buildVerifiedContext`.
6. Context resolution (search / hotel / trip with ownership / other) + hints.
7. Tools (strict schemas, Zod): `search_hotels`, `get_hotel_details`, `get_room_rates` (short `rate_ref` instead of offer tokens), `open_checkout` (never books), `list_my_trips`, `submit_check_in` and `create_guest_request` (drafts only).
8. Store (threads, messages, drafts, display history).
9. Loop (`run.ts`): `claude-sonnet-5-5`, `max_tokens` 1024, effort `medium`, `fallbacks: "default"`, cached system prompt; refusal / max_tokens / tool_use handling; ≤ 3 calls per step, ≤ 5 tool rounds then a final `tool_choice: none` answer; caps and a 100 s deadline; abort.
10. Routes: `POST /api/assistant` (same-origin, size, Zod, limits, SSE), `GET /api/assistant/context`, `GET /api/assistant/threads/[id]`, `POST …/actions/[id]/confirm|cancel`.
11. Deferred limits: prebook (30/h user, 1000/day all), book (5/h, 10/day user, 100/day all; only for new attempts), cancelTrip (10/h).
12. Logs without PII (tokens, cache, tools, stop reason, latency).
13. UI: provider with one conversation per tab, chat reducer, SSE hook with Stop/retry, panel (full-screen on phones, 400 px side panel, inline on the trip page), cards incl. confirm states.
14. Optional paid eval (never in CI; ask before running).
15. Docs.

## Tests
Loop with a mocked streamer (all stop reasons, caps, abort, request shape, prompt stability); tools (validation, anon restrictions, ownership, drafts only, rate_ref forgery); untrusted wrapping; context + hints; anon history; routes; confirm route; rate-limit keys; SSE; reducer; logger has no text. pgTAP for tables, RLS, `rate_limit_hit`, `confirm_assistant_action` (foreign, expired, idempotent, source, eligibility, duplicate, cap, invalid payload), `cancel_assistant_action`.

## Risks
`max_tokens` 1024 includes thinking at effort medium — watch truncation; abort detection on disconnect; append-only history because of thinking binding.

## Out of scope
Thread list UI, compaction, voice/files, booking/payment/cancel by chat, hotel-side handling, alerting, Upstash, paid eval in CI, CSP (stage 9).
