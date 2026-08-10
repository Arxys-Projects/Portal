-- ADR 0118 — per-creator Pipedrive owner routing.
--
-- Adds a nullable pointer from a partner's own row to their numeric Pipedrive
-- user id. Only meaningful on the two rows for people who are actually
-- Pipedrive users (currently Andy Newbom and Richard Kershaw) — set via the
-- new "Pipedrive User ID" field on /admin/partners. Every other row (every
-- other internal user, every external partner) stays null, which
-- `resolveOwnerIdForCreator()` treats as "use the existing single-owner
-- default" — no behavior change for anyone without a stored id.
--
-- ⚠ STOP-AND-FLAG (standing rule + ADR 0118): schema change on a live table.
-- The agent holds no DDL credentials. Andy applies this via the Supabase
-- dashboard SQL editor; the CLI never auto-applies it. Column-only, additive,
-- nullable — no data is touched, so no backup/dry-run is required.
-- Rollback: supabase/rollback/partners-pipedrive-user-id-rollback.sql.
--
-- Apply the migration BEFORE the code deploys — see the apply note
-- (docs/apply-notes/0118-partners-pipedrive-user-id.md). The admin action
-- writes `pipedrive_user_id` directly; deploying the code first means every
-- edit on that field 404s against a column that doesn't exist yet. Unlike
-- ADR 0111's cameras-managed columns, this one does NOT block unrelated saves
-- on /admin/partners — the action only writes this one column, on its own
-- form submit, not the full parsed field set — but the field itself won't
-- work until the column exists.

alter table public.partners
  add column if not exists pipedrive_user_id integer;

comment on column public.partners.pipedrive_user_id is
  'ADR 0118: this partner''s own numeric Pipedrive user id, when they are a real Pipedrive user (currently only Andy Newbom and Richard Kershaw). Used to route the deal owner on submissions THEY create to themselves, instead of always defaulting to one name. Admin-set via /admin/partners. null = no stored id — resolveOwnerIdForCreator() falls back to the existing single-owner default for that submitter.';
