# Plan 01 — Design system, app shell, auth (+ demo)

Produced by the `planner` agent from SPEC §14 stage 1. Approved for implementation (SPEC v2 approved by the owner).

## Goal
Stage 1 shell: design tokens, core UI kit, responsive header/tab bar, responsive Sheet/Modal, Supabase email+password auth with demo login in an auth modal; `/account*` protected server-side.

## Steps
1. **Tokens** — `globals.css`: raw vars on `:root` + dark under `prefers-color-scheme`, mapped via `@theme inline`; `color-scheme: light dark`; global `:focus-visible` ring. No theme script (no stored preference).
2. **Deps** — `lucide-react`.
3. **UI kit** `src/components/ui/`: `Button` (primary|outline|ghost|icon, md|lg, loading, fullWidth, ≥44px), `Input` (label, error, password eye toggle, aria-invalid/-describedby), `Tabs` (segmented, role=tablist), `Sheet` (native `<dialog>.showModal()`: bottom sheet <768, centered 440px ≥768, safe-area), `Skeleton`, `EmptyState`/`ErrorState`, `Avatar`. Toast deferred.
4. **Helpers + tests** — `lib/initials.ts`, `lib/return-to.ts` (`safeReturnTo`: only `/`-relative, rejects `//`, `/\`, schemes, control chars, >512, strips `auth`/`next`), `lib/auth-routes.ts` (`isProtectedPath`).
5. **Server DAL** — `server/env.ts` (Zod, server-only: `DEMO_EMAIL`, `DEMO_PASSWORD`), `server/auth.ts`: `getCurrentUser()` (React `cache()`, `getClaims()`, narrow DTO), `requireUser(returnTo)` → redirect `/?auth=signin&next=…`. No `use cache: private` (stale avatar after sign-out risk).
6. **Proxy gate** — `updateSession` returns `{response, claims}`; `proxy.ts` redirects protected paths when no claims, preserving cookies. Proxy is optimistic only; pages still `requireUser`.
7. **Auth schemas/errors + tests** — `features/auth/schemas.ts` (Ukrainian messages; email trimmed/lowercased; password ≥8; name 1–50), `features/auth/errors.ts` (Supabase error code → Ukrainian copy).
8. **Server Actions** — `signIn`, `signUp`, `signInAsDemo` with `useActionState` shape `{error?, fieldErrors?}`, redirect to `safeReturnTo(next)`; `signUp` stores `first_name`, detects existing email (`identities.length === 0`), returns «Перевірте пошту» when confirmations are on; `signOut` → `/`.
9. **Auth modal** — client provider `useAuthModal().open({tab, next})`; URL opener for `?auth=&next=` inside Suspense; `AuthSheet` = Sheet + Tabs + forms + demo button.
10. **Shell** — `Header` (≥768) with `UserMenu` server component in Suspense; `TabBar` (<768) active from pathname/search params; `Footer` (≥768); `AssistantFab` (stub sheet «з'явиться незабаром»); layout viewport `viewportFit: cover`, `themeColor`, bottom padding for tab bar + safe area.
11. **Routes** — `/account` (Suspense → `requireUser`), `/account/trips/[bookingId]` placeholder (Zod param, `requireUser`), `account/loading.tsx`, `error.tsx`, `not-found.tsx`. Every cookies/params/searchParams read inside Suspense (cacheComponents).
12. **Demo user** — `scripts/ensure-demo-user.mjs` + `npm run demo:ensure` (admin API, idempotent, `email_confirm: true`); env in `.env.example`, README.

## Data & security
No schema change. Server-only demo creds and secret key. Zod on all inputs. `safeReturnTo` on every redirect. httpOnly cookies; `requireUser` on protected pages.

## Tests
`return-to`, `initials`, `auth-routes`, `auth/schemas`, `auth/errors` (Vitest). No pgTAP (no schema change).

## Done when
- lint, typecheck, test, build green (no uncached-data-outside-Suspense errors)
- 375 px: tab bar (4 tabs, active state), FAB above it, safe area, no horizontal scroll at 320 px; ≥768: header + footer
- Sheet: bottom <768, centered ≥768, Esc/close, focus trapped
- `/account` signed out → modal over `/`; after sign-in → `/account`
- Sign-up / sign-in / demo / sign-out work; initials in header; Ukrainian errors
- `?next=//evil.com` → `/`
- Light/dark follow OS; visible focus; skeleton + ErrorState with retry

## Out of scope
LiteAPI, search, hotel, favorites logic, AI logic, Toast, profile editing, CSP (stage 9), trip ownership (stage 7), theme toggle.

## Notes
- Planner flagged SPEC conflict: §4 said tab bar < 1024, §8 says header from 768. Resolved to 768; SPEC §4 updated.
