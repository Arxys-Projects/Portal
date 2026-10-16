-- Project Portal backend, Step 1 (1 of 4): companies, contacts, aliases, and the
-- login-to-contact link. ADR 0153; brief docs/Portal-Project revamp/
-- claude-code-brief-project-portal-backend.md, Step 1.
--
-- A company is a Pipedrive org carrying the "Arxys Security Partner" label; a
-- contact is a Pipedrive person under one. Both are keyed by their Pipedrive id,
-- never by name (Step 0 found the name-based upserts created duplicate orgs).
-- Rows arrive from scripts/sync-pipedrive-companies.mts (Step 2), which runs as
-- service_role.
--
-- ⚠ STOP-AND-FLAG: new tables with RLS. No `supabase db push` by the agent. Andy
-- applies this by hand in the dashboard SQL editor, in order with
-- 20261016000003 / 000004 / 000005. See
-- docs/apply-notes/0153-project-portal-schema.md.
-- Rollback: supabase/rollback/project-companies-contacts-rollback.sql.
--
-- ACCESS. Every table here is internal-only: is_internal OR is_admin, with
-- auth.uid() wrapped per ADR 0055. Partners get no grant at all (the
-- "revoke all" below strips Supabase's default table privileges).
--   companies, contacts, company_name_aliases: SELECT only. Pipedrive is the
--     authority and the sync (service_role) is the only writer, so a hand edit
--     would be overwritten on the next run anyway.
--   partner_contact_links: internal and admin read and write (the brief), so a
--     rep can link or unlink a login later without a script. No partner SELECT:
--     a contact's login sees project quotes through
--     submissions.on_behalf_of_partner_id (ADR 0152), never through this table.
--     Kept off `partners` because partners could once update every column of
--     their own row (fixed by ADR 0151, but a side table needs no guard).

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------

create table public.companies (
  id               uuid primary key default gen_random_uuid(),
  pipedrive_org_id bigint not null unique check (pipedrive_org_id > 0),
  name             text not null check (length(btrim(name)) > 0),
  -- False when the org loses the label or is deleted in Pipedrive. Rows are
  -- never deleted: projects reference them.
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- Last sync run that saw this org carrying the label.
  last_synced_at   timestamptz
);

comment on table public.companies is
  'ADR 0153: Pipedrive orgs labeled "Arxys Security Partner", keyed by org id. '
  'Written only by the company sync (service_role). Internal-only.';

create trigger trg_companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- company_name_aliases
--
-- Maps a legacy portal spelling (partners.company_name, the free-typed
-- on_behalf_of_company_name) or a merged / unlabeled Pipedrive org to one
-- company. Step 2's mapping report proposes these; its --execute writes them.
-- One spelling maps to one company (case and edge spaces ignored); one
-- Pipedrive org maps to one company.
-- ---------------------------------------------------------------------------

create table public.company_name_aliases (
  id               bigint generated always as identity primary key,
  company_id       uuid not null references public.companies(id) on delete cascade,
  alias            text not null check (length(btrim(alias)) > 0),
  -- Set when the alias is a Pipedrive org (a merged org, or an unlabeled org
  -- with the same name that existing deals hang off). Null for portal spellings.
  pipedrive_org_id bigint check (pipedrive_org_id is null or pipedrive_org_id > 0),
  source           text not null
                   check (source in ('partner_company_name', 'on_behalf_company_name', 'pipedrive_org')),
  notes            text,
  created_at       timestamptz not null default now(),
  check ((source = 'pipedrive_org') = (pipedrive_org_id is not null))
);

create unique index company_name_aliases_alias_key
  on public.company_name_aliases (lower(btrim(alias)));
create unique index company_name_aliases_pipedrive_org_id_key
  on public.company_name_aliases (pipedrive_org_id) where pipedrive_org_id is not null;
create index company_name_aliases_company_id_idx
  on public.company_name_aliases (company_id);

comment on table public.company_name_aliases is
  'ADR 0153: legacy portal spellings and merged/unlabeled Pipedrive orgs that '
  'resolve to one company. Written by the Step 2 sync --execute. Internal-only.';

-- ---------------------------------------------------------------------------
-- contacts
-- ---------------------------------------------------------------------------

create table public.contacts (
  id                  uuid primary key default gen_random_uuid(),
  pipedrive_person_id bigint not null unique check (pipedrive_person_id > 0),
  company_id          uuid not null references public.companies(id) on delete restrict,
  name                text not null check (length(btrim(name)) > 0),
  -- Nullable: 35 of the 402 persons Step 0 counted have no email.
  email               text,
  phone               text,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  last_synced_at      timestamptz,
  -- Target of the composite FK on partner_contact_links, which keeps the
  -- link's company_id equal to the contact's.
  unique (id, company_id)
);

create index contacts_company_id_idx on public.contacts (company_id);
create index contacts_email_lower_idx on public.contacts (lower(email)) where email is not null;

comment on table public.contacts is
  'ADR 0153: Pipedrive persons under a company, keyed by person id. A portal '
  'login is optional (partner_contact_links). Written only by the sync. Internal-only.';

create trigger trg_contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- partner_contact_links
--
-- partner_id is the primary key: a login links to at most one contact. A
-- contact may have several logins; ADR 0152 then grants portal visibility to
-- none of them until one is chosen. company_id is carried for queries and kept
-- equal to the contact's by the composite FK; if the sync moves a contact to
-- another company, the link follows (on update cascade).
--
-- on delete cascade from partners: a deleted login has nothing left to link.
-- on delete restrict from contacts: contacts are never deleted (active=false).
-- ---------------------------------------------------------------------------

create table public.partner_contact_links (
  partner_id uuid primary key references public.partners(id) on delete cascade,
  contact_id uuid not null,
  company_id uuid not null references public.companies(id) on delete restrict,
  linked_by  uuid references public.partners(id) on delete set null,
  linked_at  timestamptz not null default now(),
  foreign key (contact_id, company_id)
    references public.contacts (id, company_id)
    on update cascade on delete restrict
);

create index partner_contact_links_contact_id_idx on public.partner_contact_links (contact_id);
create index partner_contact_links_company_id_idx on public.partner_contact_links (company_id);

comment on table public.partner_contact_links is
  'ADR 0153: links a portal login (partners.id) to the Pipedrive contact it '
  'belongs to. A login never defines a contact. Internal/admin read and write; '
  'no partner access (visibility runs through on_behalf_of_partner_id, ADR 0152).';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.companies             enable row level security;
alter table public.company_name_aliases  enable row level security;
alter table public.contacts              enable row level security;
alter table public.partner_contact_links enable row level security;

revoke all on public.companies             from anon, authenticated;
revoke all on public.company_name_aliases  from anon, authenticated;
revoke all on public.contacts              from anon, authenticated;
revoke all on public.partner_contact_links from anon, authenticated;

grant select on public.companies            to authenticated;
grant select on public.company_name_aliases to authenticated;
grant select on public.contacts             to authenticated;
grant select, insert, update, delete on public.partner_contact_links to authenticated;

create policy companies_select_internal
on public.companies for select
to authenticated
using (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())));

create policy company_name_aliases_select_internal
on public.company_name_aliases for select
to authenticated
using (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())));

create policy contacts_select_internal
on public.contacts for select
to authenticated
using (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())));

create policy partner_contact_links_select_internal
on public.partner_contact_links for select
to authenticated
using (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())));

-- linked_by, when set, must be the acting user so attribution cannot be forged.
create policy partner_contact_links_insert_internal
on public.partner_contact_links for insert
to authenticated
with check (
  (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())))
  and (linked_by is null or linked_by = (select auth.uid()))
);

create policy partner_contact_links_update_internal
on public.partner_contact_links for update
to authenticated
using (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())))
with check (
  (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())))
  and (linked_by is null or linked_by = (select auth.uid()))
);

create policy partner_contact_links_delete_internal
on public.partner_contact_links for delete
to authenticated
using (public.is_internal((select auth.uid())) or public.is_admin((select auth.uid())));
