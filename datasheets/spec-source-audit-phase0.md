# Product Spec Single Source of Truth — Phase 0 Audit (read-only)

- **Date:** 2026-07-24
- **Status:** Findings only. No schema, migration, or app-code changes made. Direction not yet set.
- **Input brief:** [`single-source-of-truth-seed.md`](./single-source-of-truth-seed.md)

## Scope, as confirmed by stakeholder before starting

| Question | Answer |
|---|---|
| Which spec tables are candidates for consolidation? | **Arxys product specs only.** `camera_specs` and `competitor_products` are catalogued here as adjacent sources with their own provenance, but excluded from unification. |
| What must be true for the canonical source to count as live-editable? | **Editable in a portal admin form** — no deploy, no script run. Recorded as a requirement; architecture deliberately still open. |
| Consumers outside this repo? | **This repo only.** The public website and Pipedrive are out of scope. |
| Deliverable | **This audit, then stop for review.** Architecture and phased plan come after sign-off. |

## Method

Repo-wide grep and file reads, **plus live read-only `SELECT` queries against the production
Supabase project** (service_role, `SELECT` only, no writes — the queries are reproducible, see
Appendix). This is the material difference from the datasheet project's own Phase 0, which
explicitly did not query the cloud DB and reasoned from the migration chain instead. Several
findings below are only visible in live data: the migration chain does not predict them.

## Headline findings

1. **There are seven live locations holding Arxys product spec data, not four.** The brief's list
   missed the `products` inline capacity columns, `data/server-specs.json` (the actual upstream of
   `product_specs`), and `src/lib/comparison/display-specs.ts`.
2. **The Calculator recommends from 6 of 21 rack SKUs. The entire V100 family is unrecommendable.**
   This is a direct, live consequence of capacity data living in two places. Undocumented as a
   decision. Details in §4.1 — this is the finding with the largest product impact.
3. **The Price Book displays a *different* net-usable storage figure than the PDFs and Calculator
   for 8 of 21 SKUs**, because hand-typed strings in `families.ts` are coded to override the
   computed value. **Resolved 2026-07-24** — and resolving it uncovered a live code bug that makes
   the Calculator under-spec the V800. Details in §4.2.
4. **26 of `product_specs`' 43 columns have no write path other than authoring a new migration** —
   including `hdd_count` and `raid_level_display`, which the Calculator's storage math depends on.
   The refresh script only maintains 17 columns. Details in §5.
5. **`product_specs` is not live-editable either.** Its real source of truth is
   `data/server-specs.json`, a repo file applied by a manually-run script. `families.ts` is the
   more obvious offender but not the only one. Against the admin-form bar, **zero** of the current
   spec sources qualify.
6. **The confirmed-stale `vms_certified` originates upstream in the JSON, not just in the DB** — and
   is internally inconsistent (one row lists 2 VMSes, twenty list 3). The authoritative 7-VMS list
   exists *only* as a hardcoded string in a page component.
7. No drift between `data/server-specs.json` and the 17 columns it feeds — the refresh script has
   been re-run since the last JSON edit (`last_updated: 2026-06-24`). That path is healthy.

## 1. Source inventory

### In scope — Arxys product spec data

| # | Source | Kind | Holds | Editable by |
|---|---|---|---|---|
| 1 | `product_specs` | Supabase, 21 rows × 43 cols | Rack-video V100–V800 hardware specs | Script (17 cols) / migration (26 cols) |
| 2 | `data/server-specs.json` | Repo file, 76 KB | Upstream for #1 (17 cols) *and* `competitor_products`. Also 3 fields that never landed in any table: `cpu_summary`, `ndaa`, `lead_time_weeks` | Deploy + manual script run |
| 3 | `products` / `current_products` | Supabase, 67 rows / 37 current | Inline `max_cameras`, `max_storage_tb` | `push-prices.ts` (carry-forward only) |
| 4 | `src/lib/price-book/families.ts` | TS file, 616 lines, 10 families | tagline, greatFor, keyFeatures, technicalSpecs, KPIs, hero image, datasheet URLs, category warranty, **and per-SKU storage display strings** | Deploy |
| 5 | `src/lib/comparison/display-specs.ts` | TS file | Hand-derived copy of the JSON's `display_specs` + `messages` (spec labels, display order, marketing copy) | Deploy |
| 6 | Hardcoded in components | 6 sites | Compliance/VMS/NDAA claims, VSR definition, EULA text, PDF value badges | Deploy |
| 7 | `appliance_specs` + `product_specs` additive | Migrations, **unapplied** | Management/ACM/workstation archetypes; 18 datasheet fields | n/a yet |

