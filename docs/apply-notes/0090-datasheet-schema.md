# Apply note — the datasheet spec schema (ADR 0090, amended by ADR 0097)

> **APPLIED to production 2026-07-28** via the dashboard SQL editor, both files, and verified.
> Checks 1–6 all pass: `appliance_specs` and `appliance_specs_audit` created empty with RLS on;
> `authenticated` holds `select/insert/update` and **not** `delete` on `appliance_specs` and
> **no** insert on its audit table; `pg_policies` shows exactly three policies on
> `appliance_specs` (SELECT/INSERT/UPDATE) and one on the audit table, with no DELETE row
> anywhere; the rolled-back throwaway row produced an `insert` audit row (`before` null) then an
> `update` row (`before` set), both snapshotting all **64** columns, so the BEFORE stamp and the
> AFTER audit both fire; `product_specs` still has its 21 rows and now **68** columns, and a
> no-op update proved the existing ADR 0096 triggers picked the 22 new columns up automatically
> — snapshot width 46 → 68, no write-path work needed. Check 8 (non-admin write refused, admin
> DELETE refused with a real `auth.uid()`) still needs test-rls block 22, which lands with the
> surface in build step 5; check 3's grant/policy inspection is the evidence until then.
> Check 10 confirmed as designed: `roundtrip-product-specs.mts` now reports **22 failures**,
> naming exactly the new columns, with PARSES and PRESERVES green (21 rows, 43/43 fields).
> Build step 4 closes that window. The rest of this note is kept as the record of what was
> applied and how to back it out.

Two stop-and-flag migrations for Andy to apply. The agent holds no DDL credentials
(2026-07-17 CLI 401); apply each via the Supabase **dashboard SQL editor**. The CLI never
auto-applies these — the rollbacks live in `supabase/rollback/`, outside
`supabase/migrations/`.

| | Forward | Rollback |
|---|---|---|
| New table | `supabase/migrations/20260729000001_datasheet_appliance_specs.sql` | `supabase/rollback/datasheet-appliance-specs-rollback.sql` |
| Additive | `supabase/migrations/20260729000002_datasheet_product_specs_additive.sql` | `supabase/rollback/datasheet-product-specs-additive-rollback.sql` |

- **Design:** [`datasheets/datasheet-phase2-admin-surface-design.md`](../../datasheets/datasheet-phase2-admin-surface-design.md) §2
- **Decisions:** [ADR 0090](../decisions/0090-datasheet-spec-schema.md) (the shape),
  [ADR 0097](../decisions/0097-datasheet-surfaces-join-admin-editable-pattern.md) (the amendment)

> **These files were amended on 2026-07-29 and never applied in their earlier form.** The
> 2026-07-23 drafts predated ADR 0096: `appliance_specs` carried no provenance columns and
> granted admin DELETE, and the additive migration was 18 columns. Applied as-is they would
> have recreated the no-admin-write-path problem the SSOT initiative closed. What changed:
> `appliance_specs` gains `updated_at`/`updated_by`, an insert-only `appliance_specs_audit`
> table and the BEFORE-stamp / AFTER-audit trigger pair, and **loses its DELETE grant and
> policy**; six factsheet-verified columns are added across the two files; both files were
> renamed to post-`20260727000001` timestamps so filename order matches apply order. This
> note describes the amended files — the ones in the repo now.

## What they do

### 1. New table — `appliance_specs` (`20260729000001`)

Creates `public.appliance_specs`, 64 columns: hardware specs for the management / ACM /
workstation archetypes that `product_specs` structurally cannot hold (its
`storage_raw_tb` / `max_cameras` / `max_cameras_h265` are `NOT NULL CHECK (> 0)`). One row per
SKU; rows that share one physical two-page datasheet share a `sheet_group` (V250+V255,
V260+V265). Uses the shared `public.is_admin(uuid)` helper, already present.

It ships with the full `20260727000001` pattern rather than the `camera_specs` one:

- **RLS**: SELECT open to `authenticated`; INSERT / UPDATE admin-only.
- **No `DELETE` grant, no delete policy.** Deliberate, per ADR 0097 — once the
  `skuExtraData` overrides retire, these rows are the only source for the
  management/ACM/workstation Price Book strings and for the datasheet renderer, so a
  deletion silently blanks those surfaces with no error anywhere (the ADR 0094 failure
  shape). `service_role` stays the recovery path for a mis-created row.
- **`updated_at` / `updated_by`** maintained by a BEFORE trigger, never by app code.
- **`appliance_specs_audit`** — insert-only from the client's side (admin SELECT, no
  INSERT/UPDATE/DELETE grant at all), written by an `AFTER` `security definer` trigger. Two
  triggers rather than one because an AFTER trigger's return value is discarded and so cannot
  stamp the row; same implementation note as the 0096 pair.

