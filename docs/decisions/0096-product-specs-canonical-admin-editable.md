# 0096 — `product_specs` becomes the canonical, admin-editable Arxys spec source

- **Status**: Accepted
- **Date**: 2026-07-27
- **Related**: 0091 (the editability bar), 0092 (capacity math + the V100 open item), 0094
  (`product_specs` as the recommender's capacity source), 0095 (the deferred `products` capacity
  drop this unblocks), 0090 (the reference-table pattern this partly departs from), 0042
  (`product_specs` origin), 0086 (price lives only in `current_products`)
- **Design**: [`datasheets/spec-admin-form-design.md`](../../datasheets/spec-admin-form-design.md)

## Context

[ADR 0091](./0091-spec-unification-scope-boundary.md) set the bar for a canonical Arxys spec
source: **editable in a portal admin form — no deploy, no script run.** Measured against it, the
Phase 0 audit found *zero* current sources qualify. `product_specs` looks like the exception and
is not: its real source of truth is `data/server-specs.json`, a repo file applied by a manually
run interactive script, and **26 of its 43 columns are not reachable even that way** — they were
added and seeded inside later migrations and have no other write path. Two of those, `hdd_count`
and `raid_level_display`, are inputs to `usableCapacityTb()`, so the Calculator's storage sizing
depends on values only a database migration can correct.

Re-verifying against production before designing narrowed the problem considerably. All 42 live
columns are read by something — `videox-compare/data.ts` maps all 25 QuickCompare columns,
`comparison/display-specs.ts` labels the 16 JSON-fed ones, and the Calculator, both PDFs, the
Project Quote and the Price Book read overlapping subsets. Only `product_sku` is dead (null in
all 21 rows; the refresh script rewrites it to null every run). The 26 migration-only columns are
**fully populated**: across 43 columns × 21 rows the only nulls are `notes` (20) and
`product_sku` (21).

So the data is complete and the shape is already the one every consumer reads. `product_specs`
has **no write policy at all** — RLS grants `SELECT` to `authenticated` and nothing else, so only
`service_role` reaches it. The gap is a write path, not a table.

This also means brief §5.2 is not separate work. Give the table a real write path and the
17-script-fed / 26-migration-only split stops existing, `hdd_count` and `raid_level_display`
included.

The risk is the mirror image of the benefit. Editing those two columns changes
`usableCapacityTb()`, which changes net-usable storage on the Price Book, the System Estimate
PDF, the Project Quote and the Customer Proposal, **and changes which SKU the recommender picks**.
ADR 0092's parity fix moved the V800 by 6.7% and that was visible enough to owe sales a
retroactive heads-up. A form makes an equivalent change two keystrokes with no review step. And
per brief §1's lesson, the test suite cannot see it: the fixtures hand-populate capacity, so they
never notice a change in which values reach a path.

## Options considered

**Where canonical lives**
- **Extend `product_specs` in place** — it is already the shape all 8 consumers read; add write
  policies and a form. No data migration, no cutover, no consumer changes.
- **New `arxys_specs` table, migrate and cut over** — a clean-sheet shape, but every consumer
  moves (two of them via `select *` with explicit field mapping) for no data-model gain. The
  constraints that motivated a companion table for other archetypes (`NOT NULL CHECK (> 0)` on
  storage and camera counts) are archetype constraints already solved by ADR 0090, not a reason
  to rebuild the rack table.
- **Keep the JSON canonical, write it from a form via a commit/PR** — fails the bar; still needs a
  deploy.
- **Google Sheet → Supabase sync**, mirroring the pricing pipeline — ADR 0091's named cheaper
  fallback. A second sync pipeline to own, and ~43 columns across archetypes is awkward in a sheet.

**Change history** — none (matching the sibling reference tables) / `updated_at` + `updated_by`
only / timestamps plus an insert-only audit table.

**Editor authorisation** — admin only / admin-or-internal (what the `/admin` layout already
admits).

**`data/server-specs.json`'s `arxys.models`** — cut the write path and freeze the key as
provenance / cut it and delete the key / keep a guarded `--reseed-arxys` escape hatch.

**The V100's two configurations** (ADR 0092 left this open) — a nullable alternate RAID-level
column now / two alternate capacity columns / defer to the override-retirement slice.

## Decision

**1. `product_specs` becomes the canonical source, edited in place.** No new table, no cutover.
A STOP-AND-FLAG migration (new RLS policies; applied by dashboard per the ADR 0083 / 0089
convention) adds admin `INSERT` and `UPDATE` policies mirroring `camera_specs`, using
`public.is_admin((select auth.uid()))`.

**2. No `DELETE` grant and no delete policy.** Per ADR 0094 a SKU with no `product_specs` row is
*skipped* by `loadCandidateSpecs` rather than falling back to its nameplate, so deleting a spec
row silently removes a SKU from the recommender pool with no error anywhere. Availability belongs
to `products.active`. Withholding the grant means the form cannot offer the control by mistake.