Site list for #6:
- [`price-book/[slug]/page.tsx:268`](../src/app/(app)/price-book/[slug]/page.tsx:268) — the 7-VMS strip, NDAA, American Made
- [`price-book/[slug]/page.tsx:244`](../src/app/(app)/price-book/[slug]/page.tsx:244) and `:426` — VSR definition, twice in one file
- [`price-book/[slug]/page.tsx:436`](../src/app/(app)/price-book/[slug]/page.tsx:436) — Windows Server IoT EULA + NDAA prose
- [`price-book/page.tsx:208`](../src/app/(app)/price-book/page.tsx:208) — "NDAA Compliant · American Made"
- [`_components/footer.tsx:8`](../src/app/(app)/_components/footer.tsx:8) — NDAA + EULA prose, site-wide
- [`pdf/SubmissionPdf.tsx:321`](../src/lib/pdf/SubmissionPdf.tsx:321) — `VALUE_BADGES`, incl. a hardcoded "5-year warranty"

### Adjacent — catalogued, excluded from consolidation per scope

| Source | Kind | Note |
|---|---|---|
| `camera_specs` | Supabase, 120 rows | Third-party camera models. Loaded by `load-camera-specs.ts` from the four `data/*-camera-specs*.json` files. Same no-form-to-edit shape as `product_specs`. |
| `competitor_products` | Supabase, 51 rows | Competitor specs. Shares `data/server-specs.json` as upstream with `product_specs` (the `vms_vendors` key). |

## 2. Consumer × source matrix

| Consumer | `product_specs` | `products` | `families.ts` | Hardcoded |
|---|---|---|---|---|
| Calculator — candidate pool ([`candidates.ts`](../src/lib/recommend/candidates.ts)) | 3 cols (`storage_raw_tb`, `hdd_count`, `raid_level_display`) for net-usable math | `max_cameras`, `max_storage_tb`, `msrp`, `price_type` — **gates the pool** | — | — |
| Price Book family page ([`[slug]/page.tsx`](../src/app/(app)/price-book/[slug]/page.tsx)) | 4 cols via `cellValue` | SKU/name/MSRP | all copy, KPIs, hero, **storage overrides** | VMS/NDAA/VSR/EULA |
| Price Book index ([`page.tsx`](../src/app/(app)/price-book/page.tsx)) | — | listing | family cards | compliance line |
| VMS/VideoX Compare ([`videox-compare/data.ts`](../src/lib/videox-compare/data.ts)) | `select *`, 27 fields mapped | — | — | — |
| Comparison tool ([`comparison/data.ts`](../src/lib/comparison/data.ts)) | `select *` | `msrp` only | — | labels via `display-specs.ts` |
| System Estimate PDF ([`pdf/render.ts:336`](../src/lib/pdf/render.ts:336)) | ~14 cols | — | — | `VALUE_BADGES` |
| Project Quote + Customer Proposal ([`project-quote/assemble.ts`](../src/lib/project-quote/assemble.ts)) | `PRODUCT_SPEC_COLUMNS` | pricing | — | — |
| Refresh script ([`update-comparison-data.ts`](../scripts/update-comparison-data.ts)) | **writes** 18 cols | — | — | — |
| Price push ([`push-prices.ts`](../scripts/push-prices.ts)) | — | **writes**, carries capacity forward | — | — |

