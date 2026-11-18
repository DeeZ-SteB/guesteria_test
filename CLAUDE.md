@AGENTS.md

# Guesteria Stay

Mobile-first hotel booking web app (Booking-style) with a digital concierge for the guest's trip.
Test assignment for Guesteria. Data source: LiteAPI (Nuitee). AI: Claude API.

## Stack
- Next.js 16 (App Router, `src/`), React 19, TypeScript, Tailwind 4
- Supabase: Auth + Postgres with RLS (local via Supabase CLI in Docker)
- Zod for every external input; Vitest for unit tests; pgTAP for RLS tests
- Deploy: Vercel (app) + Supabase Cloud (DB), via GitHub Actions

## Local ports (87xx block — other projects use 8110/8111, 85xx, 33090/33500, 6390/6550)
| Port | What |
|------|------|
| 8700 | Next.js dev on host (`npm run dev`) |
| 8701 | Next.js dev in Docker (`npm run docker:dev`) |
| 8780 | Production image (`npm run docker:up`) |
| 8721 | Supabase API |
| 8722 | Postgres |
| 8723 | Supabase Studio |
| 8724 | Mailpit (auth emails) |

Never use ports outside this block.

## Rules (non-negotiable)
1. External APIs (LiteAPI, Claude) are called ONLY from server code (`app/api/*`, Server Actions, `server-only` modules). Keys live in env, never `NEXT_PUBLIC_*`.
2. Every table holding user data has RLS. Clients never write `bookings`; the server does it with the secret key after LiteAPI confirms.
3. Before returning a LiteAPI booking, check it belongs to the current user via our `bookings` table.
4. Validate every request body, query string and API response with Zod.
5. New logic ships with a unit test in the same change. Schema change ships with a pgTAP test in `supabase/tests/`.
6. Mobile-first: design for 375px, check 768px.
7. UI copy is Ukrainian. Code, comments and commit messages are English.

## Commands
- `npm run lint` / `npm run typecheck` / `npm test` — must all pass before finishing
- `npx supabase test db` — RLS tests
- `npm run db:reset` — reapply migrations + seed

## Workflow
Features go through `/feature <name>` (see `.claude/commands/feature.md`): plan → implement → tests → independent review → PR.
Record every case where an agent was wrong or you overrode it in `docs/AI_LOG.md`.
