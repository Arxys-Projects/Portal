-- Rollback for 20260721000001_partners_logo_path.sql (ADR 0089, migration A).
--
-- Drops the partners.logo_path column. Schema-only; the forward migration
-- touched no rows. Run in the Supabase dashboard SQL editor (kept out of
-- supabase/migrations/ so the CLI never auto-applies it).
--
-- Order note: this only removes the pointer column. The Storage bucket and its
-- objects are torn down separately by partner-logos-bucket-rollback.sql.

alter table public.partners
  drop column if exists logo_path;
