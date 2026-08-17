# Apply note — calculator math Phase A: `submissions` sizing-model columns

> ## ⚠️ CORRECTION 2026-08-17 — the column comments were never applied
>
> **This note claimed below that the comments landed on 2026-08-12. They did not.**
> Measured live on 2026-08-17: `calc_version`, `max_disk_utilization_pct` and
> `recorded_storage_tb` all returned a NULL comment. The technique was
> control-checked in the same query — `input_state`, `is_preferred`,
> `parent_submission_id` and `status` *do* carry their comments — so this is a real
> gap in the second step, not a bad query.
>
> **Root cause: the "second step" below was recorded as one unit but is two.** The
> constraints and the comments were applied together in the note's telling, and only
> the constraints were then verified (with the query in this note). The comments
> were never checked, so a partial run looked complete. **A verification query that
> covers only part of what a step did will certify the whole step.**
>
> **Fix:** run `supabase/migrations/20260817000001_calculator_math_phase_bc.sql`
> ([apply note](./0131-calculator-math-phase-bc.md)). It comments all four columns,
> so it is a superset of what this migration should have left behind — it repairs
> this gap and adds the `calc_version` 3 meaning in one pass. No runtime impact
> either way: comments are metadata and no read or write path consults them.
>
> **Still unverified: the three `NOT VALID` range guards from that same step.** The
> claim below that they were "confirmed present 2026-08-12" is specific enough to
> be credible, and it is the half that *was* checked — but it came from the same
> partially-applied step, so re-run the constraint query before trusting it.
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
> Constraints recorded as confirmed present 2026-08-12 — **re-verify, see the
> correction above**. To check:
>
> ```sql
> select conname, convalidated
> from pg_constraint
> where conrelid = 'public.submissions'::regclass and contype = 'c'
> order by conname;
> ```
>
> The three `submissions_*_check` rows added here should report
> **`convalidated = false`, and that is correct** — it is the `NOT VALID`
> flag, meaning Postgres never rescanned the existing table. New writes are
> still checked. The older constraints on this table report `true` only
> because they were created normally, back when the table was small. If a
> `submissions_*_check` row is **missing entirely**, that is the constraint half of
> the same gap; re-run the Phase A migration file, which is idempotent on the
> columns but will error on an already-present constraint name.
>
> To check comments — note the control columns, which is what this note was missing:
>
> ```sql
> select a.attname as column_name, col_description(a.attrelid, a.attnum) as comment
> from pg_attribute a
> where a.attrelid = 'public.submissions'::regclass
>   and a.attnum > 0 and not a.attisdropped
>   and col_description(a.attrelid, a.attnum) is not null
> order by a.attname;
> ```

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
