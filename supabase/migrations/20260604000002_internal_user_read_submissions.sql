-- Phase 8 Step C — internal users may SELECT all submissions.
--
-- Promotes is_internal partners to a middle tier between regular partner and
-- admin: read-only access across all partners' submissions (so they can see
-- the partner-grouped pipeline view), but no update/delete capability — those
-- policies are unchanged and still require role = admin.
--
-- Purely additive: Postgres OR's permissive SELECT policies, so the existing
-- submissions_select_own_or_admin keeps covering regular partners and admins
-- exactly as before.

create policy submissions_select_internal on public.submissions
  for select
  using (
    exists (
      select 1 from public.partners
      where partners.id = auth.uid()
        and partners.is_internal = true
    )
  );
