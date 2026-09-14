-- V400 / V700 / V800 — AMD EPYC 9015 CPU refresh and camera-capacity re-tier.
--
-- Business reason: the AMD EPYC 9135 in the V700 and V800 is EOL, and the
-- V400's EPYC 9115 is replaced as part of the same part consolidation. All
-- three families move to the AMD EPYC 9015 (8C/16T, 3.6 GHz base / 4.1 GHz
-- turbo, PassMark 30689), which collapses V500 through V800 onto a single CPU
-- tier.
--
-- Camera-capacity consequences, confirmed by the product owner:
--   * V700 and V800 drop from 325 to 275 — identical to the value V500 and
--     V600 carry live in product_specs (verified by SELECT on 2026-09-14, not
--     carried forward from the 20260529000001 seed, which has since drifted
--     under admin edits).
--   * V400 drops from 200 to 150.
-- max_cameras and max_cameras_h265 are always equal in this product line, so
-- both columns get the same number on every row touched.
--
-- cpu_model ('AMD EPYC 9005 Series' — the 9015 is a part within the 9005
-- series) and cpu_cache ('64MB') are already correct on every row touched and
-- are restated here so this migration is a complete statement of the new CPU
-- tier rather than a partial patch.
--
-- Both cores/threads columns are set. product_specs carries two:
-- cpu_cores_threads (rendered by /comparison via display-specs.ts) and
-- cores_threads (the QuickCompare twin, rendered on the datasheet PDF via
-- from-product-specs.ts and on /videox-compare via videox-compare/data.ts).
-- They are in sync on all 18 V400–V800 rows today and the admin form writes
-- both; updating only one would leave the datasheet and compare pages showing
-- the old 16C/32T.
--
-- WHY A MIGRATION AND NOT THE ADMIN FORM (ADR 0096): this is a one-time,
-- 11-row change that would otherwise be ~11 rounds of manual form edits. It is
-- a deliberate, product-owner-approved exception, and the trade-off is
-- accepted knowingly: the resulting product_specs_audit rows land with
-- updated_by = null (a service_role connection has no auth.uid()) and the
-- form's cross-field zod validation is skipped. The table's own check
-- constraints still apply, and every new value clears them. This is NOT a
-- precedent for other product_specs edits.
--
-- DELIBERATELY NOT TOUCHED: msrp, storage_raw_tb, hdd_count, model_name,
-- max_bandwidth_mbps, revision_date, and every other column. Any pricing
-- consequence of the CPU swap is a separate change through the Master Sheet /
-- scripts/push-prices.ts pipeline.

-- V400 — the trailing % is DELIBERATE, not an oversight. It matches the two
-- semi-custom variants VX5-V400-128-NCD and VX5-V400-192-NCD as well as the
-- three base SKUs. Those NCD rows are hardware-identical to their base SKU by
-- design (20260818000001) and differ only in NIC/GPU; they are hidden from the
-- price list and the recommender (20260818000002) but project-quote's
-- assemble.ts resolves SKUs directly with no catalog-visibility filter, so a
-- quote naming one still needs correct CPU and capacity data.
-- (There is no VX5-V400-160-NCD. 5 rows match.)
update public.product_specs set
  cpu_model         = 'AMD EPYC 9005 Series',
  cpu_model_full    = 'AMD EPYC 9015 3.6Ghz 8/16 Core',
  cpu_cores_threads = '8C/16T',
  cores_threads     = '8C/16T',
  cpu_base_ghz      = 3.6,
  cpu_turbo_ghz     = '4.1 Ghz',
  cpu_passmark      = 30689,
  cpu_cache         = '64MB',
  max_cameras       = 150,
  max_cameras_h265  = 150
where id like 'VX5-V400-%';

-- V700 — 3 rows (384, 480, 576). No NCD variants in this family.
update public.product_specs set
  cpu_model         = 'AMD EPYC 9005 Series',
  cpu_model_full    = 'AMD EPYC 9015 3.6Ghz 8/16 Core',
  cpu_cores_threads = '8C/16T',
  cores_threads     = '8C/16T',
  cpu_base_ghz      = 3.6,
  cpu_turbo_ghz     = '4.1 Ghz',
  cpu_passmark      = 30689,
  cpu_cache         = '64MB',
  max_cameras       = 275,
  max_cameras_h265  = 275
where id like 'VX5-V700-%';

-- V800 — 3 rows (576, 720, 864). No NCD variants in this family.
update public.product_specs set
  cpu_model         = 'AMD EPYC 9005 Series',
  cpu_model_full    = 'AMD EPYC 9015 3.6Ghz 8/16 Core',
  cpu_cores_threads = '8C/16T',
  cores_threads     = '8C/16T',
  cpu_base_ghz      = 3.6,
  cpu_turbo_ghz     = '4.1 Ghz',
  cpu_passmark      = 30689,
  cpu_cache         = '64MB',
  max_cameras       = 275,
  max_cameras_h265  = 275
where id like 'VX5-V800-%';
