-- Phase 3 Step 5: Submission lifecycle + preferred quote + status-guarded delete
--
-- Two additive columns on submissions:
--   1. status        — lifecycle stage. NULL = no status set (treated as draft
--                      for delete purposes). Managed by the partner.
--   2. is_preferred  — marks the partner's chosen quote for a project. At most
--                      one per (partner_id, LOWER(project_name)); the invariant
--                      is enforced in the Server Action (case-insensitive match
--                      on a free-text field rules out a DB partial unique index).
--
-- Two new RLS policies + grants on submissions:
--   - submissions_update_own   — partners update their own rows (row-level).
--                                Column-level restriction (only status +
--                                is_preferred may change) lives in the Server
--                                Action; RLS does row-level, the app does
--                                column-level (standard Supabase pattern).
--   - submissions_delete_own_draft — partners delete their own rows ONLY when
--                                status is draft or NULL. This is the A3
--                                hard-delete safety mechanism: even with an
--                                application bug, the DB refuses to delete a
--                                submission that carries business state
--                                (sent / won / lost / on-hold). See ADR 0037.
--
-- The initial schema granted only SELECT + INSERT to authenticated on
-- submissions; UPDATE + DELETE must be granted here or the new policies have
-- no privilege to act on (Postgres requires both the table grant AND a
-- permissive policy).

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------

alter table public.submissions
  add column status text default null
    check (status is null or status in ('draft', 'sent', 'won', 'lost', 'on-hold'));

alter table public.submissions
  add column is_preferred boolean not null default false;

comment on column public.submissions.status is
  'Lifecycle status. NULL = no status set (treated as draft for delete purposes). Managed by the partner.';

comment on column public.submissions.is_preferred is
  'True if this is the partner''s preferred quote for this project. At most one per (partner_id, LOWER(project_name)). Enforced at the application layer.';

-- ---------------------------------------------------------------------------
-- 2. Grants — authenticated needs UPDATE + DELETE for the new policies to act
-- ---------------------------------------------------------------------------

grant update, delete on public.submissions to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS policies
-- ---------------------------------------------------------------------------

-- Partners update only their own rows. (status + is_preferred are the only
-- columns the Server Action writes; RLS enforces ownership, not column scope.)
create policy submissions_update_own
on public.submissions for update
to authenticated
using (partner_id = auth.uid())
with check (partner_id = auth.uid());

-- Partners delete only their own rows, and only when the submission has no
-- business state yet (status draft or unset). DB-level guard for A3.
create policy submissions_delete_own_draft
on public.submissions for delete
to authenticated
using (
  partner_id = auth.uid()
  and (status is null or status = 'draft')
);
