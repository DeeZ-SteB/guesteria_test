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
