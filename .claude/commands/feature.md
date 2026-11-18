---
description: Run the full agent pipeline for one feature (plan → build → test → independent review → PR)
argument-hint: <feature description>
---
Implement this feature through the project pipeline: $ARGUMENTS

1. **Plan.** Invoke the `planner` agent with the feature description. Save its plan to `docs/plans/<kebab-name>.md`. Show me the plan and wait for my approval before writing code.
2. **Branch.** `git switch -c feat/<kebab-name>` from an up-to-date `main`.
3. **Build.** Implement the plan step by step, committing after each step (Conventional Commits).
4. **Test.** Invoke the `test-writer` agent for the new logic. Make sure `npm run lint`, `npm run typecheck`, `npm test` and (if SQL changed) `npx supabase test db` pass.
5. **Review.** Invoke `code-reviewer` and `security-auditor` in parallel. Give them only the instruction to review `git diff main...HEAD` — not your reasoning.
6. **Fix.** Fix every HIGH and MEDIUM finding. For each finding you reject, write why. Append a short entry to `docs/AI_LOG.md`: what the agents found, what you accepted, what you rejected and why.
7. **PR.** Push and open a PR with `gh pr create`. The body contains: link to the plan, summary of changes, test list, the reviewers' findings table with the resolution of each, and how to check it manually on mobile.
