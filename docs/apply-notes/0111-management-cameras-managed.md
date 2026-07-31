# Apply note — cameras managed on `appliance_specs` (ADR 0111)

> **NOT YET APPLIED.** Two nullable integer columns. Read the ordering section before
> deploying — the code and the migration are not interchangeable in sequence.

| | File |
|---|---|
| Forward | `supabase/migrations/20260731000001_management_cameras_managed.sql` |
| Rollback | `supabase/rollback/management-cameras-managed-rollback.sql` |
| Decision | [ADR 0111](../decisions/0111-management-is-a-ledger-variant.md) |

```sql
alter table public.appliance_specs
  add column cameras_managed_min integer,
  add column cameras_managed_max integer;
```

Purely additive. No existing column, value, index, policy or constraint is touched, both
new columns are nullable, and the 7 existing rows stay valid untouched.

---

## ⚠ Apply the migration BEFORE the code deploys

Same rule and same reason as [ADR 0107's note](./0107-datasheet-media-and-usage.md), which
is the precedent this follows exactly.

The admin action writes the **full parsed field set** — `.insert(values)` / `.update(payload)`
in `admin/appliance-specs/actions.ts` — so from the moment the deployed form knows a field
whose column does not exist, **every save on `/admin/appliance-specs` fails** with a Postgres
column-not-found error. Not just the new fields: every save, on every row, including the
workstation and ACM rows that will never carry a cameras-managed figure.

This is not a theory — the round-trip script says so out loud against production right now:

```
Column coverage
  67 live columns, 67 form fields, 2 intentionally unsurfaced.
  FAIL  form field 'cameras_managed_min' has no matching column on appliance_specs — a save would be rejected by Postgres.
  FAIL  form field 'cameras_managed_max' has no matching column on appliance_specs — a save would be rejected by Postgres.
```

That output is the pre-apply state and is expected. It turns clean the moment the migration
runs, which makes it the check to run before and after.

**The datasheet half is safe in either order**, which is worth knowing but is not a reason to
relax the rule. The adapter reads the columns with `!= null`, and a column that does not
exist comes back `undefined` from PostgREST, which `!= null` treats the same as null — so the
sheet renders today, against production as it stands, with an em dash in the two places the
figures belong. That was verified by rendering it: `scripts/render-datasheet.ts --model V250`
produces 3/3 pages against the un-migrated table.

## How to apply

By hand via the Supabase **dashboard SQL editor**, as with 0107 and 0090. Not
`supabase db push`: several migrations on this project were applied by hand and never
recorded in the remote history, so a push would try to re-run them. The CLI also has no
usable credentials here — `supabase migration list` returns a login-role 401 and `.env.local`
carries no `SUPABASE_DB_PASSWORD`.

1. Paste the forward migration into the dashboard SQL editor and run it.
2. Confirm the columns landed and every row is still readable:

```bash
node --env-file=.env.local --import tsx scripts/roundtrip-appliance-specs.mts
```

Expect **7 live rows**, every live column reachable, and **67/67** form fields preserved
(up from 65/65 — the two new fields are the difference).

3. Only then deploy the code.

## Then enter the figures

The columns ship empty on purpose. **Neither figure is on the real V250 factsheet** — the
phase-2 transcription records `max_bandwidth_mbps` as *"not found on any server sheet"* and
transcribes no camera count for either variant, so the "1,000 Mbit/s" and "250 / 250+" on the
design mockup are the designer's. A migration does not get to invent a capacity claim for a
customer-facing document.

Until they are entered, `/admin/datasheets` lists the V250 / V255 sheet with its gaps named,
and the sheet itself prints an em dash in the headline strip, the ladder cell and both
tables. To fill them in, on `/admin/appliance-specs`:

| Row | Field | Value |
|---|---|---|
| `VX5-V250-MGM` | Cameras managed — **to** | the ceiling, e.g. `250`. Leave *from* blank. |
| `VX5-V255-MGM` | Cameras managed — **from** | the floor, e.g. `250`. Leave *to* blank. |
| both | Max bandwidth (Mbps) | the throughput figure, if one is published |

The ceiling/floor split is what lets one stored fact produce all four phrasings the sheet
needs — `Up to 250`, `250 and above`, `≤ 250 cameras`, `250 / 250+` — without re-parsing a
sentence. Getting them the wrong way round inverts the sheet's meaning, so the form's hints
spell out which is which.

## Two data defects this surfaced, both unrelated to the migration

Neither blocks anything; both are one edit each on `/admin/appliance-specs`.

1. **`raid_level_display` disagrees across the pair** — `1` on the V250, blank on the V255,
   though they are one chassis. The picker now names it, and the sheet would otherwise print
   the difference as though it were deliberate. (Both rows' `notes` record that the source
   factsheet contradicts *itself* on RAID — p2 says RAID 5, p1 says mirrored — so the fix is
   a decision, not a transcription.)
2. **`gbe_10_ports` is `0` and `gbe_1_ports` is `2`** on both rows, while `network` reads
   *"2x (Two) Enterprise 10Gb Eth RJ45 ports + 1Gb IPMI"*. The two look swapped. Nothing is
   broken by it — the Network spec row reads the prose column and is correct — but the
   page-1 attribute bullet for Ethernet ports is derived from the count and so is absent
   from the sheet.
