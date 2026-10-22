# Apply note: `submission_system_designs` (ADR 0165)

> **Applied 2026-10-22, then re-applied the same day.** Andy first reported it applied with the
> live suite passing section 25. Later that day, after the ADR 0167 guard was applied, the suite
> failed `25` to `25d` with PGRST205 (table not in the API's schema cache), and
> `to_regclass('public.submission_system_designs')` returned null with no trigger function: the
> table was not in production. The cause is not known; the 0167 migration does not touch it.
> Andy re-ran the forward migration, the grant check matched step 2 exactly, and the live suite
> passed in full (`25` to `25d` and `26a` to `26g` included). If section 25 ever fails again, run
> the `to_regclass` check first.

| | File |
|---|---|
| Forward | `supabase/migrations/20261022000001_submission_system_designs.sql` |
| Rollback | `supabase/rollback/submission-system-designs-rollback.sql` |
| Decision | [ADR 0165](../decisions/0165-a-project-calcs-system-design-is-banked-once-in-a-server-written-side-table.md) |
| RLS tests | `scripts/test-rls.ts` section 25 (lines `25` to `25d`) |

It adds one new table, `public.submission_system_designs`, and one trigger function,
`public.submission_system_designs_check_owner()`. It changes no existing table, policy, function or
data, so no backup is needed.

## Order with the app deploy

No app code reads or writes the table yet; Phase B adds that. Apply it any time before Phase B is
deployed. Nothing changes for any user when it lands.

## How to apply

Not `supabase db push`: several migrations on this project were applied by hand and never
recorded in the remote history.

1. Paste the forward migration into the dashboard SQL editor and run it. It creates a table, so it
   runs once; a second run fails on "already exists" and changes nothing.
2. Confirm the grants. Expected: `anon` none; `authenticated` SELECT only; `service_role` SELECT and
   INSERT only.

```sql
select r.role, p.priv,
       has_table_privilege(r.role, 'public.submission_system_designs', p.priv) as has
from (values ('anon'), ('authenticated'), ('service_role')) r(role)
cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) p(priv)
order by 1, 2;
```

3. Confirm RLS, the one policy and the trigger:

```sql
select relrowsecurity from pg_class where oid = 'public.submission_system_designs'::regclass;
-- true

select policyname, cmd, roles from pg_policies
where schemaname = 'public' and tablename = 'submission_system_designs';
-- one row: submission_system_designs_select_internal, SELECT, {authenticated}

select tgname from pg_trigger
where tgrelid = 'public.submission_system_designs'::regclass and not tgisinternal;
-- one row: trg_submission_system_designs_check_owner

select prosecdef, proconfig from pg_proc where proname = 'submission_system_designs_check_owner';
-- prosecdef = true, and proconfig sets search_path to an empty string
```

4. Run the live RLS suite from the repo root:

```bash
node --env-file=.env.local --import tsx scripts/test-rls.ts
```

   Every line should read `PASS`, including the five new ones: `25`, `25a`, `25b`, `25c`, `25d`.
   Section 25 seeds three throwaway submissions under the test personas; the suite's teardown
   deletes them, and the banked test row goes with them through the cascade.

5. Tell the build session the result. Phase B also waits on the `submissions` column guard for
   audit rows B1-S-2 / B1-A-1 and B1-S-13 being on `main` and applied.

## Checked before writing this note

Run in PGlite (Postgres 16.4) with Supabase-style roles and default grants, 60 checks, all
passing: the grants above; service_role can bank for an active internal or admin owner and is
refused (42501) for a non-owner, a partner-owned or a suspended owner's submission; a second row
for one submission fails (23505); UPDATE, DELETE and TRUNCATE fail for every API role (42501);
partner and suspended internal sessions read nothing, internal and admin read rows, anon is
refused; deleting the submission as service_role removes the banked row; the rollback drops both
objects and the migration applies again afterwards. The suite ran twice: once with service_role
holding EXECUTE on `is_internal()` / `is_admin()` and once without, since production's grant there
was not checked. Without `SECURITY DEFINER` on the trigger function, the second case fails every
legitimate insert.

## Rollback

Paste `supabase/rollback/submission-system-designs-rollback.sql` into the SQL editor. Before Phase B
ships, the table is empty and this loses nothing. After, it deletes the record of every project
calc's banked design; the file has the `copy` command to dump it first.
