# Product Spec Unification — Next Session Brief

- **Written:** 2026-07-24, at the end of the session that ran the Phase 0 audit and shipped the first
  two slices.
- **Read first:** [`spec-source-audit-phase0.md`](./spec-source-audit-phase0.md) (the audit), then
  ADRs [0091](../docs/decisions/0091-spec-unification-scope-boundary.md),
  [0092](../docs/decisions/0092-net-usable-capacity-definition.md),
  [0094](../docs/decisions/0094-recommender-pool-from-product-specs.md), then the two 2026-07-24
  JOURNAL entries.

## State of play

Branch **`fix/raid60-net-usable-capacity`**, two commits, **not pushed and not deployed**:

- `ea795e4` — RAID 60 parity fix (ADR 0092), the Phase 0 audit, ADR 0091.
- `1ec2f95` — recommender pool 6 → 18 SKUs (ADR 0094), pure `selectCandidates()` + 7 tests.
- branch `HEAD` — covered-capacity regression fix (§1) and this brief. (Deliberately not cited by
  hash: it is the commit that carries this file, so any amend would invalidate the reference.)

258 tests pass, `tsc --noEmit` clean. Two pre-existing lint errors in `portal-header.tsx` and
`project-quote-actions.ts` are unrelated and untouched.

## 1. DONE — covered-capacity regression, found and fixed before handoff

Recorded here because it is the cautionary tale for everything in §2.

Expanding the pool broke the covered-capacity lines on the System Estimate PDF, Project Quote, and
Customer Proposal. `pdf/render.ts` and `project-quote/snapshot.ts` computed them from
`current_products.max_cameras` / `max_storage_tb` — the same sparse columns ADR 0094 stopped the
recommender from using. For the 12 newly-poolable SKUs whose values are `NULL`, `coveredCameras`
rendered **0** and `coveredStorageTb` showed the storage *requirement* as delivered capacity.

Fixed in this branch's third commit via a single `coveredCapacity(units, spec, fallbackStorageTb)` helper in
`capacity-utils.ts`, used by both call sites, sourcing cameras from `product_specs.max_cameras` and
storage from `usableCapacityTb()`. Verified against live data: all 18 pool SKUs report real figures,
none report 0. It also corrected a pre-existing ADR 0068 miss on the 6 SKUs that appeared to work —
they reported the **raw nameplate**, so a V800-720 claimed 720 TB covered against 600 TB sized.

**The lesson, which §2 depends on:** the full suite passed throughout. Those fixtures hand-populate
capacity, so they could not see a change in *which rows* reach the path. Fixture-based tests prove
much less than they look like they do when a change alters row selection rather than logic. Assume
the same class of bug is still hiding elsewhere.

## 2. START HERE — audit the other consumers of `products` capacity for the same bug

The same NULL-capacity assumption may sit elsewhere, and §1 proves the tests will not tell you.
Known remaining readers of `current_products.max_cameras` / `max_storage_tb`, all worth checking
against a SKU from the NULL-capacity 12 (`VX5-V500-192` is a good probe):

- [`price-book/[slug]/page.tsx`](../src/app/(app)/price-book/[slug]/page.tsx) lines 108, 119, 132 —
  selects both columns. `cell-value.ts` claims neither is rendered directly any more; confirm.
- [`project-quote/assemble.ts:194`](../src/lib/project-quote/assemble.ts:194) — selects both.
- [`push-prices.ts`](../scripts/push-prices.ts) — **writes** them (carry-forward, lines 377-378) and
  reads them for the Pipedrive push (508-509). Its header comment still describes the old
  `not('max_cameras','is',null)` calculator filter, which ADR 0094 removed. Stale comment at minimum.

Only after this sweep is it safe to consider dropping the duplicated columns. **Do not treat that as
cheap cleanup** — that framing was wrong once already in this initiative.

## 3. Deploy communications owed

Two visible changes land together whenever this ships:

- **V800 capacity drops 6.7%** on every quote and PDF (ADR 0092 — the array always delivered this;
  the code was over-crediting it). Some projects that sized to one V800 now size to two.
- **Roughly two thirds of new recommendations change**, all cheaper in the reviewed grid ($722 to
  $48,197). Existing submissions keep their stored snapshots; only new calculations shift.
- **Covered-capacity lines on all three documents now report net-usable, not raw** (§1). Visible on
  the 6 previously-working SKUs: V800-720 goes 720 → 600 TB covered, V700-480 480 → 400, V600-320
  320 → 280, V500-240 240 → 200, V400-160 160 → 120, V200-80 80 → 60. These are the honest figures
  and they now match what the recommendation was sized against, but every one is a number a partner
  may have seen before.

Sales should hear all three before a partner does.

## 4. Settled — do not re-litigate

