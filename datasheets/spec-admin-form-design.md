# §5.1 — Admin-editable canonical spec source: design

- **Date:** 2026-07-27
- **Status:** Design agreed, not built. Scope confirmed with stakeholder before writing.
- **Decision record:** [ADR 0096](../docs/decisions/0096-product-specs-canonical-admin-editable.md)
- **Reads on:** [Phase 0 audit](./spec-source-audit-phase0.md) §5, [ADR 0091](../docs/decisions/0091-spec-unification-scope-boundary.md)
  (the editability bar), [ADR 0092](../docs/decisions/0092-net-usable-capacity-definition.md)
  (capacity math and the V100 open item), [ADR 0094](../docs/decisions/0094-recommender-pool-from-product-specs.md)
  (`product_specs` is the recommender's capacity source), [ADR 0095](../docs/decisions/0095-retain-products-capacity-columns.md)
  (the deferred drop this slice unblocks).

## The finding this design starts from

Measured against ADR 0091's bar — *editable in a portal admin form, no deploy, no script
run* — zero spec sources qualify. `product_specs` looks like the exception and is not: its
real source of truth is `data/server-specs.json`, a repo file applied by a manually-run
interactive script, and 26 of its 43 columns are not even reachable that way. They were
seeded inside migrations and have no other write path.

The design conclusion is narrower than the finding suggests. Re-verified against production
2026-07-27:

- All 42 live columns are read by something. `videox-compare/data.ts` maps all 25
  QuickCompare columns; `comparison/display-specs.ts` labels the 16 JSON-fed ones; the
  Calculator, both PDFs, the Project Quote, and the Price Book read overlapping subsets.
  **Only `product_sku` is dead** — null in all 21 rows, and the refresh script rewrites it
  to null on every run.
- The 26 "migration-only" columns are **fully populated**. Across all 43 columns × 21 rows
  the only nulls are `notes` (20) and `product_sku` (21).

So the canonical *shape* is not in question. `product_specs` already is the shape every
consumer reads, and its data is complete and correct. **What is missing is a write path, not
a table.** `product_specs` has no write policy at all today: RLS grants `SELECT` to
`authenticated` and nothing else, so only `service_role` can write it.

That collapses brief §5.2 into §5.1. Add an admin write policy and a form, and the
17-script-fed / 26-migration-only split stops existing — including `hdd_count` and
`raid_level_display`, the two columns feeding the Calculator's storage math. The 26-column
problem is not separate work; it is a consequence of this work.

## Scope

**In:** `product_specs` — 21 rack-video SKUs, 42 live columns. A migration giving it a real
write path and provenance, an admin CRUD form, the script cut, and the modelled V100
alternate-configuration column.

**Out, deliberately:**

- `appliance_specs` and the 18 additive `product_specs` columns. Both migrations stay
  unapplied; the datasheet project stays paused. Nothing here invalidates them, and the
  form generalises to them later without rework (see *Extension* below).
- Retiring `skuExtraData`-overrides-computed. It needs `appliance_specs` first, because the
  `ssdStorage` strings for management/ACM SKUs have no `product_specs` row to compute from.
  This slice adds the column the V100 half of that retirement will need, and stops there.
- The decimal/binary figure pair on documents (ADR 0092 item 3) — document phase.
- Where non-tabular marketing copy lives (audit §6.3) — still open, still a separate call.
- Dropping `products.max_cameras` / `max_storage_tb` (ADR 0095). This slice is the
  "canonical-source work" that ADR's *When to revisit* points at, but the drop migration is
  its own change: it must land with the `push-prices.ts` carry-forward removal and the
  `scripts/test-rls.ts` update together.

## 1. Migration — one dashboard apply

New RLS policies make this security-sensitive, so it is a **STOP-AND-FLAG** migration
applied by hand via the Supabase dashboard SQL editor, per the ADR 0083 / 0089 convention.
The CLI is unauthenticated in this environment anyway. Needs a paired rollback in
`supabase/rollback/` and an apply-note in `docs/apply-notes/`.

Four parts, all additive. No existing column changes, no data changes.

### 1a. Admin write policies

```sql
grant insert, update on public.product_specs to authenticated;

create policy product_specs_insert_admin on public.product_specs
  for insert to authenticated
  with check (public.is_admin((select auth.uid())));

create policy product_specs_update_admin on public.product_specs
  for update to authenticated
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));
```

Mirrors the `camera_specs` pattern (migration `20260615000002`), which is the precedent an
admin form needs and the one table that already has it. The `(select auth.uid())` wrapper is
this repo's RLS-performance idiom from `20260615000001_rls_perf_consolidation.sql`.

**No `DELETE` grant and no delete policy.** ADR 0094: a SKU with no `product_specs` row is
*skipped* by `loadCandidateSpecs` rather than falling back to its raw nameplate. Deleting a
spec row therefore removes a SKU from the recommender pool silently, with no error anywhere.
Availability is `products.active`'s job, not this table's. Withholding the grant means the
form cannot offer a destructive control even by mistake.

### 1b. Provenance columns

```sql
alter table public.product_specs
  add column updated_at timestamptz not null default now(),
  add column updated_by uuid references public.partners(id);
```

`updated_by` is nullable: migration and `service_role` writes have no user. Both are
maintained by the trigger in 1c, not by the server action, so a write that bypasses the form
still gets stamped.

This departs from ADR 0090's reading of the reference-table pattern ("no `created_at` /
`updated_at` — rows are refreshed by a reviewed admin seed load, not edited row-by-row in
the app"). That reasoning was correct for a seed-loaded table and stops being correct the
moment the table is edited row-by-row in the app, which is the entire point of this change.

### 1c. Audit trail

```sql
create table public.product_specs_audit (
  id          bigserial primary key,
  spec_id     text not null,
  changed_at  timestamptz not null default now(),
  changed_by  uuid references public.partners(id),
  operation   text not null check (operation in ('insert', 'update')),
  before      jsonb,          -- null on insert
  after       jsonb not null
);
```

Insert-only: `SELECT` to admins, no `INSERT` / `UPDATE` / `DELETE` grant to `authenticated`
at all. Rows are written by a `security definer` `AFTER INSERT OR UPDATE` trigger on
`product_specs`, which also maintains `updated_at` / `updated_by` from `auth.uid()`.

The trigger, not the server action, is the right home for three reasons: it cannot be
bypassed, it captures `service_role` writes (so the last `update-comparison-data.ts` run
before the cut is recorded), and it keeps the action free of bookkeeping it could forget.

Why an audit table is worth its cost here specifically: editing `hdd_count` or
`raid_level_display` changes `usableCapacityTb()`, which changes net-usable storage on the
Price Book, the System Estimate PDF, the Project Quote, the Customer Proposal, **and which
SKU the recommender picks**. ADR 0092's parity fix moved the V800 by 6.7% and that was
visible enough to owe sales a heads-up. A form makes that a two-keystroke change with no
review step. Stored snapshots protect existing submissions and quotes; nothing protects the
next one.

### 1d. V100 alternate configuration

```sql
alter table public.product_specs add column raid_level_alt_display text;
```

ADR 0092 left this explicitly open: the V100 ships configurable as RAID 1 or JBOD, "a
configurable unit is exactly the case the override path exists for", and when the override
path retires the V100 "needs a modelled answer — two columns, or a nullable 'alternate
configuration' field — not a deletion." This is that field.

One nullable column beats two capacity columns because the capacity is already derivable:
`usableCapacityTb(storage_raw_tb, hdd_count, level)` needs only the level to vary, and
`storage_raw_tb` / `hdd_count` are identical across both configurations of the same box.

**The migration creates the column and sets no values.** The three V100 rows currently carry
`raid_level_display = 'NA'` and are corrected to `'1'` / `'JBOD'` through the form, as its
first real use. Seeding data inside a migration is the exact practice this initiative exists
to end, and doing it here would be self-defeating.

There is a latent fragility this fixes, worth stating because it currently reads as correct
code. `'NA'` is not handled by `usableCapacityTb()`; it falls through to the documented
RAID-5 branch, `parity = 1`, giving `raw × (2−1)/2 = raw/2` — which happens to equal the
RAID 1 mirror figure **only because the V100 has exactly 2 drives**. The published 16/20/24
TB figures are right for the wrong reason, and an edit to `hdd_count` would silently break
them with no test failure.

## 2. Code — `usableCapacityTb()` learns two levels

`capacity-utils.ts` gains `'1'` (mirror, `parity = n/2`) and `'JBOD'` (`parity = 0`), and
`raid_level_alt_display` becomes the second call for the alternate figure. `'NA'` keeps
falling through to RAID 5 so existing rows are unaffected.

**No published number moves.** At `n = 2` the new RAID 1 rule gives `parity = 1`, identical
to what the RAID-5 fallback already produces. The change is pure modelling: it makes the
right answer arrive for the right reason and makes the level meaningful the moment an admin
sets it. Blast radius on current data is zero, verifiable by re-running the live trace over
all 21 rows before and after.

## 3. The form

Routes under the existing admin shell, which already gates admin-and-internal at the layout:

| Route | Purpose |
|---|---|
| `/admin/specs` | Index: 21 rows, SKU / model / net-usable / last edited / edited by |
| `/admin/specs/[sku]` | Edit one row |
| `/admin/specs/new` | Create a row for a SKU that has none |

**Authorisation: admin only, not admin-or-internal.** The layout gate admits both, so the
page and every action check `gate.isAdmin` specifically — matching
`project-quote-actions.ts` and the admin XLSX export, the other two admin-only surfaces
inside that shell. The nav item is hidden for non-admins by passing `isAdmin` into
`AdminNav` alongside the existing `pendingRequests` prop. RLS is the real enforcement point:
the server action uses `createSupabaseServerClient()`, **not** `createSupabaseAdminClient()`,
so a bug in the application-level check cannot produce an unauthorised write.

Actions live in `src/app/(app)/admin/specs/actions.ts` — `"use server"`, zod-parsed,
`{ status: "idle" | "error" | "ok" }` state shape, `dbError()` for safe messages, following
`admin/partners/actions.ts` exactly. `revalidatePath` on `/admin/specs`, `/price-book`, and
the affected family page.

Fields group into seven sections, following the groupings the migrations already comment:

1. **Identity** — `id` (read-only when editing), `model_name`, `form_factor`, `rack_units`, `notes`
2. **CPU** — `cpu_model`, `cpu_model_full`, `cpu_cores_threads`, `cores_threads`, `cpu_base_ghz`, `cpu_turbo_ghz`, `cpu_passmark`, `cpu_cache`, `mem_bandwidth`, `avx_512`, `workload_affinity`, `chiplet_arch`, `infinity_guard`
3. **Memory** — `ram_gb`, `ram_spec`
4. **Storage & RAID** — `storage_raw_tb`, `drive_bays`, `hdd_count`, `hdd_mtbf`, `raid_support`, `raid_level_display`, `raid_level_alt_display`, `battery_raid`, `os_ssd_type`, `os_redundancy`
5. **Capacity & throughput** — `max_cameras`, `max_cameras_h265`, `max_bandwidth_mbps`
6. **Networking & power** — `network`, `gbe_1_ports`, `gbe_10_ports`, `sfp_addon`, `hotswap_power`
7. **Software & support** — `os`, `os_edition`, `warranty`, `vms_certified`, `avigilon_gpu`

`product_sku` is **not** surfaced. It is null in all 21 rows, the audit found it dead, and
its own migration comment calls it "reserved for future join to `products.sku`" — a join
done in-process on `product_specs.id == products.sku` instead. It belongs in the same drop
migration as the ADR 0095 columns.

## 4. Safety design

This is the part that carries the risk, and it is designed against a specific known failure
mode rather than in general. Brief §1's lesson: the test suite cannot see a change in
*which* rows or columns reach a code path, because the fixtures hand-populate capacity. A
form editing `hdd_count` or `raid_level_display` is precisely that class of change, on
demand, in production, by a human.

**(a) `raid_level_display` and `raid_level_alt_display` are `<select>`, never free text.**
Live values are exactly `'5'`, `'6'`, `'60'`, `'NA'` — four, verified. `usableCapacityTb()`
matches on exact strings and sends everything else to the RAID-5 branch, so `'RAID 6'`,
`'6 '`, or `'06'` would *silently overstate* usable capacity by one drive's worth. That is
the under-spec failure ADR 0092 was written to fix, re-introduced through a text input. The
option list is the levels the function understands: `1`, `5`, `6`, `60`, `JBOD`, plus `NA`
labelled deprecated so the three uncorrected V100 rows still round-trip.

**(b) A live net-usable preview, computed by the production helper.** The form shows
`usableCapacityTb()`'s output — and the alternate figure when a second level is set — as the
editor types, next to the currently saved value, with the delta named: *"600 TB → 560 TB
(−6.7%). This figure appears on the Price Book, every new System Estimate PDF, Project
Quote, and Customer Proposal, and changes which SKU the Calculator recommends."* Importing
the real helper rather than restating the formula is what makes the preview trustworthy.

This is the highest-value element in the slice. Every capacity defect in this initiative was
invisible at the point of change and surfaced later in a rendered document. The preview
moves the consequence to the moment of editing.

**(c) Cross-field validation in the zod schema, refusing the save.** Each rule is checked
against the live 21 rows so none of them reject data already in production:

| Rule | Why | Holds on live data |
|---|---|---|
| `hdd_count <= drive_bays` | more drives than bays is physically impossible | yes — equal on all 21 rows |
| `raid_level_display = '60'` ⇒ `hdd_count % 12 == 0` | span parity is `2 × round(n/12)`; a non-multiple rounds and the figure is wrong | yes — V700 24, V800 36 |
| `raid_level_display = '1'` ⇒ `hdd_count % 2 == 0` | a mirror needs pairs | yes (V100, n=2) |
| `NOT NULL` / `CHECK (> 0)` columns re-checked in zod | the DB constraint should never be the first line of defence | yes |

`max_cameras_h265 != max_cameras` is a **warning, not a rejection** — the two are equal on
all 21 rows today, so a difference is more likely a typo than a real spec, but it is not
impossible and the form should not refuse it.

**(d) No delete control**, backed by the withheld grant (§1a).

## 5. The `data/server-specs.json` cut

The two upserts in `update-comparison-data.ts` are **already independent**:
`toProductSpecRow` reads only `data.arxys.models`, `toCompetitorProductRow` only
`data.vms_vendors`. Nothing reads the JSON at runtime — `display-specs.ts` is a hand-derived
copy, not a loader. So the cut is clean:

- Remove `toProductSpecRow`, the `product_specs` upsert, and the `JsonArxysModel` type from
  the script. Rename it for what it then does (`update-competitor-data.ts`) and rewrite the
  header.
- Leave `arxys.models` in the JSON, with a header comment marking it a **frozen pre-DB
  import artifact**: the provenance record for the seeded values, not an authority. Deleting
  it would lose the only record of where the 21 rows came from, and with the upsert gone it
  is inert.
- `competitor_products` keeps its JSON-plus-script path untouched. It is out of scope per
  ADR 0091 and will want the same treatment later; the form generalises to it.

After this, re-running the competitor refresh cannot overwrite admin edits — which it can
today, and which is the reason the JSON could not stay a co-authority.

## 6. Verification plan

Fixture tests are necessary and not sufficient here, per brief §1. Both halves:

**Pure unit tests** — the zod schema (each cross-field rule, both directions), and
`usableCapacityTb()`'s new `'1'` / `'JBOD'` levels including `n = 2`, odd `n`, and the
unchanged `'NA'` fallback.

**A live-data round-trip, which is the actual acceptance check.** A committed `.mts` script
reads all 21 production rows and runs each through the form's own zod parser, asserting every
one parses clean. This catches "the schema rejects data that is already live" — a class of
bug fixtures structurally cannot see, because fixtures are written to match the schema. Run
before merge and after the dashboard apply.

Plus: `tsc --noEmit`, the full suite (278 baseline), eslint on changed files only (`npm run
lint` also walks `.claude/worktrees/`, so counts appear doubled when another session has one),
and a before/after live trace of net-usable across all 21 rows confirming no published figure
moved.

## 7. Build sequence

1. Migration + paired rollback + `docs/apply-notes/0096-*.md`. **Hand to Andy; do not apply.**
2. `capacity-utils.ts` levels `'1'` / `'JBOD'` + tests. Ships independently — it changes no
   current output, so it is safe to land before the migration is applied.
3. Form, actions, zod schema, nav entry. Degrades to a permission error until the migration
   is applied, so land it after — or behind the admin gate, where only Andy would see it.
4. The script cut and the JSON header comment.
5. The live round-trip script; run it post-apply.
6. First real use: correct the three V100 rows to `'1'` / `'JBOD'` through the form. This
   both validates the write path end to end and closes ADR 0092's V100 modelling item.

Steps 1–2 and 4 are independent of each other. Step 3 depends on 1.

## Extension — how this reaches the rest

Nothing here forecloses the remaining items, and two get materially cheaper:

- **`appliance_specs`** (7 SKUs × 56 columns) takes the same migration pattern, the same
  action shape, and the same section-grouped form. Its RLS admin-write policies already
  exist in the unapplied migration.
- **The 18 additive `product_specs` columns** need only new form sections — they are already
  nullable and already on the table's future shape.
- **`camera_specs`** (ADR 0091 named this as the likely duplicate-UI cost) has the write
  policies already and would reuse this form's structure.
- **`skuExtraData` retirement** needs `appliance_specs` seeded for the `ssdStorage` strings;
  the V100 half is unblocked by §1d.
- **ADR 0095's deferred drop** of `products.max_cameras` / `max_storage_tb` is unblocked:
  its stated condition was "when the canonical-source work settles where Arxys capacity is
  authored." This settles it. The drop still needs the `push-prices.ts` carry-forward removal
  and `scripts/test-rls.ts` in the same migration.
