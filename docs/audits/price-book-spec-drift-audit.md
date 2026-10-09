# Price Book spec drift audit (Step 1 of the price-book-spec-sync brief)

- **Date**: 2026-10-09
- **Brief**: [`decisions/claude-code-brief-price-book-spec-sync.md`](../decisions/claude-code-brief-price-book-spec-sync.md)
- **Source**: live `product_specs` (24 rows) and `current_products`, read with
  `node --env-file=.env.local --import tsx scripts/audit-price-book-specs.ts`. SELECT only.
  Audit-trail lookups in `product_specs_audit`, also SELECT only.
- **Status**: Gate A. Mapping in §3 is the proposal; §5 lists what needs Andy.

## 1. Drift: what the seven pages say today vs the live canonical row

The canonical row is the highest-capacity **visible** SKU, picked by the datasheet's own
`groupByModel()` + `canonicalRow()`. Only facts that differ are listed.

| Model | Fact | Page today (families.ts) | Live row | Kind |
|---|---|---|---|---|
| all 7 | Throughput unit | Mbps | Mbit/s on datasheet and SKU table | decided wording |
| V100, V200 | OS | Windows Server 2022/2025 IoT Workgroup | `os_edition` = Windows Server 2022 OR 2025 WKGP LTSC | decided wording |
| V400 to V800 | OS | Windows Server 2022/2025 IoT Standard | `os_edition` = Windows Server 2022 OR 2025 LTSC | decided wording |
| V100, V200 | RAM | 16GB DDR5 DRAM | `ram_spec` = 16GB ECC DDR5 | data |
| V200 | RAID bullet | RAID 5 (no Cachevault) | `battery_raid` = YES | data |
| **V400** | **Max VSR** | **200** | **150** | data (9015 refresh) |
| **V400** | **CPU** | AMD EPYC 9005 3.3GHz 16/32 Core | AMD EPYC 9015 3.6Ghz 8/16 Core | data (9015 refresh) |
| **V400** | **RAID** | RAID 5 & Cachevault | `raid_level_display` = 6 | page was wrong (ADR 0092 says RAID 6) |
| **V700, V800** | **Max VSR** | **325** | **275** | data (9015 refresh, then correction) |
| **V700, V800** | **CPU** | AMD EPYC 9005 4.3GHz 16/32 Core | AMD EPYC 9005 3.3Ghz 16/32 Core | data |
| V100 | Power | 1x 80Plus Gold Power Supply | `power_redundancy` = Single PSU 400W; "80Plus Gold" appears in no column | no source |

Matches today: VSR on V100, V200, V500, V600; throughput figures on all 7; warranty years
(5) on all 7; rack units on all 7; drive counts on all 7; CPU on V100, V200, V500, V600;
RAM on V400 to V800; RAID level on V100, V200, V500 to V800; network port counts on all 7.

## 2. Gotcha outcomes

### G2: V400 RAID basis. No capacity change.

All three visible V400 rows carry `raid_level_display = '6'`. The retired overrides equal
the computed figure exactly:

| SKU | Raw | Override | Computed (RAID 6, live) | If RAID 5 |
|---|---|---|---|---|
| VX5-V400-128 | 128 TB | 96 TB | 96 TB (85.7 TB available) | 112 TB |
| VX5-V400-160 | 160 TB | 120 TB | 120 TB (107.2 TB available) | 140 TB |
| VX5-V400-192 | 192 TB | 144 TB | 144 TB (128.6 TB available) | 168 TB |

The "RAID 5" in the V400 Key Feature was the authored error; ADR 0092 records the V400 as
RAID 6. After the change the page says RAID 6. No published V400 capacity moves, so the
STOP-AND-FLAG condition is not met. The same holds for all 18 retired overrides on V200 to
V800: every computed number equals its override. The cell **format** changes, because the
computed cell carries ADR 0127's VMS-visible figure: `96 TB` becomes `96 TB (85.7 TB available)`.

### G3: hidden -NCD rows pool into the datasheet. Confirmed, customer-visible.

