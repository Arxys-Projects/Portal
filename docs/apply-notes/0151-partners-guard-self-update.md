# Apply note — partners self-update guard (ADR 0151)

> **Not yet applied.** Written 2026-10-16. Apply by hand in the Supabase dashboard SQL editor.

| | File |
|---|---|
| Forward | `supabase/migrations/20261016000001_partners_guard_self_update.sql` |
| Rollback | `supabase/rollback/partners-guard-self-update-rollback.sql` |
| Decision | [ADR 0151](../decisions/0151-partners-self-update-guard-trigger.md) |

It adds one trigger function and one BEFORE UPDATE trigger on `public.partners`. No data, policy
or grant changes, so no backup is needed. No app code depends on it, so applying it before or
after a deploy makes no difference.

## How to apply

Not `supabase db push`: several migrations on this project were applied by hand and never
recorded in the remote history.

1. Paste the forward migration into the dashboard SQL editor and run it. It can be re-run
   safely.
2. Confirm it landed:

```sql
select t.tgname, p.proname, p.prosecdef, p.proconfig
from pg_trigger t join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'public.partners'::regclass and not t.tgisinternal
order by t.tgname;
```

   You should get two rows. `trg_partners_guard_self_update` should show
   `prosecdef = false` and `proconfig = {search_path=""}`. `trg_partners_set_updated_at` is
   unchanged.

3. Run the RLS suite with the 0151 block on. It creates and deletes its own test users:

```bash
RUN_0151_TESTS=1 node --env-file=.env.local --import tsx scripts/test-rls.ts
```

   Every line should be `PASS`, including 23a–23k. Before the migration, 23a–23g fail.

4. Optional: on `/admin/partners`, toggle a test partner's internal flag, or suspend and
   reactivate them. These actions use the service-role client, so they should behave exactly
   as before.

## Check whether the hole was ever used

The guard stops future self-escalation, but it can't show past use. Run this read-only query
and confirm every row belongs to someone who should be an admin or internal user:

```sql
select id, company_name, contact_name, role, is_internal, status, pipedrive_user_id, updated_at
from public.partners
where role = 'admin' or is_internal or pipedrive_user_id is not null
order by updated_at desc;
```

## Rollback

Run `supabase/rollback/partners-guard-self-update-rollback.sql` in the SQL editor. It drops the
trigger and function only, which **re-opens the hole**, so use it only if the guard blocks a
legitimate path.

## After it passes

Remove the `RUN_0151_TESTS` gate in `scripts/test-rls.ts`, so the default suite keeps checking
the guard.
