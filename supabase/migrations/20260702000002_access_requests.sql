-- Public "Request access" intake. First unauthenticated-origin write path in
-- the portal (ADR 0077). Writes happen server-side via service_role in the
-- requestAccess() action; anon gets NO grant, so the honeypot / IP+email
-- throttle / dedup enforced in that action are the ONLY write path and cannot
-- be bypassed by POSTing directly with the public anon key. admin + internal
-- read/update via RLS. No public SELECT under any circumstance — rows can hold
-- unverified, submitter-supplied data.

create table public.access_requests (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text not null,                 -- stored lower-cased by the action
  company_name  text not null,
  status        text not null default 'pending'
                check (status in ('pending', 'approved', 'rejected')),
  ip_address    text,                           -- server-captured, not user-supplied
  existing_user boolean not null default false, -- email matched an auth.users row at insert
  created_at    timestamptz not null default now(),
  converted_at  timestamptz                     -- stamped only when an invite is actually sent
);

create index access_requests_status_idx  on public.access_requests(status);
create index access_requests_email_idx    on public.access_requests(email);
create index access_requests_created_idx  on public.access_requests(created_at desc);

alter table public.access_requests enable row level security;

-- anon: nothing. authenticated: SELECT + UPDATE, narrowed to admin/internal by
-- the policies below. INSERT / DELETE are never exposed — the insert is done
-- server-side via service_role (which bypasses RLS), the same trust model as
-- partner provisioning in invitePartner().
revoke all on public.access_requests from anon, authenticated;
grant select, update on public.access_requests to authenticated;

create policy access_requests_select_admin_internal
on public.access_requests for select
to authenticated
using (
  public.is_admin((select auth.uid()))
  or public.is_internal((select auth.uid()))
);

create policy access_requests_update_admin_internal
on public.access_requests for update
to authenticated
using (
  public.is_admin((select auth.uid()))
  or public.is_internal((select auth.uid()))
)
with check (
  public.is_admin((select auth.uid()))
  or public.is_internal((select auth.uid()))
);