`loadDatasheetSpecData()` reads every row and `modelOf()` puts `VX5-V400-128-NCD`,
`VX5-V400-192-NCD` and `VX5-V500-288-NCD` in the V400 and V500 groups. Rendered from live
data with `scripts/render-datasheet.ts`:

- **V400 sheet ordering table lists five part numbers**: 128, 128-NCD, 160, 192, 192-NCD,
  under the caption "Three drive capacities per NVR".
- **V500 sheet lists four**: 192, 240, 288, 288-NCD.
- The canonical row is `VX5-V400-192-NCD` and `VX5-V500-288-NCD`. Today those rows agree
  with their visible twins on every page fact (they differ only on `revision_date`), so the
  sheet's content is right by coincidence. They are independent copies (ADR 0137), so an
  edit to the visible twin alone would put the datasheet and the page apart. The standing
  audit script will catch that the day it happens.

Not fixed here, per the brief.

### G4: `'NA'` RAID level. Already gone from live data.

The V100 rows were corrected `NA -> 1` through `/admin/specs` on 2026-07-27 and carry
`raid_level_alt_display = 'JBOD'`. The derivation still treats `NA` as "no level" so a
future `NA` never prints.

### G6: CPU twin columns disagree on two V100 rows.

`VX5-V100-40` and `VX5-V100-48`: `cpu_model_full` says 6/12 Core, `cores_threads` says
6C/12T, `cpu_cores_threads` says **8C/16T**. `/comparison` reads `cpu_cores_threads`, so it
shows the wrong count for those two SKUs. Every other row agrees. Not fixed here.

### G9: caching. Confirmed fine.

No `use cache`, `revalidate` or `dynamic` export under `src/app/(app)/price-book/`.
`revalidateSpecPaths()` already revalidates `/price-book` and the family page.

### G10: adjacent drift

- **VMS lists, three copies, none agree.** Datasheet `copy.VMS_VALIDATED`: Milestone,
  Genetec, Avigilon, Hanwha WAVE, NX Witness, Exacq (6). Detail-page strip and index-page
  Enterprise Grade box: Milestone, Avigilon, Genetec, NXWitness, Hanwha, Exacq, Axxonsoft
  (7). `product_specs.vms_certified`: "Milestone XProtect, Avigilon ACC, Genetec" (3), and
  only 2 on `VX5-V100-32`. Axxonsoft is on the portal and missing from the datasheet.
- **`FAMILY_CATEGORIES` warranty labels** ("5-year warranty" for the three video
  categories) agree with `warranty_years = 5` on every row today.
- **`warranty_terms` is unusable as a KPI unit.** Four different values across the seven
  models, one of them 80+ characters, and the V500 rows start with a typo:
  `"dvanced Warranty with NBD ..."`. Proposal: keep one authored constant,
  `Next Business Day Parts`, for the KPI unit line.

### Data defects found on the way (all print on the live datasheet today)

Each is a `/admin/specs` edit for Andy. Nothing here writes to the database.

| Row(s) | Column | Value | Effect |
|---|---|---|---|
| VX5-V500-192/240/288 (+NCD) | `warranty_terms` | "dvanced Warranty ..." | V500 datasheet warranty band starts "dvanced" |
| VX5-V600-384 | `remote_mgmt` | "Dedicted Out of Band ..." | typo on V600 datasheet |
| VX5-V700-384 (prefix-extends 576) | `sfp_addon` | "... upgrade available)" | stray ")" on V700 datasheet |
| VX5-V200-* | `power_wattage` | "800W 1+1 redundant PSU -" | trailing "-" on V200 datasheet |
| VX5-V100-40, -48 | `network` | "2 × 10GbE + 1 IPMI" | V100 datasheet says 10GbE. `gbe_10_ports = 0`, `gbe_1_ports = 2`, and `VX5-V100-32` was corrected to "2 × 1GbE" on 2026-07-31. The -40/-48 rows were missed. |
| VX5-V800-576 | `hotswap_power` | "Yes 1+1" (edited from "Yes" 2026-07-29) | `canonicalRow()` prefix-extends the -864's "Yes" to "Yes 1+1", `isYes()` rejects it, and the **V800 datasheet drops its "N+1 hot-swap power & cooling" bullet** |
| VX5-V400-128 | `max_bandwidth_mbps` | 1600 (admin edit 2026-09-14, siblings and its own -NCD twin are 2000) | Hero stat unaffected (top SKU is 2000). Confirm 1600 is intended; if so the -NCD twin is stale. |
| VX5-V400-160 | `warranty` (legacy) | "5yr" | siblings say "5yr NBD, Advanced Replacement" |