`product_specs.product_sku` — the column commented "reserved for future join to `products.sku`" — is
**null in all 21 rows**, and the refresh script explicitly rewrites it to `null` on every run. The
join is done in-process on `product_specs.id == products.sku` instead. Dead column.

## 3. Archetype coverage

`product_specs` covers rack-video only. Against active SKUs in `current_products`:

| product_group | Has `product_specs` row? |
|---|---|
| V100, V200, V400, V500, V600, V700, V800 | yes |
| V150, V250, V255, V260, V265, SW10, SW20 | **no** |
| GPU, NIC | no (accessories, not expected) |

This is the gap the unapplied `appliance_specs` migration was written to fill, and it is unchanged
by this audit's findings.

## 4. Confirmed disagreements

### 4.1 Capacity: `products` has it for 6 SKUs, `product_specs` has it for all 21

`current_products.max_cameras` / `max_storage_tb` are populated for exactly six SKUs —
`VX5-V200-80`, `VX5-V400-160`, `VX5-V500-240`, `VX5-V600-320`, `VX5-V700-480`, `VX5-V800-720` — and
`NULL` for the other 15 rack SKUs. `product_specs` has complete, correct values for all 21.

**Why:** those six are the original Step 3/4 seed, described in
[`20260521190350_step3_4_products_sku_pk.sql`](../supabase/migrations/20260521190350_step3_4_products_sku_pk.sql)
as "6 representative SKUs (one mid-tier per VideoX V-family). Step 5's push script UPSERTs the full
~36-row Sheet over this seed." The Master Sheet carries no capacity columns, and `push-prices.ts`
only ever carries capacity **forward** from an existing row —
`max_cameras: existing?.max_cameras ?? null` — it never derives it. So the 30 SKUs that arrived with
the full sheet push got `null` and have stayed `null` ever since.

**Consequence:** [`candidates.ts:25`](../src/lib/recommend/candidates.ts:25) filters the pool with
`.not("max_cameras","is",null).not("max_storage_tb","is",null)`. The Calculator's candidate pool is
therefore those six SKUs only. **No V100 configuration can ever be recommended**, and only one
capacity tier per family is reachable — for a storage-first algorithm (ADR 0068) that packs multiple
units (ADR 0003), that materially narrows every recommendation.

This is baked into the tests as expected behaviour: the `SPECS` fixture at
[`algorithm.test.ts:21`](../src/lib/recommend/algorithm.test.ts:21) is exactly those six SKUs. The
only documented "never recommended" exclusion in `docs/` is the deliberate MKT/CFQ price-type filter
(JOURNAL Q4a) — nothing records the capacity-driven exclusion of 15 rack SKUs.

*I could not verify capacity is being lost by re-versioning — it is not.* The 2026-07-02 price
version preserved the 2026-05-05 values on all six populated SKUs. The nulls have been null since
the original seed.

#### Resolved by stakeholder, 2026-07-24 — partly intended, partly not

Stated intent: the recommender must **never under-spec**; it covers video surveillance only (an
access-control calculator would be separately scoped); the six VideoX families **V200–V800 are all
that is needed**; and a goal of this initiative is to make the recommender *more accurate and more
specific*, which needs live spec data.

That splits the finding in two:

- **Excluding V100 is correct and intended.** No change needed. Worth an ADR line so the next
  reader doesn't "fix" it. Access control (V150/V260/V265) is likewise out of scope by the same
  reasoning, and is separately scoped future work.
- **Excluding 12 of the 18 V200–V800 SKUs is *not* intended, and works against the stated goal.**
  The pool is six *SKUs*, not six *families*: exactly one capacity tier per family. The other 12
  tiers — V200-64/96, V400-128/192, V500-192/288, V600-256/384, V700-384/576, V800-576/864 — are
  invisible to the recommender because their `current_products` capacity is `NULL`.

