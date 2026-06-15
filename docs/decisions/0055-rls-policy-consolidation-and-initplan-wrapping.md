# 0055 — Consolidate permissive RLS policies and wrap auth calls in InitPlan subqueries

- **Status**: Accepted
- **Date**: 2026-06-15

## Context

The Supabase Performance Advisor raised ~19 `WARN`s across `partners`, `products`, and `submissions`, in two families:

- `auth_rls_initplan` (0003): bare `auth.uid()` / `is_admin(auth.uid())` inside a policy is re-evaluated per row instead of once per statement.
- `multiple_permissive_policies` (0006): a table accumulated several PERMISSIVE policies for the same role+action (e.g. `submissions` had three SELECT policies for `authenticated`), each of which Postgres must execute for every relevant row.

Both are PERFORMANCE-only and only bite at scale. Our tables are small today, so there is no measurable impact — but the policies grew one-per-feature (admin edit, internal read, on-behalf target) and the noise was crowding out signal in the advisor. Two of the Phase 8 SELECT policies were also created without a `to authenticated` clause, so they applied to PUBLIC and generated extra per-role lint rows.

## Options considered

- **Leave as-is.** Zero risk, but the advisor stays noisy and the per-feature policy sprawl normalizes ignoring it. Rejected — the fix is cheap and mechanical.
- **Wrap auth calls only, keep separate policies.** Clears `auth_rls_initplan` but leaves `multiple_permissive_policies`. Half a fix.
- **Consolidate + wrap (chosen).** One OR'd policy per role+action with every `auth.uid()` wrapped as `(select auth.uid())`. Clears both lints in a single migration.

## Decision

One consolidated PERMISSIVE policy per (role, action), with all auth calls wrapped in scalar subqueries. Permissive policies compose with `OR`, so collapsing N policies into one OR'd predicate is exactly equivalent. The `submissions` DELETE draft gate (ADR 0037) is preserved by keeping it on the self branch only: `(own AND draft) OR admin`. The two unscoped SELECT policies are re-scoped to `authenticated` (behaviour-neutral — `anon` has no table grant and `auth.uid()` is null for it). `submissions_select_internal` switches from an inline `EXISTS` to the `is_internal()` SECURITY DEFINER helper, identical in result and consistent with migration `20260605000004`.

## Consequences

**Positive:** advisor clean on these tables; one predicate per action instead of up to three; authorization logic reads top-to-bottom in one place; auth functions hoisted to InitPlan.

**Negative:** policy names changed (`submissions_select_authorized`, `submissions_update_authorized`, `submissions_delete_authorized`, `partners_select_self_admin_internal`) — any future migration or doc referencing the old names must use the new ones. A paired rollback restores the original set if needed.

**When to revisit:** if a future feature needs a genuinely independent policy (e.g. a RESTRICTIVE one, which does not OR), or if per-action authorization diverges enough that one predicate hurts readability more than the extra policy costs.
