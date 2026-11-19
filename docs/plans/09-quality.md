# Plan 09 — Quality: CSP, E2E, accessibility, responsive

Produced by the `planner` agent; condensed here.

## Decisions
1. **CSP: static header from `next.config.ts`, no nonces, enforced.** Nonces force every route dynamic and are incompatible with the PPR shell under `cacheComponents` (Next docs, "Static vs Dynamic Rendering with CSP"); the app has no inline scripts of its own, so `script-src 'self' 'unsafe-inline'` (the docs' "without nonces" policy). Accepted risk: XSS defence relies on React escaping, no `dangerouslySetInnerHTML`, sanitised supplier HTML. The CSP still gives `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, `frame-src 'none'` and a `connect-src` allowlist (self + our Supabase). No report-only phase (no collector): every E2E test fails on any `securitypolicyviolation` instead.
2. **E2E in two tiers.** `npm run e2e` — deterministic: mock LiteAPI serving the recorded sandbox fixtures, Anthropic unreachable, local Supabase; runs in CI; costs nothing. `npm run e2e:live` — opt-in, local only: real LiteAPI sandbox, one booking per run, cancelled through the app.
3. **The assistant is never called in E2E:** Anthropic base URL points at a sink that counts hits (asserted 0), daily caps 0, dummy key.
4. **Auth:** a throwaway user per run via the Supabase admin API (local only), signed in through the UI; the shared demo user is never written to.
5. **Ports:** 8781 app (`next start` on a fresh build, so the production CSP is tested), 8782 mock LiteAPI + Anthropic sink.

## Steps
1. `src/lib/csp.ts` `buildCsp({ dev, supabaseUrl })` (pure; origin only; ws/wss twin; dev adds `'unsafe-eval'` and `ws:`; `upgrade-insecure-requests` only for https Supabase) + tests; `next.config.ts` uses it.
2. Reduced motion in `globals.css`.
3. LiteAPI test seam: `LITEAPI_MOCK_ORIGIN` (loopback http only, refused on Vercel) → client hosts. Tests.
4. Playwright + axe; config with setup / mobile / tablet / desktop / live projects; mock server; global setup/teardown (seeded confirmed booking; cleanup; anthropicHits = 0); CSP-violation fixture.
5. Specs: booking flow at 375 (search → hotel → checkout → trip → check-in → request → cancel), hotel page at 1280, axe (light + dark, 375 + 1280, incl. dialogs), keyboard/focus, overflow at 320/375/768/1280.
6. CI `e2e` job (mock tier only); docs (CLAUDE.md ports/commands, README, SPEC §17, AI_LOG).
7. Manual checklist: VoiceOver, 200 % zoom, forced colors, real phone date inputs, preview console.

## Out of scope
Nonce/SRI CSP, report endpoint, WebKit/Firefox in CI, visual regression, Lighthouse automation, real model in E2E, live LiteAPI in CI.
