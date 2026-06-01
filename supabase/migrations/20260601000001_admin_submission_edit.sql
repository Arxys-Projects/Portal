-- Admin submission edit + delete
--
-- The Phase 3 Step 5 migration added UPDATE/DELETE policies scoped to
-- partner_id = auth.uid(). Admins need to update status on any submission
-- and delete any submission (no draft-only restriction). Two additive
-- permissive policies — Postgres OR-combines them with the existing partner
-- policies.

-- Admin can set status on any submission.
create policy submissions_update_admin
on public.submissions for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

-- Admin can delete any submission regardless of status.
create policy submissions_delete_admin
on public.submissions for delete
to authenticated
using (public.is_admin(auth.uid()));
