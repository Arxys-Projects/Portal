# Apply note — ADR 0096 (`product_specs` admin-editable)

> **APPLIED to production 2026-07-27** via the dashboard SQL editor, and verified.
> Checks 1, 2 and 3 below all pass — including both triggers, whose `before` /
> `after` snapshots carry 46 keys (43 original columns + the three added here) and
> differ only in `updated_at`. Check 6 re-verified by a live trace over all 21
> rows, identical to the pre-migration baseline. Checks 4–5 need a signed-in
> session and are now covered by block 21 (a–n) in `scripts/test-rls.ts` — 14
> tests, all passing against production. The rest of this note is kept as the
> record of what was applied and how to back it out.

One stop-and-flag migration for Andy to apply. The agent holds no DDL
credentials (2026-07-17 CLI 401); apply via the Supabase **dashboard SQL
editor**. The CLI never auto-applies these — the rollback lives in
`supabase/rollback/`, outside `supabase/migrations/`.

- **Forward:** `supabase/migrations/20260727000001_product_specs_admin_editable.sql`
- **Rollback:** `supabase/rollback/product-specs-admin-editable-rollback.sql`
- **Design:** [`datasheets/spec-admin-form-design.md`](../../datasheets/spec-admin-form-design.md) §1
- **Decision:** [ADR 0096](../decisions/0096-product-specs-canonical-admin-editable.md)

## What it does

Four additive parts, in one file:

1. **`INSERT` / `UPDATE` policies** for admins on `product_specs`, mirroring
   `camera_specs` (`20260615000002`) and using `public.is_admin((select auth.uid()))`.
   **No `DELETE` grant and no delete policy** — deliberate, per ADR 0094: a SKU
   with no spec row is silently *skipped* by the recommender rather than
   erroring, so deletion is a footgun with no signal. This is the one place the
   migration diverges from the `camera_specs` template.
2. **`updated_at` / `updated_by`** on `product_specs`. The 21 existing rows take
   `now()` and `null`.
3. **`product_specs_audit`** — a new insert-only table plus two triggers on
   `product_specs`: `BEFORE` to stamp `updated_at`/`updated_by`, `AFTER`
   (`security definer`) to record the before/after JSONB. The design describes
   one AFTER trigger doing both; an AFTER trigger's return value is discarded,
   so it is implemented as two. Behaviour is as designed.
4. **`raid_level_alt_display`** — one nullable text column on `product_specs`.

**No values are seeded and no existing column is changed.** The three V100 rows
still carry `raid_level_display = 'NA'`; they get corrected to `'1'` / `'JBOD'`
through the form, as its first real use (design §7 step 6).

## Safe to apply now?

Yes, and there is no rush. Nothing in the app writes `product_specs` today and
the admin form (design §3) is **not built yet** — it is explicitly out of this
slice. So applying this changes nothing a user can see; it makes the write path
exist so the form can be built against it. The reverse order would give a form
that only returns permission errors.

The one behaviour change that is live the moment you apply: an admin could write
`product_specs` through the PostgREST API directly. That is the intent.

Ordering against the two still-unapplied datasheet migrations
(`20260723000001` / `20260723000002`, ADR 0090): **independent, either order.**
This migration touches none of their columns, and the audit trigger snapshots
whatever shape the row has via `to_jsonb`, so the 18 additive columns will
simply start appearing in `before` / `after` once they exist.

## Verify after applying

1. **Columns exist, data intact.**
   `select count(*) from product_specs;` → still 21.
   `select id, raid_level_display, raid_level_alt_display, updated_at, updated_by
    from product_specs order by id limit 5;` → `raid_level_alt_display` and
   `updated_by` all null, `updated_at` all set to the apply time.
2. **Audit table exists and is empty.** `select count(*) from product_specs_audit;` → 0.
3. **The trigger fires and stamps.** As admin (or in the SQL editor), a harmless
   no-op update:
   ```sql
   update public.product_specs set notes = notes where id = 'VX5-V100-32';
   select operation, spec_id, changed_by, before is not null as has_before
     from public.product_specs_audit;
   ```
   → one `update` row for `VX5-V100-32` with `has_before = true`.
   `changed_by` is null when run from the SQL editor (no `auth.uid()`), which is
   the designed behaviour for non-user writes. `product_specs.updated_at` for
   that row should have moved.
4. **Non-admin cannot write.** As an authenticated non-admin partner:
   `select` still returns 21 rows; an `update` is rejected by RLS; a `select`
   against `product_specs_audit` returns 0 rows (policy denies, not an error).
5. **No `DELETE` is possible for anyone but `service_role`** — confirm
   `delete from product_specs where id = '...'` fails as an authenticated admin.
   Do this on a row you do not mind losing if it unexpectedly succeeds, or wrap
   it in a transaction you roll back.
6. **No published figure moved.** Nothing in this migration changes capacity
   inputs, but the cheap check is the Price Book: V100 rows should still read
   16 / 20 / 24 TB net usable and the V800 600 TB.
7. `npx tsc --noEmit` clean and `npm test` green — no app code reads the new
   columns yet, so nothing should move.

## Afterwards

- The migration will not show as applied in `supabase migration list` (dashboard
  applies do not write the CLI's history table). That is expected for
  stop-and-flag migrations here — do not "fix" it with `db push`.
- Design §7 steps 3, 5 and 6 (the form, the live round-trip script, the V100
  correction) all unblock once this is applied.
- **Checks 4–5 are codified.** Block 21 (a–n) in `scripts/test-rls.ts`, added
  2026-07-27 once the policies existed, mirrors the `camera_specs` block
  (12a–12g) and adds the case camera_specs has no equivalent for — an admin
  `DELETE` must be rejected — plus the provenance assertions a SQL-editor write
  cannot make, since it has no `auth.uid()`. All 14 pass. Re-run with
  `node --env-file=.env.local --import tsx scripts/test-rls.ts` after any change
  to these policies.
