-- Allow internal users to read all partners rows.
--
-- Without this, internal users can read all submissions (via
-- submissions_select_internal added in 20260604000002) but the partners
-- table lookup that resolves company names returns only the user's own row,
-- so every other partner shows as a raw UUID on the submissions page.
--
-- The existing partners_select_self_or_admin policy is unchanged.

create policy partners_select_internal
on public.partners for select
to authenticated
using (
  exists (
    select 1 from public.partners p
    where p.id = auth.uid()
      and p.is_internal = true
  )
);
