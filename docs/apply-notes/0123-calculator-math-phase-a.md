# Apply note — calculator math Phase A: `submissions` sizing-model columns

> ## ⚠️ CORRECTION 2026-08-17 — the column comments were never applied (now fixed)
>
> **This note claimed below that the comments landed on 2026-08-12. They did not.**
> Measured live on 2026-08-17: `calc_version`, `max_disk_utilization_pct` and
> `recorded_storage_tb` all returned a NULL comment. The technique was
> control-checked in the same query — `input_state`, `is_preferred`,
> `parent_submission_id` and `status` *do* carry their comments — so it was a real
> gap in the second step, not a bad query.
>
> **RESOLVED 2026-08-17.** Both halves are now measured, so this is settled rather
> than suspected:
>
> | Half of the "second step" | Applied 2026-08-12? | State now |
> |---|---|---|
> | Three `NOT VALID` range guards | **Yes** | Confirmed present 2026-08-17, all three `convalidated = false` with the expected definitions |
> | Three column comments | **No** | Applied 2026-08-17 via the Phases B/C migration; all four columns verified non-null |
>
> **Root cause: the "second step" below is two kinds of thing recorded as one, and
> only one kind was verified.** The constraints and the comments went in together in
> this note's telling; the `pg_constraint` query below then certified the step, and
> that query says nothing about comments. So the half that did not land was never
> looked at. **A verification query covering one kind of change will launder every
> other kind the same step made.**
>
> The comments were repaired by `supabase/migrations/20260817000001_calculator_math_phase_bc.sql`
> ([apply note](./0131-calculator-math-phase-bc.md)), which comments all four columns
> — a superset of what this migration should have left behind. Nothing further is
> outstanding from Phase A. No runtime impact either way: comments are metadata and
> no read or write path consults them.
>
> ---
>
> **Columns applied 2026-08-12** by hand via the Supabase dashboard SQL editor,
> ahead of the code deploy, and verified live (all three present and NULL on
> existing rows — the intended "calc_version 1" reading). **This part held up** —
> the columns are there and the code has been writing them since.
>
> **The `add column` statement was run on its own first**, so the three
> `NOT VALID` range guards and the column comments were applied as a second
> step. If you are replaying this on another environment, run the **whole**
> migration file rather than the fragment below.
>
> Constraints confirmed present **2026-08-12 and re-confirmed 2026-08-17**. To
> re-check:
>
> ```sql
> select conname, convalidated, pg_get_constraintdef(oid) as definition
> from pg_constraint
> where conrelid = 'public.submissions'::regclass and contype = 'c'
> order by conname;
> ```
>
> The three `submissions_*_check` rows added here report
> **`convalidated = false`, and that is correct** — it is the `NOT VALID`
> flag, meaning Postgres never rescanned the existing table. New writes are
> still checked. The older constraints on this table report `true` only
> because they were created normally, back when the table was small. Selecting
> `pg_get_constraintdef` too is the point of the re-check: a row can exist under the
> right name with the wrong definition, and the name alone would not show it.
>
> To check comments — **note the control columns, which is what this note was
> missing**. Listing every commented column rather than only the ones of interest is
> what turns "these are NULL" into either a real gap or a broken query:
>
> ```sql
> select a.attname as column_name, col_description(a.attrelid, a.attnum) as comment
> from pg_attribute a
> where a.attrelid = 'public.submissions'::regclass
>   and a.attnum > 0 and not a.attisdropped
>   and col_description(a.attrelid, a.attnum) is not null
> order by a.attname;
> ```
>
> `input_state`, `is_preferred`, `parent_submission_id` and `status` are the natural
> controls — they have carried comments since well before Phase A.

