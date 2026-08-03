# Apply note — `/projects` schema: internal archive + Pipedrive deal cache (ADRs 0112, 0113)

> **NOT YET APPLIED.** Two brand-new tables. Nothing existing is touched, and the code
> half ships dark, so unlike [0111](./0111-management-cameras-managed.md) and
> [0107](./0107-datasheet-media-and-usage.md) **the order does not matter** — see below
> for why that is true here and not there.

| | File |
|---|---|
| Forward (archive) | `supabase/migrations/20260803000001_internal_project_archive.sql` |
| Rollback (archive) | `supabase/rollback/internal-project-archive-rollback.sql` |
| Forward (cache) | `supabase/migrations/20260803000002_pipedrive_deal_cache.sql` |
| Rollback (cache) | `supabase/rollback/pipedrive-deal-cache-rollback.sql` |
| Decisions | [ADR 0112](../decisions/0112-internal-project-archive-is-a-side-table.md), [ADR 0113](../decisions/0113-pipedrive-reads-are-cached-with-a-last-known-fallback.md) |

## What lands

```sql
create table public.submission_internal_archives (
  submission_id uuid primary key references public.submissions(id) on delete cascade,
  archived_at   timestamptz not null default now(),
  archived_by   uuid not null references public.partners(id) on delete restrict
);

create table public.pipedrive_deal_cache (
  pipedrive_deal_id     bigint primary key,
  deal_status           text,          -- open | won | lost | deleted
  deal_value            numeric(14,2),
  currency              text,
  line_item_count       integer,
  line_items            jsonb,         -- normalised fingerprint
  deal_update_time      timestamptz,
  line_items_changed_at timestamptz,
  read_at               timestamptz,   -- last SUCCESSFUL read
  last_failed_at        timestamptz,
  last_error            text,
  created_at            timestamptz not null default now()
);
```

Purely additive: two new tables, one index each, RLS enabled, grants revoked from `anon`
and re-granted narrowly, policies gated on `is_internal OR is_admin` exactly as
`project_quotes` is. **No existing table, column, value, index, policy, constraint or
grant is altered by either migration.** In particular neither one adds a column to
`submissions` — ADR 0112 explains at length why that shape was rejected.

Record count after apply: **0 rows in both.** Both tables are populated by use, and both
are empty-safe (an absent archive entry means "not archived"; an absent cache entry means
"never read", which the query layer already handles as `pipedrive_read_ok: false` with
null last-known values).

## Order does not matter here

`0111` and `0107` had to go migration-first because a deployed admin form wrote the full
field set, so a missing column broke *every* save on that page from the moment the code
landed. Nothing analogous exists here:

- **No route, page or action reads either table yet.** This session built the schema and
  the query/service layer only; `/projects` itself is a later phase. `src/lib/projects/*`
  is imported by nothing outside its own tests, and the tests use in-memory fixtures and
  never touch Supabase.
- **Both readers degrade rather than throw once they are wired up.** `loadProjectQueue`
  treats a failed archive read as "nothing archived" and a failed cache read as "nothing
  cached", both of which are the same as the empty-table state.

So: apply whenever, deploy whenever. The one thing that must not happen is the `/projects`
page shipping *before* the migrations — a queue with no cache table would show every row
as `Pipedrive unreachable`, which is technically accurate and completely useless.

## How to apply

By hand via the Supabase **dashboard SQL editor**, as with 0111, 0107 and 0090. Not
`supabase db push`: several migrations on this project were applied by hand and never
recorded in the remote migration history, so a push would try to re-run them. The CLI also
has no usable credentials here.

1. Paste `20260803000001_internal_project_archive.sql` into the SQL editor and run it.
2. Paste `20260803000002_pipedrive_deal_cache.sql` and run it.
3. Confirm both tables exist with RLS on and no policy gaps:

```sql
select c.relname, c.relrowsecurity, count(p.polname) as policies
from pg_class c
left join pg_policy p on p.polrelid = c.oid
where c.relname in ('submission_internal_archives', 'pipedrive_deal_cache')
group by 1, 2;
```

Expect `submission_internal_archives` with `relrowsecurity = true` and **4** policies, and
`pipedrive_deal_cache` with `relrowsecurity = true` and **3** policies.

4. Confirm `anon` cannot reach either one:

```sql
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_name in ('submission_internal_archives', 'pipedrive_deal_cache')
order by 1, 2, 3;
```

Expect grants for `authenticated` (and the table owner) only. **No `anon` row at all.**

## The partner-invisibility check worth doing by hand

This is the property ADR 0112 exists to guarantee, and it is the one thing a schema
diff cannot show you. Signed in as a **non-internal partner**, against either table:

```
GET /rest/v1/submission_internal_archives?select=*
```

Expect an empty array or a permission error, never a row — including after an internal
user has archived one of *that partner's own* projects. The equivalent write must also
fail. If either returns data, the gate is wrong and the ADR's premise is broken.
