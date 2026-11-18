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
