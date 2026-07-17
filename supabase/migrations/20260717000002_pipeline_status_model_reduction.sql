-- ADR 0081 — Pipeline status model reduction.
--
-- Reduce submissions.status from the six aspirational values
-- (draft/sent/won/lost/on-hold + NULL) to three: open (default) / won / lost.
-- Every non-terminal row folds into 'open'. Portal-only column; not synced to
-- Pipedrive, so no CRM desync risk (confirmed 2026-07-15, ADR 0081).
--
-- Live distribution at migration time (dry-run 2026-07-17): 60 draft + 8 sent,
-- 0 won, 0 lost, 0 null → all 68 rows fold to 'open'.
--
-- Record-touching: run behind a backup (scripts/backup-tables.ts) and the
-- read-only dry-run (scripts/dry-run-status-migration.ts). Rollback recipe in
-- supabase/rollback/pipeline-status-model-reduction-rollback.sql.

-- ---------------------------------------------------------------------------
-- 1. Drop the old CHECK first.
--    The pre-existing constraint forbids 'open', so the data UPDATE below would
--    violate it if the constraint were still in place. Order matters.
-- ---------------------------------------------------------------------------
alter table public.submissions
  drop constraint if exists submissions_status_check;

-- ---------------------------------------------------------------------------
-- 2. Data migration — fold every non-terminal row into 'open'.
--    `is distinct from` treats NULL as an ordinary value, so NULL rows fold too.
-- ---------------------------------------------------------------------------
update public.submissions
  set status = 'open'
  where status is distinct from 'won'
    and status is distinct from 'lost';

-- ---------------------------------------------------------------------------
-- 3. Constrain the domain: default 'open', NOT NULL, reduced CHECK.
--    NOT NULL is safe now — step 2 guarantees no NULL rows remain.
-- ---------------------------------------------------------------------------
alter table public.submissions alter column status set default 'open';
alter table public.submissions alter column status set not null;
alter table public.submissions
  add constraint submissions_status_check
  check (status in ('open', 'won', 'lost'));

-- ---------------------------------------------------------------------------
-- 4. Delete-guard (A3, ADR 0037) — remap the old draft/NULL guard to 'open'.
--    Partners may hard-delete their own NON-TERMINAL (open) rows; won/lost are
--    protected. Admins unaffected (is_admin branch). Behavior change: former
--    'sent' rows are now 'open' and therefore become partner-deletable.
-- ---------------------------------------------------------------------------
drop policy if exists submissions_delete_authorized on public.submissions;
create policy submissions_delete_authorized
on public.submissions for delete
to authenticated
using (
  (partner_id = (select auth.uid()) and status = 'open')
  or public.is_admin((select auth.uid()))
);

-- ---------------------------------------------------------------------------
-- 5. Refresh the column comment.
-- ---------------------------------------------------------------------------
comment on column public.submissions.status is
  'Lifecycle status: open (default) | won | lost. Portal-only; not synced to Pipedrive. (ADR 0081)';
