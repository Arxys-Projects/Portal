# Apply note — `is_internal()` requires an active partner (ADR 0164)

> **Not applied yet.** Andy applies it by hand in the Supabase dashboard SQL editor.

| | File |
|---|---|
| Forward | `supabase/migrations/20261019000002_is_internal_requires_active.sql` |
| Rollback | `supabase/rollback/is-internal-requires-active-rollback.sql` |
| Decision | [ADR 0164](../decisions/0164-suspension-bans-the-auth-user-and-every-entry-point-requires-an-active-partner.md) |

It replaces the body of one function, `public.is_internal(uuid)`, adding `status = 'active'`.
The signature, `SECURITY DEFINER`, `search_path` and grants stay the same. No data, policy or
table changes, so no backup is needed.

## Order with the app deploy

Apply this **before** pushing the app commit to main (a push to main deploys production). The
two halves are independent and either order is safe, but applying first means the whole fix
lands at once. Today nobody internal is suspended, so nothing changes for any current user.

## Before the push: ban partners who were already suspended

Only suspensions made through the new code ban the Auth user. Anyone suspended earlier can still
sign in and read prices over the database API, and the Suspend button does not show for a row
that is already suspended. Find them (read-only):

```sql
select p.id, p.company_name, p.contact_name, u.email, u.banned_until, u.last_sign_in_at
from public.partners p
join auth.users u on u.id = p.id
where p.status = 'suspended'
order by p.company_name;
```

For every row with an empty `banned_until`, ban the user in the dashboard: **Authentication >
Users**, open the user, **Ban user**, and pick the longest duration offered. If that menu only
offers short durations, tell the build session and it will write a guarded dry-run-first script
for you to run with `--apply`. Re-run the query and confirm every row has a `banned_until`.

> **Done 2026-10-19:** Andy ran the query. No partners are suspended, so there was nothing to ban.

## How to apply

Not `supabase db push`: several migrations on this project were applied by hand and never
recorded in the remote history.

1. Paste the forward migration into the dashboard SQL editor and run it. It can be re-run
   safely.
2. Confirm it landed:

```sql
select pg_get_functiondef('public.is_internal(uuid)'::regprocedure);
```

   The body should end with `where id = uid and is_internal = true and status = 'active'`.

```sql
select has_function_privilege('anon', 'public.is_internal(uuid)', 'execute') as anon_exec,
       has_function_privilege('authenticated', 'public.is_internal(uuid)', 'execute') as auth_exec;
```

   You should get `anon_exec = false` and `auth_exec = true`.

3. Spot-check the current internal users still read as internal:

```sql
select id, contact_name, status, public.is_internal(id) as internal_now
from public.partners
where is_internal
order by contact_name;
```

   Every active row should show `internal_now = true`. Any invited or suspended row shows false,
   which is the point of the change.

4. Run the RLS suite. It creates and deletes its own test users:

```bash
node --env-file=.env.local --import tsx scripts/test-rls.ts
```

   Every line should be `PASS`, including the three new `8l` lines (suspended internal user).
   Before the migration, the first two `8l` lines fail.

5. After the deploy, on a test partner you control:
   - On `/admin/partners`, suspend them. **Authentication > Users** should show them banned, and
     signing in as them should fail.
   - Request a password reset for them at `/forgot-password` and open the link. It should not
     sign them in. If it does, tell the build session (ADR 0164 "When to revisit").
   - Reactivate them. The ban should be gone and they should be able to sign in.

## Rollback

Run `supabase/rollback/is-internal-requires-active-rollback.sql` in the SQL editor. It restores
the old body, which lets a suspended internal user read across partners again, so use it only if
the status check blocks a legitimate path.

## Tested locally

PGlite (Postgres 16.4 in WASM), 18/18 checks: the pre-migration body lets a suspended internal
user read every row; after the migration an active internal user still reads all rows, while
suspended and invited internal users read only their own; `is_admin()` paths are unchanged; the
function stays `SECURITY DEFINER` with `search_path=public`; `anon` has no EXECUTE; the ADR 0151
guard still blocks self-reactivation and self-set `is_internal`; the migration re-runs cleanly;
the rollback restores the old behaviour.