## 3. Proposed bullet mapping (for Gate A)

Shared helpers move from `from-product-specs.ts` to `spec-text.ts` (G5): `raidLabel`,
`osText`, `isNegative`. `hasTpm` and `PORT_WORD` are not needed by the page and stay.

### Hero stats (always three)

| Stat | Value | Unit |
|---|---|---|
| Max VSR | `thousands(max_cameras_h265)` | `streams`, `vsrTooltip` kept |
| Throughput | `thousands(max_bandwidth_mbps)` | `Mbit/s` (one constant) |
| Warranty Support | `${warranty_years} Years` | `Next Business Day Parts` (authored constant, see G10) |

A blank column gives the page's existing `—` placeholder in that stat.

### Key Features (five)

| # | Rule | Dropped when |
|---|---|---|
| 1 | `osText(os_edition)` minus a leading "Microsoft " | `os_edition` blank |
| 2 | `{hdd_count}x Enterprise HDD's, {levels}{" & Cachevault" if isYes(battery_raid)}`, where `{levels}` = primary and alternate RAID levels through `raidLabel()`, joined with " or ", `NA` and blanks skipped | `hdd_count` blank |
| 3 | `{thousands(max_bandwidth_mbps)} Mbit/s max possible throughput` | bandwidth blank |
| 4 | `{rack_units} Rack mount w/ rails` | `rack_units` blank |
| 5 | `Max VSR = {thousands(max_cameras_h265)} streams h.265 or h.264` | cameras blank |

### Technical Specs (six, one structure for all seven models)

Network and remote management become two bullets everywhere (today the V100/V200 split
them and the V400 to V800 merge them).

| # | Rule | Dropped when |
|---|---|---|
| 1 | `cpu_model_full`, "Ghz" to "GHz", + " CPU" | blank |
| 2 | `{ram_spec} DRAM` | blank |
| 3 | **OS drive, needs Andy (§5 Q1).** Proposed: `{os_ssd_type}, {os_redundancy}, dedicated for OS/VMS`, with a negative `os_redundancy` ("NO") skipped. This is the datasheet's own fallback formula. `os_drive_desc` is ignored. | `os_ssd_type` blank |
| 4 | Port counts from the integer columns: `{gbe_10_ports}x 10Gb & {gbe_1_ports}x 1Gb Ethernet Ports`, a zero side omitted. The `network` text is not used (it contradicts the integers on two V100 rows). | both counts zero or blank |
| 5 | `1x Dedicated Remote Management` | `remote_mgmt` blank or negative |
| 6 | **Power, needs Andy (§5 Q2).** Proposed: hot-swap (`hotswap_power` starts with "Yes") gives `2x Hot-swap, Redundant Power Supply` when `power_redundancy` names "1+1", else `Hot-swap, Redundant Power Supply`. A negative `hotswap_power` gives `clean(power_redundancy)`. | anything else |

### Proposed before/after for the bullets (live rows, 2026-10-09)

Unchanged bullets are omitted. The Gate B table will be generated from the implementation.

