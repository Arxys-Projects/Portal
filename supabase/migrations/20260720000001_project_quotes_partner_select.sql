-- ADR 0083 — Partner visibility of own Project Quotes.
--
-- Scoped reversal of the ADR 0059 internal-only wall: the OWNING partner may
-- now SELECT their own project_quotes rows (read-only; INSERT stays
-- internal-only and the table remains immutable — no UPDATE/DELETE grants).
--
-- Owner linkage (confirmed 2026-07-20): project_quotes has no owner column;
-- ownership is transitive via the submission —
--   project_quotes.submission_id → submissions.partner_id          (creator)
--                                → submissions.on_behalf_of_partner_id (target)
-- The EXISTS subquery below matches exactly the set of submissions the caller
-- can already SELECT under submissions RLS (own + on-behalf-target rows).
--
-- ⚠ STOP-AND-FLAG (standing rule + ADR 0083 gate): this is a security-boundary
-- change on a table holding partner pricing and customer PII. Manual review
-- required before apply; no `supabase db push` by the agent. Apply via the
-- dashboard SQL editor. Rollback: supabase/rollback/
-- project-quotes-partner-select-rollback.sql. Policy-only change — no data is
-- touched, so no backup/dry-run is required.
--
-- After apply, verify with: RUN_0083_TESTS=1 npx tsx scripts/test-rls.ts
-- (tests 20a-20d: owner-positive, cross-partner-negative, on-behalf-positive).

drop policy if exists project_quotes_select_internal on public.project_quotes;

create policy project_quotes_select_internal_or_owner
on public.project_quotes for select
to authenticated
using (
  public.is_internal((select auth.uid()))
  or public.is_admin((select auth.uid()))
  or exists (
    select 1
    from public.submissions s
    where s.id = project_quotes.submission_id
      and (
        s.partner_id = (select auth.uid())
        or s.on_behalf_of_partner_id = (select auth.uid())
      )
  )
);

comment on policy project_quotes_select_internal_or_owner on public.project_quotes is
  'ADR 0083: internal/admin read everything; the owning partner (submission creator or on-behalf target) reads their own quotes. Pricing appears only inside the rendered PDF, never as portal UI.';