**No rows are seeded.** All seven rows (V150 / V250 / V255 / V260 / V265 / SW10 / SW20) are
typed in through `/admin/appliance-specs/new` — build step 6, and each entry is itself the
end-to-end write-path validation. The V150's `management`-vs-`acm` classification is now an
entry-time call made in the form's `family_type` select, not a seed-time judgment.

### 2. Additive columns — `product_specs` (`20260729000002`)

Adds **22** nullable columns to `product_specs` (the 21 rack-video rows): power (wattage,
redundancy, AC input, DC input, max consumption), `cooling`, dimensions (mm + in) and shipping
weight, structured warranty (`warranty_years` + `warranty_terms`, legacy `warranty` untouched),
environmental (operating/storage temp, humidity), regulatory (safety, emissions, NDAA prose),
`security_features`, `remote_mgmt`, `os_drive_desc`, `display_ports`, `revision_date`.

`security_features` is `text[] NOT NULL DEFAULT '{}'` so the existing 21 rows stay valid;
everything else is plain nullable. No constraint, index, RLS, or existing-column change, and
no values are seeded. It needed **no** write-path work of its own: the policies, both triggers
and the audit table from `20260727000001` are row-level and `to_jsonb`-based, so these columns
are covered the moment they exist — the audit snapshots simply grow from 46 keys to 68.

## Safe to apply now?

Yes, and there is no rush. **Nothing in the app reads or writes either surface yet** — the
`/admin/appliance-specs` surface and the `product_specs` form extension are build steps 4–5,
explicitly after this apply. So applying changes nothing a user can see; it makes the write
path exist so the forms can be built against it. The reverse order would ship forms whose
saves 400 against columns that don't exist.

One behaviour change is live the moment you apply: an admin could write `appliance_specs`
through the PostgREST API directly, and could write the 22 new `product_specs` columns. That
is the intent.

**Order: independent, either order.** They touch disjoint objects. Both are safe on their own;
neither leaves the other in a broken state. Against the already-applied `20260727000001`
(ADR 0096) both are strictly downstream, which is what the rename encodes.

## Verify after applying

### `appliance_specs`

1. **Table exists, empty, RLS on.**
   ```sql
   select count(*) from public.appliance_specs;                 -- 0
   select relrowsecurity from pg_class where oid = 'public.appliance_specs'::regclass;  -- true
   ```
2. **Audit table exists and is empty.** `select count(*) from public.appliance_specs_audit;` → 0.
3. **`DELETE` is not grantable to clients** — the withheld grant, checkable from the SQL
   editor:
   ```sql
   select
     has_table_privilege('authenticated', 'public.appliance_specs', 'select') as sel,   -- t
     has_table_privilege('authenticated', 'public.appliance_specs', 'insert') as ins,   -- t
     has_table_privilege('authenticated', 'public.appliance_specs', 'update') as upd,   -- t
     has_table_privilege('authenticated', 'public.appliance_specs', 'delete') as del,   -- f
     has_table_privilege('authenticated', 'public.appliance_specs_audit', 'insert') as audit_ins;  -- f
   ```
   And no delete policy exists:
   `select policyname, cmd from pg_policies where tablename = 'appliance_specs';` → three rows
   (`select_all`, `insert_admin`, `update_admin`), **no `DELETE` row**.
4. **Both triggers fire — stamp and audit.** The table is empty, so use a throwaway row inside
   a transaction you roll back; this leaves neither a spec row nor an audit row behind, which
   matters because entry through the form is the point (ADR 0097 §8):
   ```sql
   begin;
   insert into public.appliance_specs
     (id, model_name, product_group, family_type, sheet_group,
      cpu_model, ram_spec, os_edition, form_factor)
   values ('ZZZ-APPLY-CHECK', 'apply check', 'ZZZ', 'management', 'ZZZ',
           'cpu', 'ram', 'os', 'rack');

   update public.appliance_specs set notes = notes where id = 'ZZZ-APPLY-CHECK';

   select operation, spec_id, changed_by, before is not null as has_before
     from public.appliance_specs_audit order by id;
   -- → one 'insert' row (has_before = false), then one 'update' row (has_before = true)

   select updated_at is not null as stamped, updated_by
     from public.appliance_specs where id = 'ZZZ-APPLY-CHECK';
   -- → stamped = true; updated_by null (the SQL editor has no auth.uid())
   rollback;
   ```
   `changed_by` / `updated_by` being null is the designed behaviour for non-user writes; the
   populated-`auth.uid()` case needs a signed-in session (see below).

### `product_specs`