The second point is the concrete "more accurate and more specific" win. With one tier per family the
recommender cannot right-size: a 250 TB-usable requirement has to reach for V600-320 (280 usable) or
stack V500-240s, when V500-288 (240) or V600-384 (336) may be the better fit on price or rack space.
Restoring the full 18 gives it three capacity points per family instead of one — and the data
already exists, complete and correct, in `product_specs`. This is unification paying for itself
rather than a separate feature.

> **Still to decide:** whether the recommender's capacity input moves to `product_specs` (complete,
> 21 rows) or `current_products` gets backfilled (6 → 18 rows). That is an architecture question and
> is deferred with the rest of §6.

### 4.2 Net-usable storage: Price Book vs PDFs/Calculator, 8 of 21 SKUs

[`cell-value.ts:50`](../src/lib/price-book/cell-value.ts:50) opens `cellValue` with
`if (extra?.[col]) return extra[col]!` — commented "skuExtraData overrides (families.ts) are
authoritative when present." So on the Price Book, the hand-typed string in `families.ts` **wins
over** the RAID-computed figure, while `usableCapacityTb()` (the computed value) is what the System
Estimate PDF, Project Quote, and Calculator use. Where they differ, the same SKU shows two numbers
depending on which surface the partner is looking at.

| SKU | raw TB | drives | RAID | computed (PDF/Calculator) | `families.ts` (Price Book) |
|---|---|---|---|---|---|
| VX5-V100-32 | 32 | 2 | NA | 16 | **36 TB** |
| VX5-V100-40 | 40 | 2 | NA | 20 | **40 TB** |
| VX5-V100-48 | 48 | 2 | NA | 24 | **48 TB** |
| VX5-V400-192 | 192 | 8 | 6 | 144 | **132 TB** |
| VX5-V700-384 | 384 | 24 | 60 | 320 | **316 TB** |
| VX5-V800-576 | 576 | 36 | 60 | 512 | **480 TB** |
| VX5-V800-720 | 720 | 36 | 60 | 640 | **600 TB** |
| VX5-V800-864 | 864 | 36 | 60 | 768 | **720 TB** |

The other 13 SKUs agree exactly.

#### Resolved by stakeholder, 2026-07-24

Stated rules: **no hot spares on any model.** V200 is RAID 5; V400/V500/V600 are RAID 6;
V700/V800 are RAID 60 built from **12-drive RAID 6 stripes**; V100 is a separate case (below).

Applying those rules resolves 18 of 21 rows and splits the 8 disagreements three ways:

| Rows | Verdict |
|---|---|
| V800-576, V800-720, V800-864 | **The code is wrong; `families.ts` is right** (480 / 600 / 720) |
| V400-192, V700-384 | `families.ts` is wrong (typos); the code is right (144, 320) |
| V100-32, V100-40, V100-48 | **Still open** — neither source is correct (below) |

**The code bug.** [`usableCapacityTb()`](../src/lib/capacity-utils.ts) hardcodes `parity = 4` for
RAID 60 regardless of drive count. That is only correct at 24 drives (2 spans × 2 parity). The V800
has 36 drives = 3 spans = **6** parity drives, so every V800 figure the code produces is two drives'
worth too generous. The V700 (24 drives) is unaffected, which is why this stayed hidden.

**Consequence — it runs directly against the stated sizing goal.** `VX5-V800-720` is one of the six
SKUs in the live Calculator pool. The Calculator sizes it at **640 TB usable when the array delivers
600 TB** — a 40 TB (6.7%) overstatement on the flagship box. Since the goal is to never be
under-specced, this is the one place the code silently violates it: a project sized at 620 TB is
told a single V800-720 fits, and it does not. The other five pool SKUs compute correctly.

*Correcting my own earlier reading:* the arithmetic pattern I spotted (`raw × (n−6)/n`) was right,
but I attributed it to withheld hot spares. The cause is three 12-drive parity spans. Same numbers,
different reason — and it generalises differently: parity is `2 × (n / 12)`, not a constant.

#### Canonical net-usable math (proposed, pending the V100 answer)

Under 12-drive spans the RAID 60 case simplifies cleanly, which makes this document-ready:

