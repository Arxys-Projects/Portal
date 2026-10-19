-- Project Portal backend, Step 1 (2 of 4): projects, extra project contacts, and
-- the project-to-submission link. ADR 0153.
--
-- Requires 20261016000002 (companies, contacts).
--
-- ⚠ STOP-AND-FLAG: new tables with RLS. Applied by hand by Andy; see
-- docs/apply-notes/0153-project-portal-schema.md.
-- Rollback: supabase/rollback/projects-rollback.sql.
--
-- WHY THE LINK IS A SIDE TABLE, not a project_id column on submissions: a
-- partner can UPDATE any column of their own submission row through PostgREST
-- (submissions_update_authorized), so a column there would let a partner attach
-- their calc to an internal project, or detach one. Same reasoning as the
-- internal archive (ADR 0112). project_submissions has no partner grant.
--
-- ACCESS. Internal-only (is_internal OR is_admin), ADR 0055 wrapping. Partners
-- get no grant on any table here.

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------

create table public.projects (
  id                     uuid primary key default gen_random_uuid(),
  company_id             uuid not null references public.companies(id) on delete restrict,
  -- Nullable: 2 labeled orgs have no persons, and a project can be opened
  -- before the contact is known. Checked against company_id on write (below).
  primary_contact_id     uuid references public.contacts(id) on delete restrict,
  -- No length limit here. The 50-character limit applies only when the name is
  -- copied into submissions.project_name (Step 4).
  name                   text not null check (length(btrim(name)) > 0),
  end_customer           text,
  site                   text,
  vms                    text,
  -- 'upgrade' means existing cameras.
  install_type           text check (install_type in ('new', 'upgrade')),
  default_retention_days integer check (default_retention_days > 0),
  bid_due_date           date,
  notes                  text,
  created_by             uuid not null references public.partners(id) on delete restrict,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index projects_company_id_idx on public.projects (company_id);
create index projects_primary_contact_id_idx on public.projects (primary_contact_id);
create index projects_created_at_idx on public.projects (created_at desc);

comment on table public.projects is
  'ADR 0153: an internal project, prepared for a company and (usually) a '
  'primary contact. Calcs attach through project_submissions. Internal-only.';

create trigger trg_projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- The primary contact must belong to the project's company at the time it is
-- set. Checked on write only, not kept in step afterwards: if the sync later
-- moves the person to another org, the project still records who it was
-- prepared for. (A composite FK would either block that sync update or
-- silently move the project to the new company.)
create or replace function public.projects_check_primary_contact()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.primary_contact_id is not null
     and (tg_op = 'INSERT'
          or new.primary_contact_id is distinct from old.primary_contact_id
          or new.company_id is distinct from old.company_id)
     and not exists (
       select 1 from public.contacts c
       where c.id = new.primary_contact_id and c.company_id = new.company_id
     )
  then
    raise exception 'primary contact % does not belong to company %',
      new.primary_contact_id, new.company_id
      using errcode = '23514';  -- check_violation
  end if;
  return new;
end;
$$;

revoke execute on function public.projects_check_primary_contact() from anon, authenticated, public;

create trigger trg_projects_check_primary_contact
  before insert or update on public.projects
  for each row execute function public.projects_check_primary_contact();

-- ---------------------------------------------------------------------------
-- project_contacts: extra contacts per project (the primary lives on projects).
-- ---------------------------------------------------------------------------

create table public.project_contacts (
  project_id uuid not null references public.projects(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  added_by   uuid references public.partners(id) on delete set null,
  added_at   timestamptz not null default now(),
  primary key (project_id, contact_id)
);

create index project_contacts_contact_id_idx on public.project_contacts (contact_id);

comment on table public.project_contacts is
  'ADR 0153: contacts on a project besides the primary. Internal-only.';

-- ---------------------------------------------------------------------------
-- project_submissions: the calc-to-project link.
--
-- submission_id is the primary key: a calc belongs to at most one project.
-- Several calcs (and later options and phases) per project are allowed.
-- on delete cascade from submissions: the link means nothing without the calc.
-- on delete restrict from projects: a project with calcs cannot be deleted.
-- ---------------------------------------------------------------------------

create table public.project_submissions (
  submission_id uuid primary key references public.submissions(id) on delete cascade,
  project_id    uuid not null references public.projects(id) on delete restrict,
  -- 'option' and 'phase' are reserved; MVP writes only 'primary'.
  calc_role     text not null default 'primary' check (calc_role in ('primary', 'option', 'phase')),
  linked_by     uuid references public.partners(id) on delete set null,
  linked_at     timestamptz not null default now()
);

create index project_submissions_project_id_idx on public.project_submissions (project_id);

comment on table public.project_submissions is
  'ADR 0153: links a submission to a project. A side table, not a column on '
  'submissions, so a partner cannot set or clear it. Internal-only.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.projects            enable row level security;
alter table public.project_contacts    enable row level security;
alter table public.project_submissions enable row level security;

revoke all on public.projects            from anon, authenticated;
revoke all on public.project_contacts    from anon, authenticated;
revoke all on public.project_submissions from anon, authenticated;

grant select, insert, update, delete on public.projects            to authenticated;
grant select, insert, update, delete on public.project_contacts    to authenticated;
grant select, insert, update, delete on public.project_submissions to authenticated;

-- projects -------------------------------------------------------------------

create policy projects_select_internal
on public.projects for select
to authenticated
using (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())));

-- created_by must be the acting user (mirrors submissions_insert_self).
create policy projects_insert_internal
on public.projects for insert
to authenticated
with check (
  (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())))
  and created_by = (select auth.uid())
);

create policy projects_update_internal
on public.projects for update
to authenticated
using (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())))
with check (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())));

-- Only an empty project can go: project_submissions restricts the delete.
create policy projects_delete_internal
on public.projects for delete
to authenticated
using (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())));

-- project_contacts -----------------------------------------------------------

create policy project_contacts_select_internal
on public.project_contacts for select
to authenticated
using (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())));

create policy project_contacts_insert_internal
on public.project_contacts for insert
to authenticated
with check (
  (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())))
  and (added_by is null or added_by = (select auth.uid()))
);

create policy project_contacts_update_internal
on public.project_contacts for update
to authenticated
using (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())))
with check (
  (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())))
  and (added_by is null or added_by = (select auth.uid()))
);

create policy project_contacts_delete_internal
on public.project_contacts for delete
to authenticated
using (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())));

-- project_submissions --------------------------------------------------------

create policy project_submissions_select_internal
on public.project_submissions for select
to authenticated
using (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())));

create policy project_submissions_insert_internal
on public.project_submissions for insert
to authenticated
with check (
  (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())))
  and (linked_by is null or linked_by = (select auth.uid()))
);

-- Moving a calc to another project, or changing its role.
create policy project_submissions_update_internal
on public.project_submissions for update
to authenticated
using (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())))
with check (
  (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())))
  and (linked_by is null or linked_by = (select auth.uid()))
);

create policy project_submissions_delete_internal
on public.project_submissions for delete
to authenticated
using (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())));
