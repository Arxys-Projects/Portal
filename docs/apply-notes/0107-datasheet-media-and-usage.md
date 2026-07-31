# Apply note — datasheet photo paths + usage paragraph (ADR 0107)

> **APPLIED to production 2026-07-30** via the dashboard SQL editor, and verified before the
> code was pushed — so the outage window described below never opened. `product_specs` reads
> **71 live columns** (68 form fields + the 3 intentionally unsurfaced), `appliance_specs`
> **68**; both round-trips report every live column reachable, with 21 rows at 68/68 and 7
> rows at 65/65 form fields preserved, and the appliance sheet groups still pairing V250 and
> V260. The rest of this note is kept as the record of what was applied and how to back it
> out.
>
> Applied by hand via the Supabase **dashboard SQL editor**: the agent holds no DDL
> credentials (2026-07-17 CLI 401), and `supabase db push` is not an option on this project —
> several migrations were applied by hand and never recorded in the remote history, so a push
> would try to re-run them.

| | File |
|---|---|
| Forward | `supabase/migrations/20260730000001_datasheet_media_and_usage.sql` |
| Rollback | `supabase/rollback/datasheet-media-and-usage-rollback.sql` |
| Decision | [ADR 0107](../decisions/0107-datasheet-photos-are-public-paths.md) |

Six nullable columns, three on each spec table: `product_photo_path`, `rear_io_photo_path`,
`usage_paragraph`. Purely additive — no existing column, value, index, policy or constraint
is touched, and every new column is nullable, so the 21 `product_specs` rows and the 7
`appliance_specs` rows stay valid untouched.

---

## ⚠ Order matters here, and it is the reverse of last time

**Apply the migration BEFORE the code deploys.** Not after, and not "some time that week".

The admin actions write the full parsed field set — `.insert(values)` / `.update(payload)` in
`actions.ts` — so the moment the deployed form knows a field whose column does not exist,
**every save on `/admin/specs` and `/admin/appliance-specs` fails** with a Postgres
column-not-found error. Not the new fields: *every* save, on every row.

This inverts the window ADR 0090 shipped through. There the columns landed first and the
form learned them two build steps later, so the gap was harmless — the round-trip simply
reported 22 columns not yet reachable. Here the form learns them first, and the same gap is
an outage on the only supported write path.

Verified, not assumed — `scripts/roundtrip-product-specs.mts` against production on
2026-07-30, with the form changes present and the migration unapplied:

```
Column coverage
  FAIL  form field 'usage_paragraph' has no matching column on product_specs — a save would be rejected by Postgres.
  FAIL  form field 'product_photo_path' has no matching column on product_specs — a save would be rejected by Postgres.
  FAIL  form field 'rear_io_photo_path' has no matching column on product_specs — a save would be rejected by Postgres.
3 failure(s). The schema and production data disagree.
```

PARSES and PRESERVES were green throughout — 21 rows, 68/68 fields preserved — so the only
disagreement is the missing columns, exactly as expected.

**Sequence:** apply the migration in the dashboard → run the two round-trip scripts to
confirm they go green → then push/deploy the code.

---

## Checks after applying

1. **Columns exist, six of them.** `product_specs` goes 68 → 71 columns, `appliance_specs`
   67 → 70. All six nullable, all `text`, all null on every existing row.
2. **Round-trips go green.** Both are read-only:
   ```bash
   node --env-file=.env.local --import tsx scripts/roundtrip-product-specs.mts
   node --env-file=.env.local --import tsx scripts/roundtrip-appliance-specs.mts
   ```
   Coverage is the assertion that matters — "every live column is reachable". The per-row
   figure counts *form fields*, not columns, so it stays 68/68 and 65/65; what changes at
   apply time is the live-column count in the coverage header (68 → 71 and 65 → 68).
   Coverage still failing after the apply means the migration did not run in full.
3. **The audit picks the columns up with no write-path work.** Edit one row through the
   form, then check its audit row snapshots all the new columns. The 0096 triggers are
   row-level and `to_jsonb`-based, so this should hold automatically — the 0090 apply note
   verified it explicitly when the last 22 columns landed. Worth re-confirming once.
4. **A save still works on an untouched row.** The point of check 4 is the outage window
   above: open any SKU, save without editing, confirm it succeeds.
5. **The path warning fires.** Type `price-book/foo.png` (no leading slash) into Product
   photo path — the form should warn about the missing slash and still save.

## Backing out

`supabase/rollback/datasheet-media-and-usage-rollback.sql` drops exactly these six columns.
**Deploy a code revert first**, for the same reason as above, or the rollback creates the
outage it is undoing. Any photo paths or usage paragraphs typed in since the apply are
destroyed by the drop and are not recoverable from `families.ts` — `greatFor` is per-family
copy, `usage_paragraph` is per-SKU. The audit tables hold the values if it comes to that.