| Model | Drives | RAID | Net usable |
|---|---|---|---|
| V200 | 4 | 5 | `raw × 3/4` |
| V400 | 8 | 6 | `raw × 6/8` |
| V500 | 12 | 6 | `raw × 10/12` |
| V600 | 16 | 6 | `raw × 14/16` |
| V700, V800 | 24, 36 | 60, 12-drive spans | **`raw × 5/6`** (each span loses 2 of 12, so the ratio is drive-count independent) |
| V100 | 2 | open | open |

General form: RAID 5 → `raw × (n−1)/n`; RAID 6 → `raw × (n−2)/n`; RAID 60 with 12-drive spans →
`raw × (n − 2×(n/12))/n`. No hot spares in any case.

**V100 — still open.** `raid_level_display` is `"NA"`, which falls through `usableCapacityTb`'s
documented default to RAID-5 parity math and halves a 2-drive unit. `families.ts` keyFeatures
describe the V100 as "RAID 1 or JBOD", so there are two defensible answers and neither source
currently states one:

| SKU | raw | RAID 1 (mirror) | JBOD / spanned | `families.ts` declares |
|---|---|---|---|---|
| VX5-V100-32 | 32 | 16 | 32 | **36** ← matches nothing |
| VX5-V100-40 | 40 | 20 | 40 | 40 |
| VX5-V100-48 | 48 | 24 | 48 | 48 |

The declared 40 and 48 match JBOD; the declared 36 on a 32 TB raw unit matches neither and is an
error on any reading. The V100 is out of the Calculator's scope (§4.1), so this affects the Price
Book and datasheets only — but "Net Usable Capacity" cannot be defined on documents until it is
settled.

#### Definitional gap: decimal TB vs what the customer sees

Separate from the RAID math, and worth settling in the same pass since the ask is to define the term
"clearly in math and on documents". The whole pipeline is decimal: `GB_PER_TB = 1000`
([`types.ts:57`](../src/lib/recommend/types.ts:57)), and `storage_raw_tb` is drive nameplate
capacity. So the current "Net Usable Capacity" means *post-RAID-parity, decimal TB, before
filesystem formatting*. Windows reports binary TiB, ~9.1% lower: a V800-720 at 600 TB net usable
displays as roughly 545 TiB in the OS. If a partner sizes 600 TB of retention and the customer sees
545, that is a support call. Options: keep decimal and label it explicitly, or publish a
post-format figure as well.

### 4.3 VMS certification list — three sources, all different

| Source | Value |
|---|---|
| [`price-book/[slug]/page.tsx:268`](../src/app/(app)/price-book/[slug]/page.tsx:268) | 7: Milestone, Avigilon, Genetec, NXWitness, Hanwha, Exacq, Axxonsoft |
| `product_specs.vms_certified`, 20 of 21 rows | 3: "Milestone XProtect, Avigilon ACC, Genetec" |
| `product_specs.vms_certified`, `VX5-V100-32` only | 2: "Milestone XProtect, Avigilon ACC" |

Confirmed stale per the brief; the 7-VMS strip is authoritative. Two additions to what the brief
knew: the column is **internally inconsistent** (V100-32 alone omits Genetec, with no apparent
reason — its two siblings list it), and the stale values **originate in
`data/server-specs.json`**, so correcting the DB without correcting the JSON would be reverted by
the next refresh-script run. Also note `vms_certified` is a comma-joined string with
`highlight_if_better: true` in the comparison tool, so it is compared as text, not as a set.

### 4.4 NDAA — asserted in 4 places, stored in none

`data/server-specs.json` carries `ndaa: true` for all 21 Arxys models, but no table has an NDAA
column, so the field is dropped on load and unused. Meanwhile NDAA compliance is hardcoded in four
UI locations (§1, source 6). The unapplied additive migration proposes `ndaa_text` — the right
place, once direction is set.

### 4.5 Warranty — latent, not currently wrong

