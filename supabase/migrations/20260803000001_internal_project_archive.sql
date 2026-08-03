-- ADR 0112 — internal project archive, as a side table rather than columns on
-- `submissions`.
--
-- `/projects` (the internal sales surface) needs a reversible "hide this from my
-- queue" gesture. The spec's requirements are precise: internal-only, invisible
-- to partners, undoable in one click from the row, allowed on an OPEN deal, and
-- it must not touch Pipedrive or the quote/version history. Nothing is deleted.
--
-- WHY NOT two columns on `submissions` (internal_archived_at / _by), which is
-- the obvious shape and the one the data contract's field names imply:
--
--   1. RLS on `submissions` is ROW-level, and `submissions_update_own` lets a
--      partner UPDATE any column of their own row. PostgREST accepts an
--      arbitrary column list, so a partner could set or clear an internal
--      archive flag on their own submission. The column-scope restriction this
--      repo relies on lives in the Server Actions, which a direct API call does
--      not go through. That is an integrity hole, not a theoretical one.
--   2. `submissions_select_own_or_admin` likewise lets a partner SELECT any
--      column of their own row, so "never visible to partners" would not hold.
--
-- A side table gated internal-only fixes both by construction: `authenticated`
-- gets no grant a partner can reach, so the rows are unreadable AND unwritable
-- by partners in exactly the way `project_quotes` already is. That is the
-- precedent this follows — same is_internal-or-is_admin gate, same scalar
-- auth.uid() subquery per ADR 0055.
--
-- WHOSE ARCHIVE IS IT: one global internal archive, not one per internal user.
-- The primary key is the submission id alone, so a submission is archived or it
-- is not, and `archived_by` records who did it (which is what lets the row copy
-- read "Archived today at 9:51 AM by you" versus naming someone else). There is
-- one internal sales user today and the data contract's fields are scalar; a
-- per-user archive would need (submission_id, user_id) as the key and a
-- viewer-scoped join on every read for no benefit anyone can currently observe.
-- If a second internal user ever disagrees about what belongs in the queue, the
-- migration is mechanical: widen the primary key and backfill one row per
-- existing entry. Recorded in ADR 0112 as the revisit condition.
--
-- GRANULARITY: a `/projects` row is a PROJECT (company + project name, merged by
-- revision lineage), which has no row of its own anywhere — it is derived in
-- code by groupIntoDeals(). So the archive is stored per SUBMISSION and the
-- archive action stamps every submission in the project's bucket. A project
-- reads as archived when its REPRESENTATIVE submission is archived, which means
-- a genuinely new revision (a new, unstamped submission that becomes the new
-- leaf) correctly resurfaces the project. See src/lib/projects/rows.ts.

create table public.submission_internal_archives (
  -- One row per archived submission; the presence of the row IS the archived
  -- state. Un-archiving is a DELETE, which is why the DELETE grant below exists.
  --
  -- on delete cascade, unlike project_quotes.submission_id's on delete restrict:
  -- an archive entry is a personal view preference, not an audit trail of a
  -- document that went to a customer. Once the submission is gone there is
  -- nothing left to hide, and blocking a submission delete because someone once
  -- tidied their queue would be absurd.
  submission_id uuid primary key references public.submissions(id) on delete cascade,
  archived_at   timestamptz not null default now(),
  -- The internal user who archived it (partners.id = auth.uid()). on delete
  -- restrict mirrors project_quotes.generated_by: the attribution the row copy
  -- renders must not silently become null.
  archived_by   uuid not null references public.partners(id) on delete restrict
);

-- The queue loads every archive entry for the submissions it is showing
-- (`.in('submission_id', ids)`), which the primary key already serves. This
-- index instead serves the "who archived what" direction, which the row copy
-- and any future per-user variant need.
create index submission_internal_archives_by_idx
  on public.submission_internal_archives(archived_by);

comment on table public.submission_internal_archives is
  'ADR 0112 — internal-only, reversible "hide from my queue" marker for the '
  '/projects surface. Presence of a row = archived; un-archive is a DELETE. '
  'Deliberately NOT columns on submissions: partners can UPDATE and SELECT '
  'arbitrary columns of their own submission rows through PostgREST, so a flag '
  'stored there would be both partner-visible and partner-writable. Stamped on '
  'every submission in a project bucket; a project reads as archived when its '
  'representative submission is archived.';

-- ---------------------------------------------------------------------------
-- RLS — INTERNAL-ONLY, modelled on project_quotes (20260616000002).
--
-- SELECT / INSERT / DELETE are all gated on is_internal OR is_admin (admins
-- covered explicitly in case an admin is not separately flagged internal, per
-- ADR 0059). INSERT additionally requires archived_by to be the acting user, so
-- attribution cannot be forged (mirrors submissions_insert_self and
-- project_quotes_insert_internal).
--
-- DELETE is NOT restricted to the user who archived it. The archive is global
-- (see above), so whoever can archive can un-archive; restricting undo to the
-- original archiver would leave rows nobody present can restore.
--
-- There is no UPDATE policy: an archive entry has nothing to amend. Re-archiving
-- an already-archived submission is an upsert on the primary key, which needs
-- UPDATE, so the grant and policy below cover exactly that case and nothing
-- else — the only column it can change is archived_at / archived_by to the
-- acting user's own values.
--
-- auth.uid() is wrapped as a scalar subquery per the InitPlan consolidation
-- (ADR 0055).
-- ---------------------------------------------------------------------------

alter table public.submission_internal_archives enable row level security;
revoke all on public.submission_internal_archives from anon, authenticated;
grant select, insert, update, delete on public.submission_internal_archives to authenticated;

create policy submission_internal_archives_select_internal
on public.submission_internal_archives for select
to authenticated
using (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())));

create policy submission_internal_archives_insert_internal
on public.submission_internal_archives for insert
to authenticated
with check (
  (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())))
  and archived_by = (select auth.uid())
);

-- Covers the re-archive upsert only. `with check` re-asserts the attribution
-- rule so an update cannot reassign the entry to somebody else.
create policy submission_internal_archives_update_internal
on public.submission_internal_archives for update
to authenticated
using (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())))
with check (
  (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())))
  and archived_by = (select auth.uid())
);

create policy submission_internal_archives_delete_internal
on public.submission_internal_archives for delete
to authenticated
using (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())));
