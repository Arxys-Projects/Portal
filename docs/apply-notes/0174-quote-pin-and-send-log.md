# Apply note - Project Quote pin, Quote ready send log, confirmations lockdown (ADRs 0174, 0175)

> Written 2026-10-23 (Step 6 Phase A). **Not applied.** Checked offline in PGlite on the real
> migrations: 55/55, including existing rows, a legacy-shaped generate, the two race orders, and
> each rollback reopening what it says.

| | File |
|---|---|
| Forward 1 | `supabase/migrations/20261023000002_project_quotes_pin.sql` |
| Forward 2 | `supabase/migrations/20261023000003_quote_email_sends_and_confirmations_lockdown.sql` |
| Rollback 1 | `supabase/rollback/project-quotes-pin-rollback.sql` |
| Rollback 2, section 1 | `supabase/rollback/quote-email-sends-rollback.sql` |
| Rollback 2, section 2 | `supabase/rollback/pricing-confirmations-lockdown-rollback.sql` |
| Decisions | [ADR 0174](../decisions/0174-a-new-project-quote-carries-its-submissions-deal-and-the-next-version.md), [ADR 0175](../decisions/0175-quote-email-send-log-and-pricing-confirmations-are-server-written.md) |

Forward 1 adds a trigger function and a BEFORE INSERT trigger on `project_quotes`. Forward 2 adds
the `quote_email_sends` table, drops the internal INSERT on `quote_pricing_confirmations`, and adds
its nullable `deal_lines` column. No existing row changes, so no backup is needed. No app code
depends on either yet, so there is no deploy order.

## How to apply

Not `supabase db push`: several migrations on this project were applied by hand and never recorded
in the remote history.

1. Paste Forward 1 into the dashboard SQL editor and run it. Then Forward 2. Forward 1 can be
   re-run safely; Forward 2 cannot (it creates a table and a column), so run it once.
2. Confirm they landed:

```sql
select t.tgname, p.proname, p.prosecdef, p.proconfig
from pg_trigger t join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'public.project_quotes'::regclass and not t.tgisinternal;

select grantee, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('quote_email_sends', 'quote_pricing_confirmations')
  and grantee in ('anon', 'authenticated')
order by 1, 2;
```

   The first returns one row: `trg_project_quotes_pin`, `prosecdef = true`,
   `proconfig = {search_path=""}`. The second returns exactly two rows, both `authenticated`
   `SELECT` (one per table).

3. Run the live RLS suite. Every line should be `PASS`, including the changed `19i`, `24f` and the
   new `27`, `27a`, `27b`. It creates and deletes its own test users and rows.

```bash
node --env-file=.env.local --import tsx scripts/test-rls.ts
```

4. In the portal, as an internal user, generate a Project Quote on a partner-path submission that
   has a deal with products, then download it as the partner. It should behave exactly as before
   (the next version number, attached to the deal). This is the check that the trigger lets the
   real generate path through.

Phase B starts only after all three (applied, live suite passes, partner-path generate and
download work).

## If something goes wrong

- A generate fails with "The quote could not be saved" after applying: check the server log for a
  `23514` from `project_quotes_pin`. If the submission's deal id and the deal Pipedrive returned
  differ (a merged deal, for example), that is the trigger working; relink the submission. If not,
  run Rollback 1 and tell Claude.
- Rollback 2 sections are independent. The lockdown rollback reopens the gate bypass; turn
  `PROJECT_QUOTE_GATE` off first once it exists.