**3. Timestamps plus an insert-only `product_specs_audit` table** (`spec_id`, `changed_at`,
`changed_by`, `operation`, `before`/`after` JSONB), written by a `security definer` trigger that
also maintains `updated_at` / `updated_by`. The trigger rather than the server action, because it
cannot be bypassed, it captures `service_role` writes, and it keeps the action free of
bookkeeping it could forget. This departs from ADR 0090's "no timestamps — rows are refreshed by
a reviewed admin seed load, not edited row-by-row in the app": that reasoning was right for a
seed-loaded table and stops being right the moment the table is edited row-by-row, which is the
point of this change.

**4. Admin only, enforced at the RLS layer.** The `/admin` layout admits admin *and* internal, so
the page and every action check `isAdmin` specifically, matching `project-quote-actions.ts` and
the admin XLSX export. The action uses `createSupabaseServerClient()`, never
`createSupabaseAdminClient()`, so an application-level bug cannot produce an unauthorised write.

**5. Validation is the safety design, aimed at one known failure mode.**
`raid_level_display` is a `<select>` over exactly the values `usableCapacityTb()` understands
(`1`, `5`, `6`, `60`, `JBOD`, plus `NA` marked deprecated) — free text would let `'RAID 6'` or
`'6 '` fall through to the RAID-5 branch and *silently overstate* usable capacity, re-introducing
the under-spec bug ADR 0092 fixed. The form shows a live net-usable preview computed by the
production helper, naming the delta and where it will appear. Cross-field rules refuse the save:
`hdd_count <= drive_bays`; RAID 60 requires `hdd_count % 12 == 0`; RAID 1 requires an even count.
Every rule was checked against the live 21 rows so none rejects data already in production.

**6. `data/server-specs.json` loses its write path, keeps its data.** The script's two upserts are
already independent (`toProductSpecRow` reads only `arxys.models`, `toCompetitorProductRow` only
`vms_vendors`), and nothing reads the JSON at runtime. Remove the `product_specs` upsert and
rename the script for what remains; leave `arxys.models` in place with a header comment marking
it a **frozen pre-DB import artifact** — the provenance record, not an authority. No escape
hatch: a `--reseed-arxys` flag would leave a live path that silently clobbers admin edits.
`competitor_products` keeps its JSON-plus-script path, out of scope per ADR 0091.

**7. A nullable `raid_level_alt_display` column models the V100's two configurations**, closing
ADR 0092's open item ("two columns, or a nullable alternate-configuration field — not a
deletion"). One level column beats two capacity columns because `storage_raw_tb` and `hdd_count`
are identical across both configurations of the same box; only the level varies.
`usableCapacityTb()` learns `'1'` (mirror, `parity = n/2`) and `'JBOD'` (`parity = 0`).
**The migration creates the column and seeds nothing** — the three V100 rows are corrected
through the form as its first real use, because seeding data inside a migration is the practice
this initiative exists to end.

**Explicitly not in this slice:** `appliance_specs` and the 18 additive columns stay unapplied and
the datasheet project stays paused; `skuExtraData`-overrides-computed is not retired (it needs
`appliance_specs` for the management/ACM `ssdStorage` strings); the decimal/binary document pair
and the home for non-tabular marketing copy remain open; and ADR 0095's drop of
`products.max_cameras` / `max_storage_tb` stays its own migration.

## Consequences

**Positive:** the ADR 0091 bar is met for the source every consumer already reads, and the
26-migration-only-columns problem closes as a side effect rather than as separate work —
including the two columns the Calculator's sizing depends on. No cutover, no consumer changes, no
data migration. `data/server-specs.json` stops being a co-authority that could overwrite edits.
The V100's capacity becomes modelled data instead of a hand-typed string, which also removes a
correct-by-coincidence result: `'NA'` currently falls through to the RAID-5 branch and returns
`raw/2` — the right RAID 1 figure *only because the V100 has exactly 2 drives*. No published
figure moves, because at `n = 2` the new mirror rule gives the same parity the fallback did.
ADR 0095's deferred drop is unblocked; its stated revisit condition was exactly this work.
The migration pattern, action shape and form structure all generalise to `appliance_specs`, the
additive columns, and `camera_specs` — the duplicate-UI cost ADR 0091 flagged as a negative.

**Negative:** a human can now change customer-facing capacity in production in two keystrokes,
with the audit table and the form's validation as the only review step — that is the trade the
bar asks for, but it is a real reduction in friction on numbers with a customer-facing blast
radius. A form over 42 fields is a large surface to build and maintain, and every future column
needs a field added or it is silently unreachable through the only supported write path — the
same failure mode as the 26 columns, one layer up. The audit table grows unbounded with no
retention policy. `product_specs` now has two write paths in the codebase (the form, and
`service_role` for recovery), so "how did this value get here" has two answers until the audit
table has history. The migration applies by hand out of band from the code, so there is a window
where the form exists and the policies do not. And the initiative still has four open items after
this slice; unification is not finished, only its foundation.

**When to revisit:** if edit frequency turns out low enough that the form is disproportionate
(ADR 0091's Google-Sheet fallback becomes the cheaper answer); if a second archetype's form makes
the duplication worse than a generic schema-driven editor would be; if the audit table needs
retention; if spec edits ever need to be reviewed or staged rather than applied live, which would
argue for a draft/publish state on the row; or if a RAID level outside `1 / 5 / 6 / 60 / JBOD`
appears, at which point the select and `usableCapacityTb()` move together.
