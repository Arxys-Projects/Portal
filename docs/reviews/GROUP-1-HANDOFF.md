# Group 1 handoff: Slice 1 done, Slice 2 next

Written 2026-10-19 at the end of the Slice 1 session. Read this after `BASELINE-PLAN.md`.

## State

- **Branch:** `claude/group-1-audit-preflight-n8s0yw`. It contains `origin/main` at `2ae9350`, which includes the 2026-10-16 Project Portal work. Merge `origin/main` again before starting, in case it has moved.
- **Slice 1 is complete:** report `2026-10-19-baseline-slice-1-data-access.md`, backlog `BASELINE-BACKLOG.md` (30 rows), live snapshot `2026-10-19-live-catalog-snapshot.md`.
- **Slice 1 verdict: BLOCK. The stop condition fired.** Andy has replied and approved continuing to Slice 2.
- **Andy's actions and decisions** are recorded in the backlog. The checks were clean. The test personas are deleted and leaked password protection is on. Four decisions are made.
- **Still open for a fix session (outside this audit):** B1-S-2 / B1-A-1 (partner-writable `submissions` columns, which allow Pipedrive deal overwrite) and B1-S-3 (`is_internal()` ignores suspension). Both must land before Project Portal Step 4.
- **The Project Portal brief** is at `docs/Portal-Project revamp/claude-code-brief-project-portal-backend.md`. A second copy of the plan sits beside it in that folder. `docs/reviews/BASELINE-PLAN.md` is the source of truth.
- **No Group 1 JOURNAL entry has been written yet.** It is part of the Group 1 finish.

## What Slice 1 already learned that Slice 2 needs

- `AUDIT-01-security.md` (repo root, 2026-06-11) is an earlier app-layer audit. Verify the status of its in-scope findings, especially M-1 (`registerDealAction`) and M-2 (open redirect in `next`), and tag them PRIOR.
- `vercel.json`, `.env.example` and CI config do not exist. `next.config.ts` sets no security headers.
- `node_modules` is absent in cloud sessions. tsc, lint and tests need an install, which the standing rules do not list.
- **Live evidence already in hand:**
  - Security Advisor: leaked password protection was off (now on).
  - Performance Advisor: Auth is capped at 10 absolute DB connections, so the dashboard checklist should cover switching to percentage-based.
- `suspendPartner` should also ban the Supabase Auth user (B1-S-3). Check this in Slice 2.
- **What worked in Slice 1:** run a separate read-only inventory agent beside the two reviewers. For Slice 2 it builds the service-role inventory, the role-check sites and the env var inventory.

## Slice 2 scope (rebuild with globs; files may have moved)

- **Proxy (Next 16, ADR 0009):** `src/proxy.ts`, `src/lib/supabase/proxy.ts`.
- **Supabase clients:** `src/lib/supabase/{admin,browser,server}.ts`.
- **Role and redirect helpers:** `src/lib/auth/{require-admin-or-internal,safe-next}.ts`.
- **Environment:** `src/lib/env.ts`, `process.env` readers in `src/`, `next.config.ts`, `.gitignore`, the `supabase/config.toml` `[auth]` section, and `package.json` / lockfile (for the version note only).
- **Layouts:** `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/(app)/layout.tsx` (suspend gate, onboarding), `src/app/(auth)/layout.tsx`, `src/app/(app)/admin/layout.tsx`, `src/app/(app)/price-book/layout.tsx`.
- **Auth routes:** `src/app/(auth)/**` (confirm, forgot-password, login, request-access, reset-password) and `src/app/(app)/_actions/logout.ts`.
- **Admin gating, invites and access requests:** `src/app/(app)/admin/{page.tsx,_components/admin-nav.tsx}`, `admin/partners/**`, `admin/requests/**`.
- **Service-role call sites** (for the inventory): `git grep -l "SERVICE_ROLE\|createAdminClient\|supabase/admin" -- src` (17 files at `6201569`).

## After Slice 2: Group 1 finish

1. Update the backlog with B2 rows.
2. Write one short JOURNAL entry for Group 1.
3. Commit only `docs/reviews/` and `docs/JOURNAL.md`.
4. Report per slice and recommend whether to proceed to Group 2.
