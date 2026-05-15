# 0004 — Supabase CLI for migrations; no GitHub auto-apply

- **Status**: Accepted
- **Date**: 2026-05-15

## Context

The portal's schema lives in Postgres at Supabase. We need a way to author, version, and apply schema changes. Three flows are available:

1. **Supabase SQL Editor** in the dashboard — paste SQL, click Run.
2. **Supabase CLI** — `supabase migration new` produces a timestamped file in `supabase/migrations/`, `supabase db push` applies it.
3. **GitHub integration** — Supabase auto-applies any new file in `supabase/migrations/` whenever you push to `main`.

## Options considered

- **SQL Editor only.** Fastest path, no install. But migrations live in the dashboard, not in git. Recreating a project from scratch becomes "open a dashboard, paste a SQL block we hopefully kept somewhere." Replayability across environments (staging, dev) is awkward.
- **CLI, applied manually with `supabase db push`.** Migrations are git-tracked, replayable. One explicit step to apply (no surprises).
- **CLI + GitHub auto-apply.** Migrations apply on every push to `main`. Great for teams with mature CI/CD. Risky for a single-developer project on one environment: a typo in a migration silently runs against production at push time.

## Decision

**CLI for authoring, `supabase db push` for applying, no GitHub auto-apply for Phase 1.**

- Migrations live in `supabase/migrations/` and are committed.
- Applying is a deliberate step: `SUPABASE_DB_PASSWORD='...' supabase db push`. The DB password is passed via env so the prompt doesn't hang in non-interactive contexts.
- CLI is authenticated via Personal Access Token (`supabase login --token sbp_...`). The browser-based login flow has been unreliable.

## Consequences

**Positive:**
- Schema history lives in git alongside the code that uses it.
- The migration file is the source of truth — easy to replay against a fresh project for disaster recovery or staging.
- No risk of an accidental commit triggering schema changes in production.

**Negative:**
- One extra command to remember (`supabase db push`). Documented in the [Runbook](../RUNBOOK.md#10-day-to-day-commands).
- CLI requires Docker for some commands (`db dump`, `start`). We don't run Docker on the dev machine; we use the cloud Supabase project directly for everything. Verification is via `db push` output + the test-rls script + curl introspection — not `db dump`.

## When to revisit

When we add a staging Supabase project. At that point, GitHub auto-apply *to staging only* would be a reasonable next step, with prod still gated by manual `db push`.