`FAMILY_CATEGORIES` in `families.ts` gives workstations a 3-year warranty and everything else 5;
`product_specs.warranty` is `"5yr NBD, Advanced Replacement"` on all 21 rack rows;
`SubmissionPdf.tsx` hardcodes `"5-year warranty"` in its badge strip. Consistent today only because
the Calculator can never recommend a workstation. It becomes a live error the moment PDFs cover
SW10/SW20 — which the datasheet project intends.

## 5. Write paths — the crux for the admin-form requirement

Against the confirmed bar (*editable in a portal admin form, no deploy, no script run*), **nothing
currently qualifies**:

| Source | To change a value today |
|---|---|
| `product_specs`, 17 JSON-fed columns | Edit `data/server-specs.json`, commit, deploy, then manually run `update-comparison-data.ts` (interactive confirm, service_role) |
| `product_specs`, **26 other columns** | **Author and apply a new migration** |
| `products` capacity | Not reachable — the Master Sheet has no capacity columns and the push script only carries forward |
| `families.ts`, `display-specs.ts`, hardcoded copy | Code edit + deploy |

The 26-column figure is the one that surprised me. Those columns were added by later migrations
([`20260602000001_quickcompare_columns.sql`](../supabase/migrations/20260602000001_quickcompare_columns.sql)
and friends) and seeded inline in those migrations; `update-comparison-data.ts` never learned about
them. The full list: `product_sku`, `rack_units`, `drive_bays`, `max_bandwidth_mbps`, `os_edition`,
`ram_spec`, `cpu_model_full`, `cpu_turbo_ghz`, `cores_threads`, `cpu_cache`, `mem_bandwidth`,
`avx_512`, `workload_affinity`, `chiplet_arch`, `infinity_guard`, `hotswap_power`, `hdd_count`,
`hdd_mtbf`, `raid_level_display`, `battery_raid`, `os_ssd_type`, `os_redundancy`, `gbe_1_ports`,
`gbe_10_ports`, `sfp_addon`, `avigilon_gpu`.

Two of these — `hdd_count` and `raid_level_display` — are inputs to `usableCapacityTb()`, so **the
Calculator's storage sizing depends on values that can only be corrected by a database migration.**
That is the single strongest argument in the audit for a canonical table with a real write path.

**One risk checked and cleared:** the refresh script's `.upsert(rows, { onConflict: "id" })` sends
an 18-field payload, and PostgREST's `ON CONFLICT DO UPDATE` sets only the payload's columns — so
re-running it does **not** null out the 26 migration-only columns. Verified against the live data
(all 26 are populated, 0 nulls across all 21 rows, after the script has been run). No action needed;
noting it because a naive fix to the script could easily break this.

Also worth noting for whatever gets built: RLS on all three spec tables is already
`SELECT`-to-`authenticated`, writes `service_role`/admin-only. `camera_specs` has the admin-write
policy pattern an admin form would need; `product_specs` does not (it has no write policy at all —
only service_role reaches it).

## 6. Decisions needed before Phase 1

Everything net-usable-related was answered and actioned on 2026-07-24. The canonical math, the V100
treatment, the units question, and the RAID 60 parity bug are settled in
[ADR 0092](../docs/decisions/0092-net-usable-capacity-definition.md), and the correctness fix has
shipped (parity formula + the two typos + test expectations; see the JOURNAL entry for that date).
What remains open:

1. **Implement the decimal/binary figure pair on documents** (ADR 0092 item 3). Decided, not built —
   it touches the PDF pipeline and needs a footnote pattern, so it lands with the document phase.
   V100 dual-publish (item 2) has shipped.
2. **Does `skuExtraData`-overrides-computed survive?** It is the mechanism that lets a hand-typed
   string outrank derived data — and it is the *only* reason the correct V800 numbers reach the Price
   Book at all. Once the code computes correctly, the storage overrides become redundant and the
   override path can go. The non-storage overrides (`ssdStorage` strings for management/ACM SKUs,
   which have no `product_specs` row to compute from) still need a home.