5. **Rows intact, columns present.**
   `select count(*) from public.product_specs;` → still **21**.
   ```sql
   select id, power_max_consumption, cooling, display_ports, power_dc_input, security_features
     from public.product_specs order by id limit 5;
   ```
   → the four new text columns all null, `security_features` `{}` on every row.
   Column count: `select count(*) from information_schema.columns
   where table_schema='public' and table_name='product_specs';` → **68** (46 + 22).
6. **The existing triggers pick up the new columns.** A no-op update, then check the snapshot
   width — this is the claim that let the additive migration skip write-path work:
   ```sql
   update public.product_specs set notes = notes where id = 'VX5-V100-32';
   select count(*) from jsonb_object_keys(
     (select after from public.product_specs_audit order by changed_at desc limit 1)
   );   -- → 68
   ```
   (This leaves one audit row, which is fine — `product_specs_audit` already holds the 0096
   verification and V100-correction history.)
7. **No published figure moved.** Neither migration touches a capacity input, but the cheap
   check is the Price Book: the V100 rows should still read 16 / 20 / 24 TB net usable and the
   V800 600 TB.

### Both — the checks a SQL editor cannot make

8. **Non-admin write refused, admin DELETE refused, provenance attributed.** These need a
   signed-in session with a real `auth.uid()`, so they are codified rather than run by hand:
   **`scripts/test-rls.ts` block 22** mirrors block 21 (a–n) against `appliance_specs` —
   SELECT open to both roles, INSERT/UPDATE admin-only with internal refused, DELETE refused
   for partner **and admin**, provenance stamped on an admin write, and
   `appliance_specs_audit` admin-SELECT-only with insert refused. Block 22 lands with the
   surface in build step 5; run it then:
   ```bash
   node --env-file=.env.local --import tsx scripts/test-rls.ts
   ```
   Until then, check 3's grant/policy inspection is the available evidence that DELETE is
   unreachable.
9. `npx tsc --noEmit` clean and `npm test` green — no app code reads any of this yet, so
   nothing should move.

### Expected to fail, for one build step only

10. **`scripts/roundtrip-product-specs.mts` COVERS will fail after this apply**, naming
    exactly the 22 new columns as unreachable through `/admin/specs`. That is correct and
    expected: apply deliberately precedes the form code (build steps 4–5), because the reverse
    order ships a form whose saves fail against columns that don't exist. Landing step 4
    closes the window. `roundtrip-appliance-specs.mts` does not exist yet; when it does
    (step 5) it exits 0 on an empty table with an explicit "0 rows — coverage unchecked" note
    until the seven rows are entered.

## Judgment calls, for the record (JOURNAL 2026-07-23 / ADR 0090)

Still open only in the sense that they are cheap to change *before* rows exist:

1. **Table name `appliance_specs`** — kept from the plan's working name. Fits the `*_specs`
   convention; covers workstations too (not strictly "appliances"). Renaming is cheapest now,
   before any row is entered.
2. **Two-CPU-variant = two rows sharing `sheet_group`** (V250+V255, V260+V265), not one row
   with paired CPU columns. Keeps one-row-per-SKU and the SKU→price join.
3. **Camera matrix = `camera_matrix jsonb`**, not a child table (4 rows × 2 workstation SKUs).
   ADR 0090 logged "unvalidated JSONB" as a negative; ADR 0097 §4d closes it at the form's
   structured five-key row editor, the only write path.
4. **Dimensions = two display strings** (`dimensions_mm` / `dimensions_in`), not six per-axis
   numerics.
5. **No feature-block columns added to `product_specs`** — already covered by
   `raid_level_display` / `battery_raid` / `hdd_count` / `drive_bays` / `max_cameras_h265`;
   drive-failure tolerance is derived in the template.
6. **V150 `family_type`** — no longer a seed-time call, because there is no seed. It is chosen
   in the form's `family_type` select by whoever enters the row (ADR 0097 §4a); the migration
   comment records `acm`, on the access-control branding, as the expectation.

## Afterwards

- Neither migration will show as applied in `supabase migration list` — dashboard applies do
  not write the CLI's history table. That is expected for stop-and-flag migrations here;
  **do not "fix" it with `db push`**, which would try to re-run them.
- Build steps 4–6 unblock: the `product_specs` form extension, the `appliance_specs` surface
  (+ `roundtrip-appliance-specs.mts` + test-rls block 22), then entry of the seven appliance
  rows and the 22 additive values across the 21 rack rows. Step 2 (the shared
  `src/lib/spec-form/` kit) is independent and can land either side of this apply.
- If you need to back either one out, the rollbacks are exact reverses. Note that the
  `appliance_specs` rollback **drops both tables**, discarding any entered rows and their
  audit history — export first if entry has started.
