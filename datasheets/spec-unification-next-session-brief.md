# Product Spec Unification — Next Session Brief

- **Written:** 2026-07-24, at the end of the session that ran the Phase 0 audit and shipped the first
  two slices.
- **Read first:** [`spec-source-audit-phase0.md`](./spec-source-audit-phase0.md) (the audit), then
  ADRs [0091](../docs/decisions/0091-spec-unification-scope-boundary.md),
  [0092](../docs/decisions/0092-net-usable-capacity-definition.md),
  [0094](../docs/decisions/0094-recommender-pool-from-product-specs.md), then the two 2026-07-24
  JOURNAL entries.

## State of play

> **CORRECTED 2026-07-27 (later session).** Everything below this callout was written
> before PR #7 merged. **All of the work described in this brief is now on `main` and
> live in production.** The original text said "not pushed and not deployed"; that is
> false. Verified: PR #7 merged as `e06d9a0`, and the latest production deployment was
> created four seconds after `main`'s tip commit. The working tree is clean.
> Consequences: **§3's deploy communications are owed retroactively, not
> prospectively** — partners can already see the new figures. §2 is **done** (see the
> §2 callout). §6's "uncommitted work that is not yours" no longer applies: all of it
> is committed and tracked. Test count is now **278**, not 258.

Branch **`fix/raid60-net-usable-capacity`** — *merged to `main` via PR #7 and deployed*:

- `ea795e4` — RAID 60 parity fix (ADR 0092), the Phase 0 audit, ADR 0091.
- `1ec2f95` — recommender pool 6 → 18 SKUs (ADR 0094), pure `selectCandidates()` + 7 tests.
- `dfb25d9` — covered-capacity regression fix (§1) and this brief.

