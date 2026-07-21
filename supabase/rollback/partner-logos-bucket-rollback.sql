-- Rollback for 20260721000002_partner_logos_bucket.sql (ADR 0089, migration B).
--
-- Removes the partner-logos Storage policies and bucket. Run in the Supabase
-- dashboard SQL editor (kept out of supabase/migrations/ so the CLI never
-- auto-applies it).
--
-- ORDER MATTERS: a bucket cannot be deleted while it still holds objects. If
-- any logos have been uploaded, delete the objects first (dashboard Storage UI,
-- or: delete from storage.objects where bucket_id = 'partner-logos';) before
-- running the bucket delete below.

drop policy if exists "partner_logos_public_read"   on storage.objects;
drop policy if exists "partner_logos_admin_insert"  on storage.objects;
drop policy if exists "partner_logos_admin_update"  on storage.objects;
drop policy if exists "partner_logos_admin_delete"  on storage.objects;

-- Only succeeds when the bucket is empty (see ORDER MATTERS above).
delete from storage.buckets where id = 'partner-logos';
