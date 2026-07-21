-- ADR 0089 — partner logo system (schema half, migration A of B).
--
-- Adds a nullable pointer from the partner/company record to its logo object in
-- the `partner-logos` Storage bucket (created by migration B,
-- 20260721000002_partner_logos_bucket.sql). The value is a Storage object path
-- (e.g. "<partner-id>/logo.png"), NOT a URL and NOT the image bytes. Documents
-- resolve the logo live from the submission's owning partner at download time
-- (see ADR 0089 §5); null = no logo, and the header renders a blank slot with
-- no layout shift.
--
-- ⚠ STOP-AND-FLAG (standing rule + ADR 0089): schema change on a live table.
-- The agent holds no DDL credentials (2026-07-17 CLI 401). Andy applies this
-- via the Supabase dashboard SQL editor; the CLI never auto-applies it.
-- Column-only, additive, nullable — no data is touched, so no backup/dry-run is
-- required. Rollback: supabase/rollback/partners-logo-path-rollback.sql.

alter table public.partners
  add column if not exists logo_path text;

comment on column public.partners.logo_path is
  'ADR 0089: Storage object path in the partner-logos bucket for this partner''s logo (rendered on the Project Quote, Customer Proposal, and their own dashboard). Admin-set via the partners admin UI. null = no logo attached.';
