# Apply note — `partners.pipedrive_user_id` (ADR 0118)

> **NOT YET APPLIED.** One nullable integer column. Safe in either order in
> the sense that nothing 404s if the code deploys first — but the new
> "Pipedrive User ID" field on `/admin/partners` will fail every save until
> the column exists, so apply first anyway.

| | File |
|---|---|
| Forward | `supabase/migrations/20260810000001_partners_pipedrive_user_id.sql` |
| Rollback | `supabase/rollback/partners-pipedrive-user-id-rollback.sql` |
| Decision | [ADR 0118](../decisions/0118-pipedrive-owner-per-rep-routing.md) |

```sql
alter table public.partners
  add column if not exists pipedrive_user_id integer;
```

Purely additive. No existing column, value, index, policy or constraint is
touched, the new column is nullable, and every existing row stays valid
untouched.

## How to apply

By hand via the Supabase **dashboard SQL editor**, same as every other
schema change in this repo. Not `supabase db push` — several migrations on
this project were applied by hand and never recorded in the remote history,
so a push would try to re-run them.

1. Paste the forward migration into the dashboard SQL editor and run it.
2. Confirm it landed — either check the column in the dashboard's Table
   Editor, or:

```bash
node --env-file=.env.local --import tsx -e "
import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await c.from('partners').select('id, company_name, pipedrive_user_id').limit(1);
console.log(error ?? data);
"
```

A clean result with `pipedrive_user_id` present (even as `null`) confirms the
column exists.

3. Deploy the code.

## Then enter the two known ids

Neither id ships pre-seeded — this migration adds the column empty on
purpose, same as every other admin-entered field in this repo (see ADR
0111's precedent). On `/admin/partners`, in the new **Pipedrive User ID**
column, on each person's own row:

| Row | Pipedrive User ID |
|---|---|
| Andy Newbom | `6039322` |
| Richard Kershaw | `3464106` |

**These two numbers were supplied by Andy from memory, not verified against
a live Pipedrive API call** — this session's sandbox could not reach
`api.pipedrive.com` (outbound network here is allowlisted to package
registries; the request failed at the proxy before Pipedrive ever saw it).
Worth a quick sanity check before or after entering them: open Pipedrive →
Settings → Users, or open any deal you know is owned by each person and
confirm the owner shown matches. If either number is wrong, the practical
failure mode is mild — deals for that person would misattribute to
whichever real Pipedrive user that id actually belongs to (not silently
drop, not error) — but it's still worth a five-minute check rather than
trusting it blind.

Everyone else — Marcos Busby, any other internal user, every external
partner — gets no row here and no id. `resolveOwnerIdForCreator()` treats
"no stored id" as "use the existing single-owner default," so their deals
keep landing on Andy exactly as before this change.

## Verification once both are entered

Have each person (Andy, then Richard) run one calculator submission — for
themselves as an on-behalf target is not required, any submission they
personally create is enough — and open the resulting deal in Pipedrive.
Confirm:

- The deal's **owner** is that person, not always Andy.
- The pinned on-behalf note (when the submission was on-behalf of a
  partner) still names the rep and target, unchanged from before.
- A submission from an internal user with no stored id (or an external
  partner's own self-serve calc) still lands owned by Andy, unchanged.