| Decision | Where |
|---|---|
| Scope: Arxys product specs only; `camera_specs` / `competitor_products` excluded | ADR 0091 |
| Canonical source must be **admin-form editable** — no deploy, no script run | ADR 0091 |
| This repo only; public website and Pipedrive out of scope | ADR 0091 |
| Net usable = raw − RAID parity, no hot spares. RAID 5 `(n−1)/n`, RAID 6 `(n−2)/n`, RAID 60 12-drive spans `2×(n/12)` → `raw × 5/6` | ADR 0092 |
| V100 publishes both RAID 1 and JBOD figures | ADR 0092, shipped |
| Documents publish decimal TB **and** approximate binary TiB | ADR 0092, **not built** — see §5 |
| Recommender pool = V200–V800 allowlist, capacity from `product_specs`, V100 excluded by intent | ADR 0094 |
| `VX5-V800-576` being strictly dominated is **fine — reviewed and dismissed 2026-07-24.** Do not raise it again | ADR 0094 observation |
| Pricing, the Master Sheet → Supabase → Pipedrive pipeline, the Calculator's algorithm, bitrate tables, and the recommendation logic are all out of scope | seed brief + ADR 0091 |

## 5. Remaining work after §1–§2, roughly by value

1. **The admin form.** The audit's central finding: measured against the ADR 0091 bar, *no* spec
   source qualifies — `product_specs`' real source of truth is `data/server-specs.json`, a repo file
   applied by a manually-run script. This is the largest remaining piece and the one the whole
   initiative is for.
2. **The 26 migration-only columns.** `update-comparison-data.ts` maintains 17 of `product_specs`' 43
   columns; the other 26 were added and seeded inside later migrations and have no other write path.
   Two of them — `hdd_count` and `raid_level_display` — feed the Calculator's storage math, so
   sizing depends on values only a migration can correct. Full list in audit §5. Note the script's
   upsert does *not* clobber them (verified), so a naive "fix" to that script could easily break it.
3. **Decimal/binary figure pair on documents** (ADR 0092 item 3). Touches the PDF pipeline; needs a
   footnote pattern.
4. **Where non-tabular copy lives** — taglines, greatFor prose, keyFeatures, KPI labels, VSR
   definitions, compliance strips. Marketing content, not hardware specs; the admin-form bar may
   apply differently. Open question in audit §6.
5. **`skuExtraData`-overrides-computed.** Retiring it is now safe for rack storage (the code computes
   correctly), but the V100 needs a modelled two-configuration answer first, and the `ssdStorage`
   strings for management/ACM SKUs have no `product_specs` row to compute from.
6. **Fate of `data/server-specs.json`.** If the DB becomes canonical and admin-editable, the JSON
   cannot stay a co-authority — re-running the script would overwrite form edits. It also feeds
   `competitor_products`, which is out of scope, so it cannot simply be deleted.
7. **Unpause the datasheet project.** `appliance_specs` and the `product_specs` additive migration
   are written but **neither applied nor committed** (see §6). Nothing in the audit invalidates
   them; the only open question is whether they land as-is or fold into a wider canonical shape.

## 6. Hazards specific to this repo

- **Multiple Claude sessions share one working tree.** Another session was active during this one:
  it took ADR number **0093** mid-session, and its `docs/JOURNAL.md` entry got swept into commit
  `ea795e4` because `JOURNAL.md` was staged wholesale. **Check `git diff docs/JOURNAL.md | grep -E
  "^\+## "` before staging it, verify the next free ADR number immediately before claiming it, and
  never `git add -A` here.**
- **Uncommitted work that is not yours.** Still untracked at handoff: ADR 0090, its apply-note, the
  two datasheet migrations and their rollbacks, ADR 0093, and the other `datasheets/*.md` planning
  docs. The JOURNAL links to several of them, so those links do not resolve in the repo yet. Leave
  them alone unless asked.
- **The two datasheet migrations are unapplied by design** — Andy applies via the dashboard SQL
  editor per [`docs/apply-notes/0090-datasheet-schema.md`](../docs/apply-notes/0090-datasheet-schema.md).
  Do not apply them.
- **Live data findings go stale.** The audit's capacity and VMS findings came from production
  queries, not the migration chain. Re-run them before relying on them (audit Appendix). Read-only
  `SELECT`s via `node --env-file=.env.local --import tsx`; credentials are in `.env.local`.
- **Tests use hand-built fixtures, not live SKUs.** That is exactly why §1 slipped through. When a
  change alters *which* rows reach a code path, a passing suite proves less than it looks.

## Suggested first step

Work §2 the way §1 was eventually caught, not the way it was missed: pick `VX5-V500-192` (real SKU,
`current_products` capacity `NULL`, `product_specs` complete) and trace it through each remaining
reader end to end against live data. Do not rely on the test suite to surface this class of bug — see
§1's lesson. The scratch verification scripts from this session (audit Appendix pattern) are the
right tool: read-only `SELECT`s via `node --env-file=.env.local --import tsx`.

Model: Opus 5, effort high. Cross-module work with live-data verification and a customer-facing blast
radius.
