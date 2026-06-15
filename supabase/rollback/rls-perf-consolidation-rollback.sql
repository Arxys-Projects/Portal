-- Rollback for 20260615000001_rls_perf_consolidation.sql
--
-- Restores the pre-consolidation policy set EXACTLY as it stood across:
--   initial_schema (20260515193702), admin_submission_edit (20260601000001),
--   step5_submission_lifecycle (20260527182010),
--   internal_user_read_submissions (20260604000002),
--   on_behalf_target_visibility (20260612155238),
--   fix_partners_internal_recursion (20260605000004).
-- Authorization is identical either way; this only reverts the shape.

-- --- drop the consolidated policies ---------------------------------------

drop policy if exists partners_select_self_admin_internal on public.partners;
drop policy if exists partners_update_self_or_admin       on public.partners;
drop policy if exists products_select_active_or_admin      on public.products;
drop policy if exists submissions_select_authorized        on public.submissions;
drop policy if exists submissions_insert_self              on public.submissions;
drop policy if exists submissions_update_authorized        on public.submissions;
drop policy if exists submissions_delete_authorized        on public.submissions;

-- --- partners (original) ---------------------------------------------------

create policy partners_select_self_or_admin
on public.partners for select
to authenticated
using (id = auth.uid() or public.is_admin(auth.uid()));

create policy partners_update_self_or_admin
on public.partners for update
to authenticated
using (id = auth.uid() or public.is_admin(auth.uid()))
with check (id = auth.uid() or public.is_admin(auth.uid()));

create policy partners_select_internal
on public.partners for select
to authenticated
using (public.is_internal(auth.uid()));

-- --- products (original) ---------------------------------------------------

create policy products_select_active_or_admin
on public.products for select
to authenticated
using (active = true or public.is_admin(auth.uid()));

-- --- submissions (original) ------------------------------------------------

create policy submissions_select_own_or_admin
on public.submissions for select
to authenticated
using (partner_id = auth.uid() or public.is_admin(auth.uid()));

create policy submissions_insert_self
on public.submissions for insert
to authenticated
with check (partner_id = auth.uid());

create policy submissions_update_own
on public.submissions for update
to authenticated
using (partner_id = auth.uid())
with check (partner_id = auth.uid());

create policy submissions_delete_own_draft
on public.submissions for delete
to authenticated
using (
  partner_id = auth.uid()
  and (status is null or status = 'draft')
);

create policy submissions_update_admin
on public.submissions for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy submissions_delete_admin
on public.submissions for delete
to authenticated
using (public.is_admin(auth.uid()));

-- Note: these two were created without a `to` clause in their original
-- migrations (applied to PUBLIC). Reproduced faithfully here.
create policy submissions_select_internal
on public.submissions for select
using (
  exists (
    select 1 from public.partners
    where partners.id = auth.uid()
      and partners.is_internal = true
  )
);

create policy submissions_select_on_behalf_target
on public.submissions for select
using (on_behalf_of_partner_id = auth.uid());
