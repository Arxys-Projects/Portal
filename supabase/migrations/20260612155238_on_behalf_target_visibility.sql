-- Phase 8 — per-user on-behalf target visibility.
--
-- When an internal user runs a calculation on behalf of a named partner, that
-- partner is recorded in submissions.on_behalf_of_partner_id (an FK to
-- partners, set only for the picker path). Until now RLS keyed solely on the
-- creator (partner_id = auth.uid()), so the partner the work was prepared for
-- could not see it. This grants the named partner read access to those rows.
--
-- Per-user, SELECT-only, and purely additive:
--   * Per-user — only the partner whose id equals on_behalf_of_partner_id, not
--     every user at that company. on_behalf_of_partner_id is a single user id.
--   * SELECT-only — the partner revises by reading the source row and saving a
--     fresh row they already own (the immutable-plus-revision model, ADR 0017 /
--     Phase 4 Step 3). No UPDATE or DELETE grant is needed or wanted.
--   * Additive — Postgres OR's permissive SELECT policies, so this composes
--     with submissions_select_own_or_admin and submissions_select_internal
--     without altering either. No mutating policy changes.
--
-- The predicate mirrors submissions_select_own_or_admin's caller mapping
-- (partner_id = auth.uid()), since partners.id IS auth.uid() and
-- on_behalf_of_partner_id is a second FK to partners(id). The free-text
-- fallback (on_behalf_of_company_name) sets no FK and therefore grants no
-- visibility, exactly as before — a company with no portal user has no user to
-- grant to.

create policy submissions_select_on_behalf_target on public.submissions
  for select
  using (on_behalf_of_partner_id = auth.uid());
