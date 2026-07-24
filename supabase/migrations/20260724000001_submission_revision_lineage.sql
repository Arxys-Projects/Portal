-- ADR 0093 step 2 — submission revision lineage.
--
-- Purely additive: one nullable self-referencing FK, no data migration, no
-- existing column touched. Every calculator "revise" submit already knows its
-- source row id (ADR 0039); this just banks it so grouping/status no longer
-- depend on a fragile (partner, project_name) text match (ADR 0093).
--
-- on delete set null rather than cascade: deleting a source draft must never
-- cascade-delete the revision that superseded it.

alter table public.submissions
  add column parent_submission_id uuid references public.submissions(id) on delete set null;

create index submissions_parent_submission_idx
  on public.submissions(parent_submission_id)
  where parent_submission_id is not null;

comment on column public.submissions.parent_submission_id is
  'Revision lineage (ADR 0093 step 2). Set to the source submission''s id when '
  'this row was created via calculator ?revise=. Null for a fresh (non-revision) '
  'submission. A row referenced here as a parent is "superseded" — still status '
  '= open in its own right, but grouping/pipeline totals treat the newest leaf '
  'in the chain as the live one.';
