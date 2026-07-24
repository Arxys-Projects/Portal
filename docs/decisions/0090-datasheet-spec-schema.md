# 0090 — Datasheet spec schema (appliance_specs + product_specs additive)

- **Status**: Accepted
- **Date**: 2026-07-23
- **Related**: 0042 (product_specs origin), 0044 (QuickCompare additive columns), 0057/0058 (camera_specs reference-table pattern), datasheet plan (`datasheets/datasheetplan.md`), Phase 0 audit (JOURNAL 2026-07-23)

## Context

The data-driven two-page datasheet (PDF + on-screen) must render for ~10 SKUs across three archetypes: rack-video (V100–V800), management/ACM (V150/V250/V255/V260/V265), and workstation (SW10/SW20). Phase 0 confirmed `product_specs` holds only the 21 rack-video SKUs, and that its `storage_raw_tb`, `max_cameras`, and `max_cameras_h265` columns are `NOT NULL CHECK (> 0)` — which structurally rejects a no-storage/no-camera management or directory server. It also confirmed the datasheet needs fields no table carries yet: power, dimensions/weight, structured warranty, environmental, regulatory + NDAA, a security-feature list, remote-management text, VMS/OS drive text, and a revision date.

This ADR covers the schema-only phase: the shape of a new companion table, the additive columns for `product_specs`, and three specific representation calls (two-CPU-variant, dimensions, and the workstation camera matrix). Migrations are written but unapplied (stop-and-flag). Three upstream decisions from the plan are treated as fixed: new table not relaxed constraints; the 7-VMS strip is authoritative (`product_specs.vms_certified` untouched); rear photography is out of scope.

## Options considered

- **Relax `product_specs` constraints to admit all archetypes** — one table, but drops the `> 0` guards the calculator/comparison tool rely on, and adds archetype-specific nullable columns (GPU, camera matrix) onto every rack-video row. Rejected per the fixed plan decision.
- **New `appliance_specs` companion table** — mirrors the `camera_specs` precedent (a new reference table rather than a widened existing one); leaves `product_specs` and its constraints untouched. **Chosen.**
- **Two-CPU-variant: one row with paired `cpu_a_*`/`cpu_b_*` columns** vs **two rows sharing a `sheet_group` key.** Paired columns strand nullable `_b` fields on every single-variant sheet and break the one-row-per-SKU price join. Two rows + `sheet_group` chosen.
- **Workstation camera matrix: child table** vs **JSONB column.** A child table adds a second RLS surface and a join for 8 total rows never queried across sheets. JSONB chosen.
- **Dimensions: six per-axis numerics (mm+in)** vs **two display strings.** Numerics invite mm/in drift and serve no query/sort need. Two strings chosen.

## Decision

**1. New table `public.appliance_specs`** for the management/ACM/workstation archetypes. Text PK = SKU (matches `product_specs.id`), RLS SELECT-open to `authenticated` with admin-only writes, no `created_at`/`updated_at` — identical to the `camera_specs` pattern. A `family_type` discriminator (`management` | `acm` | `workstation`, CHECK-enforced) drives which optional blocks the template expects populated; archetype-specific columns stay nullable (population is a template concern, not a DB constraint, consistent with the seed-gated `camera_specs`). Name kept from the plan's working name; it fits the `*_specs` convention and `system_specs` was avoided as too close to `product_specs`.

**2. Two CPU variants → two rows sharing `sheet_group`.** V250/V255 (and V260/V265) each get their own SKU row; both carry `sheet_group = 'V250'` (resp. `'V260'`). The template renders one datasheet per distinct `sheet_group`, laying grouped rows out as CPU/RAM variant columns. This keeps one-row-per-SKU parity with `product_specs` and an identical SKU→`current_products` price join. Single-SKU sheets set `sheet_group` to their own group.

**3. Workstation camera matrix → `camera_matrix jsonb`.** The 4-row resolution/codec/FPS/camera-count/bandwidth table is stored as a JSONB array on the parent row (shape documented in the migration comment), the same call as `camera_specs.sensor_detail`. No child table.

**4. Dimensions → two display strings** (`dimensions_mm`, `dimensions_in`) plus `shipping_weight`, in both tables. GPU sub-fields are flat nullable numeric/text columns (queryable, typed), workstation-only.

**5. `product_specs` gets nullable additive columns only** (power, dimensions/weight, warranty_years/terms, environmental, regulatory + NDAA, `security_features text[]`, remote_mgmt, os_drive_desc, revision_date) — same additive pattern as ADR 0044, no constraint or existing-column changes.

**6. Feature-block substitution values (Task 3) add nothing to `product_specs`.** RAID level, cachevault, drive counts, and H.265 capacity are already covered by `raid_level_display` / `battery_raid` / `hdd_count` / `drive_bays` / `max_cameras_h265`; drive-failure tolerance is derived from RAID level + drive count in the template. `appliance_specs` carries the same-named availability columns so the shared feature blocks read one substitution surface across both tables.

## Consequences

**Positive:** rack-video path (calculator, comparison, price join) is untouched; every archetype is representable, including no-storage management servers ("NA") and dual-CPU sheets; one datasheet template reads a consistent, mostly same-named surface across two tables; migrations are additive/reversible with paired rollbacks.

**Negative:** two spec tables to keep in sync where columns overlap; `family_type`-driven "required" fields are enforced in the template, not the DB, so a malformed seed row is caught in review rather than by a constraint; the camera matrix's internal shape is unvalidated JSONB.

**When to revisit:** if a workstation sheet ever needs the camera matrix queried/joined across SKUs (promote to a child table); if a spec value must be filtered/sorted numerically (promote the relevant text field to typed columns); if a fourth archetype or a non-SKU-keyed sheet appears (reassess the PK = SKU assumption).
