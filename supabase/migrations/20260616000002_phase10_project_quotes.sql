-- Phase 10 / Project Quote Step 5a — project_quotes snapshot table.
--
-- Stores one immutable, fully self-contained snapshot per generated Project
-- Quote. A Project Quote unifies the portal's sizing half (resolved from the
-- submission) with the deal's commercial half (read live from Pipedrive at
-- generation) plus the in-force T&Cs. Unlike the System Estimate, which renders
-- on read from the live submission row (ADR 0017), a Project Quote MUST
-- reproduce the exact numbers and terms that were presented even after the
-- deal, the catalog, or the T&Cs change afterward, so it freezes everything the
-- four-page document needs into `snapshot` (jsonb) at generation. The frozen
-- shape is the integrity premise of the feature. See ADR 0059 / 0060 / 0061.
--
-- Versioning: each generation inserts a new row with version = max(version)+1
-- for that submission, enforced by unique (submission_id, version). "Current" is
-- DERIVED at query time as the max version for a submission; there is no
-- is_current column, so there is no demote step and no concurrency race
-- (ADR 0061). The derived-current read is documented below, not a view.
--
-- Immutability: a quote is never edited; a revision is a new version row. The
-- table grants SELECT and INSERT only (no UPDATE / DELETE), so with RLS enabled
-- those actions are denied by default for every authenticated user. No explicit
-- restrictive deny policy is added: the repo gates access via grants plus
-- permissive policies (camera_specs / submissions), and an ungranted action is
-- already unreachable.
--
-- Sensitivity: a row holds customer PII (linked organization / person) and full
-- pricing. Reads are restricted to INTERNAL users (is_internal OR is_admin), NOT
-- opened to all authenticated partners like the read-open camera_specs /
-- product_specs reference tables. The Project Quote is an internal-generated
-- document (ADR 0059).

create table public.project_quotes (
  id                uuid primary key default gen_random_uuid(),
  -- The owning submission. on delete restrict protects the issued-quote audit
  -- trail: a submission that has generated quotes cannot be silently deleted
  -- out from under them (mirrors submissions.partner_id's on delete restrict).
  submission_id     uuid not null references public.submissions(id) on delete restrict,
  -- The deal snapshotted. bigint matches submissions.pipedrive_deal_id.
  pipedrive_deal_id bigint not null,
  -- Monotonic per submission; the assembly computes max(version)+1.
  version           integer not null check (version >= 1),
  -- The full frozen shape (commercial + sizing + showcase + terms + meta).
  snapshot          jsonb not null,
  -- Queryable mirror of snapshot.terms.version, so an auditor can see which
  -- T&Cs went out without unpacking the jsonb. The full terms text is frozen
  -- inside snapshot.terms (ADR 0060 reasoning extends to legal text).
  terms_version     text not null,
  -- Logical generation time; expiry is computed at render as this plus
  -- validity_days. No "expired" flag is stored (ADR 0061).
  generated_at      timestamptz not null default now(),
  -- The validity window (days) in force at generation, frozen so shortening the
  -- configurable constant later cannot change an already-issued quote's expiry.
  validity_days     integer not null check (validity_days > 0),
  -- The internal user who generated the quote (partners.id = auth.uid()).
  generated_by      uuid not null references public.partners(id) on delete restrict,
  -- Row insert time (audit), distinct from the logical generated_at.
  created_at        timestamptz not null default now(),
  constraint project_quotes_submission_version_key unique (submission_id, version)
);

-- The unique (submission_id, version) index also backs the derived-"current"
-- read and per-submission version history, so no separate (submission_id,
-- version) index is needed. Derived-current query (no stored flag):
--   select * from public.project_quotes
--   where submission_id = $1 order by version desc limit 1;

-- Audit / lookup by the snapshotted deal across submissions.
create index project_quotes_deal_idx on public.project_quotes(pipedrive_deal_id);

-- ---------------------------------------------------------------------------
-- RLS — INTERNAL-ONLY. Distinct from the read-open reference tables: a row
-- holds pricing and customer PII, so SELECT is gated on is_internal OR is_admin
-- (admins are covered explicitly in case an admin is not separately flagged
-- internal, per ADR 0059). INSERT uses the same gate plus generated_by must be
-- the acting user (mirrors submissions_insert_self). auth.uid() is wrapped as a
-- scalar subquery per the InitPlan consolidation (ADR 0055). There is no
-- UPDATE / DELETE policy: those actions are ungranted, so RLS denies them.
-- ---------------------------------------------------------------------------

alter table public.project_quotes enable row level security;
revoke all on public.project_quotes from anon, authenticated;
grant select, insert on public.project_quotes to authenticated;

create policy project_quotes_select_internal
on public.project_quotes for select
to authenticated
using (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())));

create policy project_quotes_insert_internal
on public.project_quotes for insert
to authenticated
with check (
  (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())))
  and generated_by = (select auth.uid())
);