| | File |
|---|---|
| Forward | `supabase/migrations/20260812000001_calculator_math_phase_a.sql` |
| Rollback | `supabase/rollback/calculator-math-phase-a-rollback.sql` |
| Decisions | [ADR 0123](../decisions/0123-bitrate-reanchor-and-sublinear-fps.md) · [0124](../decisions/0124-h265-smart-codec-key.md) · [0125](../decisions/0125-motion-duty-cycle-and-event-peak-bandwidth.md) · [0126](../decisions/0126-one-buffer-max-disk-utilization.md) · [0127](../decisions/0127-charge-decimal-to-binary-conversion.md) · [0128](../decisions/0128-audio-metadata-counted.md) |
| Plan | [`docs/calculator-math-phase-2-plan.md`](../calculator-math-phase-2-plan.md) |

```sql
alter table public.submissions
  add column if not exists calc_version integer,
  add column if not exists max_disk_utilization_pct integer,
  add column if not exists recorded_storage_tb numeric(10,2);
```

(plus three `not valid` CHECK constraints and three column comments — run the
whole migration file, not just the fragment above.)

Purely additive. No existing column, value, index, policy or constraint is
touched, all three new columns are nullable, and the guards are `NOT VALID` so
the statement never scans the table and every existing row stays valid
untouched.

## Why these three columns

`submissions.storage_tb` **changes meaning** at this deploy. It used to bank raw
video × 1.2, with a second ×1.2 applied later inside the recommender and the
decimal→binary conversion never charged at all. It now banks required decimal
RAID-net capacity — footage with the Max disk utilization buffer and the binary
charge already in it.

Already-issued documents are safe: the audit swept for this explicitly (§Q7) and
nothing downstream recomputes — every PDF, quote and proposal renders from banked
values. But the **column stops being comparable across the boundary**, which is
what `calc_version` exists to record. Existing rows are version 1.

`max_disk_utilization_pct` is deliberately **not backfilled**. No single
utilization value reproduces the old ×1.44 under the new semantics, so a
backfill would be an invention. NULL means "this row predates the buffer" and
should render as *not recorded*, never as the current default.

`recorded_storage_tb` is the Milestone-comparable figure — footage only, no
buffer, no binary charge — banked so a partner can set it beside a Milestone or
Genetec proposal's storage line without re-deriving it.

## How to apply

By hand via the Supabase **dashboard SQL editor**, same as every other schema
change in this repo. Not `supabase db push` — several migrations on this project
were applied by hand and never recorded in the remote history, so a push would
try to re-run them.

1. Paste the whole forward migration into the dashboard SQL editor and run it.
2. Confirm it landed:

```bash
node --env-file=.env.local --import tsx -e "
import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await c.from('submissions').select('id, storage_tb, calc_version, max_disk_utilization_pct, recorded_storage_tb').limit(1);
console.log(error ?? data);
"
```

A clean result with all three columns present (as `null`) confirms it exists.

3. Deploy the code.

**Order matters.** The columns must exist before the code deploy: `submitCalculation`
writes all three on every submission, and a write to a missing column fails the
insert — which would take down the calculator's save path, not degrade it.
Applying the migration early is harmless, since nothing reads the columns until
the code ships.

## Verification after deploy

1. Run one calculator submission and check the row:

```bash
node --env-file=.env.local --import tsx -e "
import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await c.from('submissions')
  .select('id, created_at, storage_tb, recorded_storage_tb, calc_version, max_disk_utilization_pct')
  .order('created_at', { ascending: false }).limit(3);
console.table(data);
"
```

Expect on the new row: `calc_version = 2`, `max_disk_utilization_pct = 90`
(unless the slider was moved), and `storage_tb / recorded_storage_tb ≈ 1.244`
— that ratio is `1 / (0.90 × 0.8931)` and is the whole buffer, visible in one
number. Older rows keep three NULLs.

2. Open that submission's detail page and its System Estimate PDF. Both should
   state the footage figure, the utilization the quote was sized at, and that
   bandwidth is a peak.

3. Open an **older** submission's detail page and PDF. Its numbers must be
   byte-identical to before the deploy — they render from banked values — and
   the buffer line must read as not recorded rather than showing 90%.
