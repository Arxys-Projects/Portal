-- ADR 0089 — partner logo system (storage half, migration B of B).
--
-- Creates the `partner-logos` Supabase Storage bucket and its access policies.
-- This is the FIRST use of Supabase Storage in this project (every prior image
-- is a version-controlled /public asset loaded via readFileSync — see
-- src/lib/pdf/assets.ts), so this migration establishes the pattern rather than
-- following one.
--
-- Read/write model (confirmed with Andy 2026-07-20):
--   * READ  = public. Logos are not secret; the bucket is public so the
--             dashboard <img> can use a public URL and the PDF render can fetch
--             bytes without a signed URL. An explicit public SELECT policy on
--             storage.objects makes the intent reviewable in one place.
--   * WRITE = admin only. Uploads run through the service-role admin client
--             (which bypasses RLS) gated by requireAdmin() in the server action;
--             the INSERT/UPDATE/DELETE policies below are defense-in-depth so a
--             non-service-role authenticated client still cannot write.
--
-- ⚠ STOP-AND-FLAG (standing rule + ADR 0089): creates a bucket and RLS policies
-- on storage.objects. The agent holds no DDL credentials. Andy applies this via
-- the Supabase dashboard SQL editor (which runs with the privilege to write the
-- storage schema); the CLI never auto-applies it. No data is touched.
-- Rollback: supabase/rollback/partner-logos-bucket-rollback.sql.

insert into storage.buckets (id, name, public)
values ('partner-logos', 'partner-logos', true)
on conflict (id) do nothing;

-- Public read of logo objects (bucket is public; this policy states it plainly).
drop policy if exists "partner_logos_public_read" on storage.objects;
create policy "partner_logos_public_read"
on storage.objects for select
to public
using (bucket_id = 'partner-logos');

-- Admin-only writes (defense-in-depth on top of the service-role upload path).
drop policy if exists "partner_logos_admin_insert" on storage.objects;
create policy "partner_logos_admin_insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'partner-logos' and public.is_admin((select auth.uid())));

drop policy if exists "partner_logos_admin_update" on storage.objects;
create policy "partner_logos_admin_update"
on storage.objects for update
to authenticated
using (bucket_id = 'partner-logos' and public.is_admin((select auth.uid())))
with check (bucket_id = 'partner-logos' and public.is_admin((select auth.uid())));

drop policy if exists "partner_logos_admin_delete" on storage.objects;
create policy "partner_logos_admin_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'partner-logos' and public.is_admin((select auth.uid())));
