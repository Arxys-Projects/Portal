# Apply note — calculator math Phases B + C: `submissions` column comments

> **STOP AND FLAG.** Apply by hand via the Supabase **dashboard SQL editor**, not
> `supabase db push` — several migrations on this project were applied by hand and
> never recorded in remote history, so a push would try to re-run them.
>
> **This migration is comments only. There is no structural change.** No column is
> added, dropped, retyped or backfilled; no constraint, index or policy is touched.
> That is the unusual part of this apply note and the reason to read it before
> running anything: unlike the Phase A note, **the code does not depend on this
> migration**, so the ordering constraint that governed Phase A does not apply here.
>
> **It also repaired a Phase A gap.** Measured live 2026-08-17: Phase A's three column
> comments had never been applied, despite its apply note saying they were (that note
> now carries a correction). This migration comments **all four** columns, so it fixed
> Phase A's omission and added the `calc_version` 3 meaning in one pass.
>
> **Applied to production 2026-08-17 and verified**: all four comments non-null, and
> Phase A's three `NOT VALID` range guards re-confirmed present with the expected
> definitions in the same session. Nothing is outstanding on either note.

| | File |
|---|---|
| Forward | `supabase/migrations/20260817000001_calculator_math_phase_bc.sql` |
| Rollback | none needed — see [Rollback](#rollback) |
| Decisions | [ADR 0131](../decisions/0131-audio-metadata-reversed-into-the-buffer.md) · [0132](../decisions/0132-retention-moves-to-the-camera-group.md) · [0133](../decisions/0133-vsr-rating-basis-is-complexity-tier-2.md) |
| Plan | [`docs/calculator-math-phase-2-plan.md`](../calculator-math-phase-2-plan.md) |

## Why there is no DDL

Both shapes that changed live inside existing `jsonb` columns:

| Field | Change | Migration needed |
|---|---|---|
| `groups_payload.groups[].retentionDays` | **added** (ADR 0132) | none — `jsonb` |
| `groups_payload.groups[].recordsAudioMetadata` | **stops being written** (ADR 0131) | none — `jsonb` |
| `input_state.version` | 2 → 3 | none — `jsonb` |

The banked `recordsAudioMetadata` values are deliberately **not** stripped from old
rows. An old row keeps what it recorded, nothing reads the field any more, and a
mass `jsonb` rewrite of the whole table to delete a dead key would be all risk and
no benefit.

## What the comments record

Two scalar columns **change meaning** at `calc_version` 3, and that is only
discoverable from the column comments:

- **`calc_version`** gains value 3. `storage_tb` moves again — the +5%
  audio/metadata term removed, the utilization default tightened 90% → 88% — so the
  column is no more comparable across the 2→3 boundary than across 1→2.
- **`retention_days`** was *the* retention every group was sized at. From version 3
  it is the **longest** group retention, with per-group values in `groups_payload`.
  **Identical on a uniform project**, which is every row written before this deploy,
  so the change is monotone and no existing row is misdescribed.

`max_disk_utilization_pct` and `recorded_storage_tb` get their comments refreshed
for the same reason.

## What is deliberately NOT changed

`submissions_max_disk_utilization_pct_check` still admits **60..90** even though the
app now writes at most 88. Banked version-2 rows hold 90 legitimately; narrowing the
check would make the table's own history invalid. The app is the authority on the
writable range, and the CHECK is only a sanity floor/ceiling.

## How to apply

1. Paste the whole forward migration into the dashboard SQL editor and run it.
2. Confirm the comments landed:

```sql
select a.attname as column, col_description(a.attrelid, a.attnum) as comment
from pg_attribute a
where a.attrelid = 'public.submissions'::regclass
  and a.attname in ('calc_version','retention_days','max_disk_utilization_pct','recorded_storage_tb')
order by a.attname;
```

Expect four non-null comments, with `calc_version` mentioning version 3 and
`retention_days` mentioning "LONGEST group retention".

**Order does not matter.** Comments are metadata; no read or write path consults
them. Apply before or after the code deploy, or forget to apply it and nothing
breaks at runtime — the cost is only that the next person to read the schema will
not know `retention_days` changed meaning. Which is exactly why it should still be
applied.

## Verification after deploy

1. Save one calculator submission with **two groups at different retentions** (say
   15 and 90 days) and check the row:

```bash
node --env-file=.env.local --import tsx -e "
import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await c.from('submissions')
  .select('id, created_at, calc_version, retention_days, max_disk_utilization_pct, storage_tb, recorded_storage_tb, groups_payload')
  .order('created_at', { ascending: false }).limit(1);
const r = data[0];
console.log({ calc_version: r.calc_version, retention_days: r.retention_days,
  util: r.max_disk_utilization_pct,
  perGroupRetention: r.groups_payload.groups.map(g => g.retentionDays),
  audioFieldStillWritten: r.groups_payload.groups.some(g => 'recordsAudioMetadata' in g),
  bufferRatio: (r.storage_tb / r.recorded_storage_tb).toFixed(4) });
"
```

Expect: `calc_version = 3`; `retention_days = 90` (the **longest**, not the project
default); `util = 88` unless the slider was moved; `perGroupRetention = [15, 90]`;
`audioFieldStillWritten = false`; and `bufferRatio ≈ 1.2724` — that is
`1 / (0.88 × 0.8931)`, the whole buffer plus the binary charge in one number, up
from Phase A's 1.2441 at the 90% default.

2. Open that submission's detail page and its System Estimate PDF. Both should show
   a per-group **Retention** column and state the retention as a **range**
   ("15–90 days"), not one number.

3. Open an **older** submission (calc_version 1 or 2) and its PDF. Its storage,
   bandwidth and price figures must be byte-identical to before the deploy — they
   render from banked values and nothing recomputes (audit §Q7). Its Retention
   column should show the row's single figure on **every** group, and the retention
   line should read as one figure rather than a range.

4. Confirm no surface still offers the removed audio/metadata toggle:

```bash
grep -rniE "recordsAudio|records audio|analytics metadata|Audio \+ metadata" \
  --include="*.ts" --include="*.tsx" --include="*.css" src/
```

Expect only explanatory comments in `rehydrate.ts` — no JSX, no labels, no schema
field.

## Rollback

Nothing to roll back structurally. If the code is reverted, the comments become
stale but harmless; restore the Phase A wording from
`supabase/migrations/20260812000001_calculator_math_phase_a.sql` if that matters.

The **code** rollback is the one with a consequence: reverting to version-2 behavior
would resume writing `recordsAudioMetadata` and stop writing per-group retention,
and any version-3 rows already banked would then be read by version-2 code — which
ignores per-group retention and would size a revision of such a row at the project
default instead. Version-3 rows are not readable by version-2 code without that
loss, so a revert wants the version-3 rows identified first:

```sql
select count(*) from public.submissions where calc_version >= 3;
```
