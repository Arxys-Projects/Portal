-- RLS performance-advisor consolidation (2026-06-15)
--
-- Clears the Supabase Performance Advisor WARNs on partners / products /
-- submissions. Two lints, both PERFORMANCE-only (no security change):
--
--   1. auth_rls_initplan (0003) — bare auth.uid() / is_admin(auth.uid()) in a
--      policy is re-evaluated once PER ROW. Wrapping the auth call in a scalar
--      subquery — (select auth.uid()) — lets the planner hoist it into an
--      InitPlan evaluated ONCE per statement. is_admin/is_internal are STABLE,
--      so wrapping their auth.uid() argument is enough; the function result is
--      then cached per distinct argument within the statement.
--
--   2. multiple_permissive_policies (0006) — several PERMISSIVE policies for the
--      same role+action are OR'd together, but Postgres must execute EACH one
--      per relevant row. Collapsing them into a single OR'd policy is exactly
--      equivalent (permissive policies compose with OR) and runs one predicate.
--
-- This is a pure rewrite of existing policies. The authorization logic is
-- byte-for-byte equivalent to the pre-consolidation set:
--   * partners SELECT  : self OR admin OR internal   (was 2 policies)
--   * submissions SELECT: own OR admin OR internal OR on-behalf-target (was 3)
--   * submissions UPDATE: own OR admin               (was 2)
--   * submissions DELETE: (own AND draft) OR admin   (was 2; draft gate, ADR 0037, preserved)
-- Single-policy actions (partners UPDATE, products SELECT, submissions INSERT)
-- are rewritten only to wrap the auth call.
--
-- Two SELECT policies added in Phase 8 (submissions_select_internal,
-- submissions_select_on_behalf_target) were created WITHOUT a `to authenticated`
-- clause, so they applied to PUBLIC — which is why the advisor flagged extra
-- roles (anon, authenticator, dashboard_user, ...). They are re-scoped to
-- `authenticated` here. Behaviour-neutral: anon holds no table grant on
-- submissions (revoked in the initial schema) and auth.uid() is null for anon,
-- so the predicate was already unreachable for those roles.
--
-- The submissions_select_internal predicate switches from an inline EXISTS on
-- public.partners to public.is_internal((select auth.uid())). Identical result
-- (is_internal IS that EXISTS), and the SECURITY DEFINER helper sidesteps any
-- partners-RLS recursion — same reasoning as migration 20260605000004.
--
-- What this migration deliberately does NOT change:
--   * which rows any role can see / mutate (authorization is identical);
--   * table grants, the is_admin / is_internal helpers, or their EXECUTE grants;
--   * server_specs — that table was dropped in 20260521190350, so it carries no
--     policy and was never flagged.

-- ---------------------------------------------------------------------------
-- partners — SELECT (consolidate self-or-admin + internal) + UPDATE (wrap)
-- ---------------------------------------------------------------------------

drop policy if exists partners_select_self_or_admin on public.partners;
drop policy if exists partners_select_internal      on public.partners;

create policy partners_select_self_admin_internal
on public.partners for select
to authenticated
using (
  id = (select auth.uid())
  or public.is_admin((select auth.uid()))
  or public.is_internal((select auth.uid()))
);

drop policy if exists partners_update_self_or_admin on public.partners;

create policy partners_update_self_or_admin
on public.partners for update
to authenticated
using (id = (select auth.uid()) or public.is_admin((select auth.uid())))
with check (id = (select auth.uid()) or public.is_admin((select auth.uid())));

-- INSERT and DELETE remain unexposed to authenticated (service_role only).

-- ---------------------------------------------------------------------------
-- products — SELECT (wrap)
-- ---------------------------------------------------------------------------

drop policy if exists products_select_active_or_admin on public.products;

create policy products_select_active_or_admin
on public.products for select
to authenticated
using (active = true or public.is_admin((select auth.uid())));

-- ---------------------------------------------------------------------------
-- submissions — SELECT (consolidate own-or-admin + internal + on-behalf-target)
-- ---------------------------------------------------------------------------

drop policy if exists submissions_select_own_or_admin       on public.submissions;
drop policy if exists submissions_select_internal           on public.submissions;
drop policy if exists submissions_select_on_behalf_target   on public.submissions;

create policy submissions_select_authorized
on public.submissions for select
to authenticated
using (
  partner_id = (select auth.uid())
  or public.is_admin((select auth.uid()))
  or public.is_internal((select auth.uid()))
  or on_behalf_of_partner_id = (select auth.uid())
);

-- ---------------------------------------------------------------------------
-- submissions — INSERT (wrap)
-- ---------------------------------------------------------------------------

drop policy if exists submissions_insert_self on public.submissions;

create policy submissions_insert_self
on public.submissions for insert
to authenticated
with check (partner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- submissions — UPDATE (consolidate own + admin)
-- ---------------------------------------------------------------------------

drop policy if exists submissions_update_own   on public.submissions;
drop policy if exists submissions_update_admin on public.submissions;

create policy submissions_update_authorized
on public.submissions for update
to authenticated
using (partner_id = (select auth.uid()) or public.is_admin((select auth.uid())))
with check (partner_id = (select auth.uid()) or public.is_admin((select auth.uid())));

-- ---------------------------------------------------------------------------
-- submissions — DELETE (consolidate own-draft + admin; draft gate preserved)
-- ---------------------------------------------------------------------------

drop policy if exists submissions_delete_own_draft on public.submissions;
drop policy if exists submissions_delete_admin     on public.submissions;

create policy submissions_delete_authorized
on public.submissions for delete
to authenticated
using (
  (partner_id = (select auth.uid()) and (status is null or status = 'draft'))
  or public.is_admin((select auth.uid()))
);
