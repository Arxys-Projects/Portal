# Apply note - submissions write guard (ADR 0167)

> **Not applied yet.** Written 2026-10-22. Checked offline in PGlite: 47/47 with and without
> `service_role` holding EXECUTE on `is_admin()` / `is_internal()`. Without the migration, or after
> the rollback, 32 of the 45 behavior checks fail.

| | File |
|---|---|
| Forward | `supabase/migrations/20261022000002_submissions_guard_writes.sql` |
| Rollback | `supabase/rollback/submissions-guard-writes-rollback.sql` |
| Decision | [ADR 0167](../decisions/0167-submissions-write-guard-partners-change-only-status-and-preferred.md) |

It adds one trigger function and one BEFORE INSERT OR UPDATE trigger on `public.submissions`.
No data, policy or grant changes, so no backup is needed.

**Order matters.** The app change in the same commits writes `email_sent_at` and
`pipedrive_deal_id` as service role. If the guard goes live first, every fresh partner submit
creates a Pipedrive deal and then fails to link it. Deploy the code, then apply the SQL.

## How to apply

Not `supabase db push`: several migrations on this project were applied by hand and never
recorded in the remote history.

1. Push `main` and wait for the Vercel production deploy to finish. The new code works the same
   with or without the guard. The repo is public and these commits describe the hole, so do
   steps 1 to 5 in one sitting.
2. Before applying, optionally run the RLS suite once. `26a`, `26b`, `26c` and `26e` should FAIL,
   which shows the hole is live. Everything else should pass:

```bash
node --env-file=.env.local --import tsx scripts/test-rls.ts
```

3. Paste the forward migration into the dashboard SQL editor and run it. It can be re-run safely.
4. Confirm it landed:

```sql
select t.tgname, p.proname, p.prosecdef, p.proconfig
from pg_trigger t join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'public.submissions'::regclass and not t.tgisinternal
order by t.tgname;
```

   You should get one row, `trg_submissions_guard_writes`, with `prosecdef = false` and
   `proconfig = {search_path=""}`.

5. Run the RLS suite again (same command as step 2). Every line should be `PASS`, including
   `26a` to `26g`. It creates and deletes its own test users.
6. In the portal, as a partner: save a fresh calc (the deal links, and the PDF email arrives),
   revise it (the same deal updates), toggle Preferred, and set a quote to Won. The page asks you
   to confirm first; after that the status control is greyed out and reads "Ask your Arxys rep
   to change".
7. As an internal user: save an on-behalf calc for a partner and confirm the target partner sees it
   under "Prepared by Arxys". As staff, use Re-link on a submission with no deal and Resend on one
   with a deal.

## Check for values planted before the guard

The trigger stops new writes. Anything a partner wrote before it stays in place, and a planted
`pipedrive_deal_id` would still steer a revise. The 2026-10-19 check was clean, but the hole has
been described on a public branch since then. Run these read-only queries after applying. Each
should return no rows, or only rows you recognize as staff work. Fix any other hit through
service role.

```sql
-- One deal linked from submissions by more than one creator.
select s.pipedrive_deal_id, array_agg(distinct p.contact_name) as creators, count(*) as rows
from public.submissions s join public.partners p on p.id = s.partner_id
where s.pipedrive_deal_id is not null
group by s.pipedrive_deal_id
having count(distinct s.partner_id) > 1;

-- On-behalf fields on a row whose creator is not staff.
select s.id, p.contact_name, s.on_behalf_of_partner_id, s.on_behalf_of_company_name, s.created_at
from public.submissions s join public.partners p on p.id = s.partner_id
where (s.on_behalf_of_partner_id is not null or s.on_behalf_of_company_name is not null)
  and not (p.is_internal or p.role = 'admin');

-- A non-staff revision whose parent is someone else's row and was not prepared for them.
select c.id, cp.contact_name, c.parent_submission_id, par.partner_id as parent_creator
from public.submissions c
join public.submissions par on par.id = c.parent_submission_id
join public.partners cp on cp.id = c.partner_id
where c.partner_id <> par.partner_id
  and par.on_behalf_of_partner_id is distinct from c.partner_id
  and not (cp.is_internal or cp.role = 'admin');

-- A deal id lower than deals already linked on older rows, and not inherited from the
-- parent. Pipedrive ids only grow, so a fresh link is normally higher. Heuristic: review
-- hits by hand (a staff relink of an old row also lands here).
select s.id, s.partner_id, s.pipedrive_deal_id, s.created_at
from public.submissions s
left join public.submissions par on par.id = s.parent_submission_id
where s.pipedrive_deal_id is not null
  and s.pipedrive_deal_id is distinct from par.pipedrive_deal_id
  and s.pipedrive_deal_id < (select max(e.pipedrive_deal_id) from public.submissions e
                             where e.created_at < s.created_at - interval '1 hour');

-- Future-dated rows, or an email stamp before the row existed.
select id, partner_id, created_at, email_sent_at
from public.submissions
where created_at > now() or email_sent_at < created_at - interval '1 minute';
```

## Rollback

Run `supabase/rollback/submissions-guard-writes-rollback.sql` in the SQL editor. It drops the
trigger and function only, which **re-opens the hole**, so use it only if the guard blocks a
legitimate path. The app change can stay.

**Never roll the app back** (for example with Vercel's instant rollback) to a deploy from before
this change while the trigger exists. The old code links deals with the partner's session, which
the guard refuses, so every fresh submit would create a Pipedrive deal it cannot link, and each
staff Retry would add another. Run the SQL rollback first if the app must go back.