3. **Where does non-tabular copy live?** taglines, greatFor prose, keyFeatures, KPI labels, VSR
   definitions, compliance strips. These are marketing content, not hardware specs, and the
   admin-form bar arguably applies differently. Unifying specs and copy in one table is a real
   option; so is scoping this initiative to specs and handling copy separately.
4. **Fate of the two unapplied migrations.** Both remain reasonable to build on — nothing in this
   audit invalidates them. `appliance_specs` fills the §3 archetype gap; the additive migration adds
   the datasheet fields including `ndaa_text`. The open question is only whether they land as-is or
   get folded into a wider canonical shape.
5. **Does `data/server-specs.json` survive?** If the DB becomes canonical and admin-editable, the
   JSON either becomes a one-time import artifact or has to be retired — it cannot stay a
   co-authority, since re-running the script would overwrite form edits. Note it also feeds
   `competitor_products`, which is out of scope, so it cannot simply be deleted.

## 7. Scope of changes

The audit itself was read-only. **One correctness fix was then authorised and landed on 2026-07-24**
(ADR 0092), deliberately scoped narrow:

- `capacity-utils.ts` — RAID 60 parity is now span-derived rather than a flat 4.
- `families.ts` — two typo'd storage strings corrected (V400-192, V700-384), and the three V100
  strings switched to dual-publish (RAID 1 / JBOD), retiring the wrong `36 TB`.
- `snapshot.test.ts`, `render.test.ts` — expectations that encoded the old parity.

No schema or migration changes, and **no writes to the database** at any point. Everything else
remains untouched:

- Did not evaluate target architectures or pre-commit to extending `product_specs` vs building new,
  per the brief.
- Did not audit `camera_specs` / `competitor_products` internals, the public website, Pipedrive, or
  pricing — all out of scope by the confirmed answers.
- Did not touch the Calculator's algorithm, bitrate-per-resolution tables, or the recommendation
  logic. The RAID parity fix corrects a *capacity-derivation* helper the algorithm consumes; the
  sizing and recommendation logic itself is unchanged.
- Did not expand the candidate pool (§4.1) — decided, deferred to the unification phase.
- Did not implement the decimal/binary document pair (§4.2, ADR 0092 item 3) — decided, deferred to
  the document phase.

## Appendix — reproducing the live queries

The four read-only scripts used are in this session's scratchpad, not committed. Each is
`SELECT`-only and takes credentials from `.env.local`:

```bash
node --env-file=.env.local --import tsx <script>.mts
```

What they establish: table existence + row counts + live column lists; the §4.1 capacity diff
(`current_products` vs `product_specs` per SKU); the price-version history proving capacity is not
lost on re-versioning; the JSON↔DB drift check (0 mismatches, and the 26-orphaned-column list); and
the §4.2 `families.ts`-vs-computed storage diff. Worth re-running before Phase 1 if any time passes
— the capacity and VMS findings are live-data findings and could be fixed out from under this
document.

**Two corrections to the recipe** (found 2026-07-27 re-running these): the scripts must be
`.mts`, not `.ts` — `tsx` transforms `.ts` as CJS and rejects top-level `await` — and a script
outside the repo cannot resolve `@supabase/supabase-js`, so keep it inside the project or import
the absolute path to `node_modules/@supabase/supabase-js/dist/index.mjs`. Note also that the
**Supabase CLI is unauthenticated** here (`projects list` → `Unauthorized`), so it cannot
substitute for these scripts; `service_role` `SELECT`s from `.env.local` are the only live route.

**Re-verified 2026-07-27** (later session): the §4.1 capacity split still holds exactly — 6 SKUs
populated in `current_products`, the other 31 `NULL`, `product_specs` complete for all 21 rack
SKUs. Added finding: **16 of 37 active `current_products` SKUs have no `product_specs` row at
all**, and four of those are active, priced appliances that the pending `appliance_specs`
migration does *not* cover either (`VX5-SW25-200`, `VX5-SW30-300`, `VX5-SW35-300`,
`VX5-V270-ACM`). See the brief's §5.7 and the 2026-07-27 JOURNAL entry.
