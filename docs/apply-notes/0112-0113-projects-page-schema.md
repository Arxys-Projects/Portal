# Apply note — `/projects` schema: internal archive + Pipedrive deal cache (ADRs 0112, 0113)

> **APPLIED to production 2026-08-03** via the dashboard SQL editor, and verified
> immediately after by `scripts/verify-project-queue.mts`, which reported **all checks
> passed with none skipped**. That "none skipped" is the part that matters: checks 5a–5d
> only run once both tables exist, and they are the ones that confirm a plain partner can
> neither read nor INSERT an archive row — the property ADR 0112 exists for and the only
> claim in it that a schema diff cannot demonstrate. The cross-partner read through
> `submissions_select_internal` is confirmed live as well, which is what let both migrations
> add no policy of their own.
>
> Two brand-new tables. Nothing existing was touched, and the code half shipped dark, so
> unlike [0111](./0111-management-cameras-managed.md) and
> [0107](./0107-datasheet-media-and-usage.md) **the order did not matter** — see below for
> why that was true here and not there. The rest of this note is kept as the record of what
> was applied and how to back it out.

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

Paste the **contents** of each file, one at a time. Copying the filename instead of the file
is a mistake that actually happened on this note, and it fails confusingly — Postgres reads
`20260803000002` as a numeric literal and reports `42601: trailing junk after numeric literal`,
which reads like a syntax error in the migration rather than a bad paste. Put the contents on
the clipboard directly and it cannot happen:

```bash
pbcopy < supabase/migrations/20260803000001_internal_project_archive.sql
```

1. Run that paste in the SQL editor. The first line in the editor must be `-- ADR 0112 …`; if
   it is not a `--` comment, the paste picked up something it should not have.
2. Then the second file, same way:

```bash
pbcopy < supabase/migrations/20260803000002_pipedrive_deal_cache.sql
```

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

5. Then run the verification script, which is the real acceptance check:

```bash
node --env-file=.env.local --import tsx scripts/verify-project-queue.mts
```

Read-only apart from two throwaway personas it tears down in a `finally` (the
`scripts/test-rls.ts` pattern — a `service_role` connection has no `auth.uid()` and so
passes every gate it is meant to test). **Every check must pass with none skipped.** A
`SKIP` means a table is still missing and the checks that matter did not run.

## The partner-invisibility check, and why the script owns it

This is the property ADR 0112 exists to guarantee, and it is the one thing a schema diff
cannot show you: that a plain partner can neither READ nor WRITE an archive row. The
write half is the whole argument — a flag on `submissions` would have been partner-writable
through `submissions_update_own`, because RLS there is row-level and PostgREST accepts an
arbitrary column list.

Checks 5a–5d of the script are exactly that, automated: a non-internal persona attempting a
SELECT and an INSERT against `submission_internal_archives`, a SELECT against
`pipedrive_deal_cache`, and an internal persona confirming it CAN read the cache (or the
queue could never populate). Signing in as a real partner and issuing
`GET /rest/v1/submission_internal_archives?select=*` by hand tests the same thing and is
worth doing once if you want to see it with your own eyes; the script is what should run
every time, because a by-hand check is one nobody repeats.

Confirmed passing 2026-08-03, immediately after apply.