278 tests pass, `tsc --noEmit` clean. Two pre-existing lint errors in `portal-header.tsx` and
`project-quote-actions.ts` are unrelated and untouched. (Note: `npm run lint` also walks
`.claude/worktrees/`, so error counts appear doubled when another session's worktree exists.)

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

## 2. DONE — swept 2026-07-27, no second instance of the bug

> **This section is closed.** All four readers below were traced to their rendered
> output against live production data. **Every one was a dead select** — none rendered
> either column. Details in the JOURNAL entry; the decision not to drop the columns yet
> is [ADR 0095](../docs/decisions/0095-retain-products-capacity-columns.md).
>
> Two corrections to the list below. **It missed a site:** `pdf/render.ts`'s
> `loadProductBySku` selected *and returned* both columns. And its `push-prices.ts`
> claim is wrong — lines 508-509 are a carry-forward **write** inside `pushPortalRows`,
> not a Pipedrive read; `pushPipedrive()` never touches capacity. The stale header
> comment was real and is fixed.
>
> What shipped: the four dead reads removed **along with the fields on `ProductRow`,
> `SizingProductRow`, and `loadProductBySku`'s return type**, so the regression class is
> now a compile error. The DB columns and the `push-prices.ts` carry-forward were kept
> deliberately — stopping the carry-forward would silently `NULL` the 6 populated SKUs
> on the next run, because `products` is append-only. Read ADR 0095 before touching
> either.

### Original text (superseded)

The same NULL-capacity assumption may sit elsewhere, and §1 proves the tests will not tell you.

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

## 3. Deploy communications owed — V800 SENT, TWO ITEMS STILL OPEN

> **These changes are already live in production** (verified 2026-07-27; see the
> State-of-play callout). The framing below — "whenever this ships" — no longer holds.
> Partners may already have seen the new figures on quotes and PDFs.
>
> **UPDATED 2026-07-27: the V800 capacity message has been sent** (stakeholder
> confirmed). That closes item 1 below, and the V800-720 line of item 3 along with it
> (720 → 600 TB covered is the same 6.7% drop, stated on the documents). **Items 2 and
> the other five SKUs in item 3 are still unsent** — see the per-item status.

Two visible changes land together whenever this ships:

- ~~**V800 capacity drops 6.7%**~~ **— SENT 2026-07-27.** On every quote and PDF (ADR 0092 — the
  array always delivered this; the code was over-crediting it). Some projects that sized to one
  V800 now size to two.
- **STILL UNSENT — Roughly two thirds of new recommendations change**, all cheaper in the reviewed
  grid ($722 to $48,197). Existing submissions keep their stored snapshots; only new calculations
  shift. Not covered by the V800 message: this is the ADR 0094 pool expansion, a separate cause
  with a separate audience (anyone who quoted a job last week gets a different answer this week).
- **PARTLY SENT — Covered-capacity lines on all three documents now report net-usable, not raw**
  (§1). Visible on the 6 previously-working SKUs: **V800-720 goes 720 → 600 TB covered (sent, as
  above)**; still unsent for V700-480 480 → 400, V600-320 320 → 280, V500-240 240 → 200, V400-160
  160 → 120, V200-80 80 → 60. These are the honest figures and they now match what the
  recommendation was sized against, but every one is a number a partner may have seen before.

Sales should hear all three before a partner does. One of the three now has.

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

   > **DESIGNED 2026-07-27, not built.** Scope agreed with stakeholder;
   > [ADR 0096](../docs/decisions/0096-product-specs-canonical-admin-editable.md) records
   > the decisions and [`spec-admin-form-design.md`](./spec-admin-form-design.md) is the
   > implementation spec (migration, form, safety design, build sequence). Headline: the
   > canonical *shape* was never the problem — `product_specs` already is the shape all 8
   > consumers read, its data is complete, and it has **no write policy at all**. So it
   > becomes canonical in place: admin RLS write policies, `updated_at`/`updated_by` plus
   > an insert-only audit table, a nullable `raid_level_alt_display` for the V100, an
   > admin-only form at `/admin/specs`, and the `product_specs` half of
   > `update-comparison-data.ts` removed. Read the design before writing code.
2. ~~**The 26 migration-only columns.**~~ **FOLDED INTO ITEM 1 — not separate work.** Once
   `product_specs` has an admin write path, the 17-script-fed / 26-migration-only split stops
   existing, `hdd_count` and `raid_level_display` included. Original text, still accurate as
   description: `update-comparison-data.ts` maintains 17 of `product_specs`' 43
   columns; the other 26 were added and seeded inside later migrations and have no other write path.
   Two of them — `hdd_count` and `raid_level_display` — feed the Calculator's storage math, so
   sizing depends on values only a migration can correct. Full list in audit §5. Note the script's
   upsert does *not* clobber them (verified), so a naive "fix" to that script could easily break it.
   Re-verified 2026-07-27: all 26 are **fully populated** — across 43 columns × 21 rows the only
   nulls are `notes` (20) and the dead `product_sku` (21).
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
   are **committed but still not applied** — re-verified against production 2026-07-27:
   `appliance_specs` returns `PGRST205` (absent) and `product_specs` still has 43 columns with
   0/18 of the additive set. Nothing in the audit invalidates them; the open question is whether
   they land as-is or fold into a wider canonical shape.

   > **RETRACTED 2026-07-27 (later session). The four-SKU gap below is not real, and
   > `appliance_specs`' 7-SKU population is exactly correct.** The finding came from
   > counting `current_products` rows without filtering `active`. Verified against
   > production: **all four of those SKUs are `active = false`**, and two are not priced
   > at all (`VX5-SW30-300` and `VX5-SW35-300` are `call_for_quote`, `msrp` null). They
   > were deactivated on 2026-07-02 and archived in Pipedrive — **already recorded three
   > weeks before the audit** in
   > [ADR 0078](../docs/decisions/0078-pipedrive-eol-archive-not-delete.md), which names
   > them precisely: "`VX5-V270-ACM` (superseded by the new `VX5-V265-ACM`) and four EOL
   > items (`VX5-SW25-200`, `VX5-SW30-300`, `VX5-SW35-300`, `VX5-RAM-32GB`)".
   > `snapshot.ts:63`'s "EOL'd" comment is correct.
   >
   > The Price Book absence is **intentional and independently enforced**: every Price
   > Book query filters `.eq("active", true)`, so these rows could not render even if
   > they were listed in a family's `productGroups`. Nothing to fix.
   >
   > Corrected arithmetic: `current_products` holds 37 rows of which **32 are active**
   > (the 5 inactive being the ADR 0078 set). Coverage is **32 of 32** — 21 rack SKUs in
   > `product_specs`, the 7 appliances in `appliance_specs`' intended population, and 4
   > accessories (`VX5-GPU-A1000`, 3 × `VX5-NIC-SFP28*`) that need no datasheet. **The
   > seed is not blocked and needs no `sheet_group` decision for V270.**
   >
   > Two smaller items from the original text do survive. `VX5-PP5-V100` really has
   > **zero rows in `products`**, so the SW family's only `upgradeSkus` entry resolves to
   > nothing — a small live bug, still unfixed. And the V260 family's `datasheetUrl` does
   > point at `...V260-V270-ACM-V5.pdf`, a marketing asset still covering a superseded
   > SKU — an Arxys-side asset issue, not a portal defect.

   ### Original text (superseded)

   **New finding (2026-07-27) — the intended population is short by four SKUs.**
   `appliance_specs`' header lists 7 SKUs, drawn from `families.ts` `skuExtraData` keys, so it
   inherited that file's blind spot. `product_specs` covers no non-rack SKU, leaving 16 of 37
   active `current_products` SKUs uncovered; 5 are accessories that need no datasheet, but **four
   are active, priced appliances covered by neither table**: `VX5-SW25-200`, `VX5-SW30-300`,
   `VX5-SW35-300`, `VX5-V270-ACM`. Those same four are also absent from every family's
   `productGroups`, so they **render nowhere in the Price Book today** — while the V260 family's
   `datasheetUrl` points at a factsheet named `...V260-V270-ACM-V5.pdf`. Decide the `sheet_group`
   for V270 (likely alongside V260/V265) before seeding. Separately, `VX5-PP5-V100` is a
   `skuExtraData` key and the SW family's only `upgradeSkus` entry but has **zero rows in
   `products`**.

## 6. Hazards specific to this repo

- **Multiple Claude sessions share one working tree.** Another session was active during this one:
  it took ADR number **0093** mid-session, and its `docs/JOURNAL.md` entry got swept into commit
  `ea795e4` because `JOURNAL.md` was staged wholesale. **Check `git diff docs/JOURNAL.md | grep -E
  "^\+## "` before staging it, verify the next free ADR number immediately before claiming it, and
  never `git add -A` here.**
- ~~**Uncommitted work that is not yours.**~~ **RESOLVED 2026-07-27.** All of it — ADR 0090 and its
  apply-note, both datasheet migrations and their rollbacks, ADR 0093, and the `datasheets/*.md`
  planning docs — is now committed and tracked on `main`, and the JOURNAL links resolve. Verified
  with `git ls-files`; the working tree is clean. The *hazard* above it (shared working tree) is
  still live, so keep checking `git diff docs/JOURNAL.md | grep -E "^\+## "` before staging.
- **The two datasheet migrations are unapplied by design** — Andy applies via the dashboard SQL
  editor per [`docs/apply-notes/0090-datasheet-schema.md`](../docs/apply-notes/0090-datasheet-schema.md).
  Do not apply them.
- **Live data findings go stale.** The audit's capacity and VMS findings came from production
  queries, not the migration chain. Re-run them before relying on them (audit Appendix). Read-only
  `SELECT`s via `node --env-file=.env.local --import tsx`; credentials are in `.env.local`.
- **Tests use hand-built fixtures, not live SKUs.** That is exactly why §1 slipped through. When a
  change alters *which* rows reach a code path, a passing suite proves less than it looks.

## Suggested first step

> **UPDATED 2026-07-27 (second later session).** §2 is done and clean — do not re-run it.
> §5.1 is **designed and scope-agreed** (ADR 0096 +
> [`spec-admin-form-design.md`](./spec-admin-form-design.md)) but **not built**: start at
> that design's §7 build sequence. §5.7's four-SKU gap is **retracted** — those SKUs are
> `active = false` and EOL per ADR 0078; nothing blocks the `appliance_specs` seed.
> **§3's V800 message has been sent**; its other two items (the recommendation-change
> blast radius, and the covered-capacity change on the remaining five SKUs) are still
> owed and remain the most time-sensitive things in this brief.

The §2 method is still the right method for anything touching capacity, and is worth
reusing: pick `VX5-V500-192` (real SKU, `current_products` capacity `NULL`, `product_specs`
complete) and trace it end to end against live data rather than trusting the suite — see
§1's lesson. Read-only `SELECT`s via `node --env-file=.env.local --import tsx`.

Two practical corrections to that recipe, learned the hard way: the scratch scripts must be
**`.mts`**, because `tsx` transforms `.ts` as CJS and rejects top-level `await`; and a script
placed outside the repo cannot resolve `@supabase/supabase-js`, so either keep it inside the
project or import the absolute path to
`node_modules/@supabase/supabase-js/dist/index.mjs`. Also note the **Supabase CLI is
unauthenticated** in this environment (`Unauthorized`), so `migration list` / `db push` are
unavailable; read-only `service_role` queries from `.env.local` work fine.

Model: Opus 5, effort high. Cross-module work with live-data verification and a customer-facing blast
radius.
