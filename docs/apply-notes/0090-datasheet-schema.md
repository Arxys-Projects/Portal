# Apply note — ADR 0090 (datasheet spec schema)

Stop-and-flag migrations for Andy to apply. The agent holds no DDL credentials
(2026-07-17 CLI 401); apply each via the Supabase **dashboard SQL editor**. The
CLI never auto-applies these (rollbacks live in `supabase/rollback/`, outside
`supabase/migrations/`). Both are safe: one creates a brand-new table, the other
adds only nullable columns. Neither seeds any values and neither touches the 21
existing `product_specs` rows' data.

Nothing in the app reads either surface yet (Phase 2 design / Phase 3 build come
later), so there is no degraded-until-applied window — the schema simply sits
ready.

## Order

Independent of each other; apply in either order. Suggested:

### 1. New table — appliance_specs

`supabase/migrations/20260723000001_datasheet_appliance_specs.sql`
— creates `public.appliance_specs` (management/ACM/workstation archetypes),
RLS SELECT-open to authenticated + admin-only writes, mirroring `camera_specs`.
No rows seeded. Uses the shared `public.is_admin(uuid)` helper (already present).
Rollback: `supabase/rollback/datasheet-appliance-specs-rollback.sql`.

### 2. Additive columns — product_specs

`supabase/migrations/20260723000002_datasheet_product_specs_additive.sql`
— adds 18 nullable columns to `product_specs` (rack-video). `security_features`
is `text[] NOT NULL DEFAULT '{}'` so the existing 21 rows stay valid; everything
else is plain nullable. No constraint, index, RLS, or existing-column change.
Rollback: `supabase/rollback/datasheet-product-specs-additive-rollback.sql`.

## Judgment calls to confirm before applying (see JOURNAL 2026-07-23 / ADR 0090)

1. **Table name `appliance_specs`** — kept from the plan's working name. Fits the
   `*_specs` convention; covers workstations too (not strictly "appliances").
   Rename now if you prefer (e.g. `system_specs`) — cheaper before any seed.
2. **Two-CPU-variant = two rows sharing `sheet_group`** (V250+V255, V260+V265),
   not one row with paired CPU columns. Keeps one-row-per-SKU + the price join.
3. **Camera matrix = `camera_matrix jsonb`**, not a child table (4 rows × 2 SWs).
4. **Dimensions = two display strings** (`dimensions_mm` / `dimensions_in`), not
   six per-axis numerics.
5. **`product_specs` feature-block columns: none added** — already covered by
   `raid_level_display` / `battery_raid` / `hdd_count` / `drive_bays` /
   `max_cameras_h265`; drive-failure tolerance derived in the template.
6. **V150 `family_type`** will be a seed-time call (`acm` vs `management`) — no
   value is written in this phase.

## Verify after applying

1. `appliance_specs` exists, is empty, RLS on: as an authenticated non-admin,
   `select * from appliance_specs` returns 0 rows (not an error); an insert is
   rejected. As admin/service-role, an insert succeeds.
2. `product_specs` still has its 21 rows; `select count(*) from product_specs`
   unchanged; the 18 new columns are present and null (except
   `security_features = '{}'`).
3. `npx tsc --noEmit` still clean and `npm test` still green — no app code reads
   these columns yet, so nothing should move.