| Model | Before | After |
|---|---|---|
| all 7 | `{n} Mbps max possible throughput`; KPI unit `Mbps` | `{n} Mbit/s max possible throughput`; KPI unit `Mbit/s` |
| V100, V200 | Windows Server 2022/2025 IoT Workgroup | Windows Server 2022 or 2025 WKGP LTSC |
| V400 to V800 | Windows Server 2022/2025 IoT Standard | Windows Server 2022 or 2025 LTSC |
| V100 | 2x Enterprise HDD's (RAID 1 or JBOD) | 2x Enterprise HDD's, RAID 1 or JBOD |
| V200 | 4x Enterprise HDD's — RAID 5 | 4x Enterprise HDD's, RAID 5 & Cachevault |
| V400 | 8x Enterprise HDD's, RAID 5 & Cachevault | 8x Enterprise HDD's, RAID 6 & Cachevault |
| V400 | KPI Max VSR 200; Max VSR = 200 streams ... | 150; Max VSR = 150 streams h.265 or h.264 |
| V700, V800 | KPI Max VSR 325; Max VSR = 325 streams ... | 275; Max VSR = 275 streams h.265 or h.264 |
| V400 | AMD EPYC 9005 3.3GHz 16/32 Core CPU | AMD EPYC 9015 3.6GHz 8/16 Core CPU |
| V700, V800 | AMD EPYC 9005 4.3GHz 16/32 Core CPU | AMD EPYC 9005 3.3GHz 16/32 Core CPU |
| V100, V200 | 16GB DDR5 DRAM | 16GB ECC DDR5 DRAM |
| V100 | 1x Enterprise OS SSD | 1x NVMe, dedicated for OS/VMS |
| V200 to V800 | 2x Mirrored Enterprise OS SSD — Hot Swap | 2x Enterprise SSD, Mirrored, hot-swap, dedicated for OS/VMS |
| V400 to V800 | 4x 10GbE, 1x Dedicated Remote Management | 4x 10Gb Ethernet Ports / 1x Dedicated Remote Management (two bullets) |
| V100 | 1x 80Plus Gold Power Supply | Single PSU 400W |
| V200 to V800 SKU tables | `96 TB` | `96 TB (85.7 TB available)`. Same number on all 18 SKUs. |

### Parity with the datasheet (the regression guard)

Same canonical-row rule, so these must be equal by test and by the standing script:
Max VSR vs "Max Camera Streams"; throughput vs the "Throughput" headline; CPU string vs
`cpu_model_full`; RAM vs `ram_spec`; OS vs the datasheet's "Operating system" row; rack
units; warranty years. The OS drive, network and power bullets are page-only phrasings and
are not part of the parity set.

## 4. Deviations from the brief

1. **Step 4 browser check replaced.** The dev server and browser tools crash this machine
   (standing rule). The seven pages will be verified by a read-only tsx probe that runs the
   page's data path (`current_products` visible filter, `product_specs` rows,
   `resolveFamilyDisplay`, `cellValue`) against live data and prints each page's hero, bullets
   and SKU table, plus the standing audit's page-vs-datasheet comparison.
2. **`gbe_1_ports` is outside the adapter's `ProductSpecRow`.** The page derivation takes
   `ProductSpecRow & { gbe_1_ports }`. The datasheet type is left alone.
3. **OS drive and power** do not follow the brief's draft column list exactly (Q1, Q2).
4. **`isYes` stays strict.** The page's hot-swap test is local and reads "Yes 1+1" as yes;
   see the V800 defect in §2.

## 5. Questions for Andy at Gate A

- **Q1. OS drive bullet.** (a) Recommended: `2x Enterprise SSD, Mirrored, hot-swap, dedicated
  for OS/VMS` from `os_ssd_type` + `os_redundancy` on all seven models. (b) The brief's draft:
  `os_drive_desc` first. That gives V400 "3D TLC Flash SSD SATA3 Dedicated for OS/VMS, Hot-swap"
  and drops "2x" and "mirrored" on V400, V500 and V700, while the other four read as in (a).
- **Q2. Power bullet.** Recommended rule in §3. The V100 bullet becomes "Single PSU 400W",
  because no column supports "80Plus Gold".
- **Q3. Admin warning text.** `admin/specs/fields.ts` warns that "the Price Book prints the
  [legacy warranty] string". That is untrue today and stays untrue after this change, since
  the page will read `warranty_years`. Fix the sentence in this change (one string), or leave it?
- **Q4. Data defects (§2 table).** For Andy to fix in `/admin/specs` at any time; none of them
  blocks this change. The V100 network and V800 hot-swap ones change what the datasheet
  claims.
