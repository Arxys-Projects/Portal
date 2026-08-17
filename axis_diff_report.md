# Axis Camera Seed Refresh — Diff Report (Q3 2026 Comparison Tables)

**Generated:** 2026-08-17
**Source:** `axis_cameras_normalized.json` (187 rows), extracted from Axis's own
Q3 2026 "Comparison tables" PDF (internal title "AXIS Cheat Sheet", created
2026-07-22). Banked at [`Axis Camera Seed/axis-cameras-normalized-2026-q3.json`](./Axis%20Camera%20Seed/axis-cameras-normalized-2026-q3.json).
**Live baseline queried directly from Supabase** at diff time (not the local
JSON seed files) via [`Axis Camera Seed/_diff.ts`](./Axis%20Camera%20Seed/_diff.ts):
37 Axis rows out of 260 total (`camera_specs`, Axis + Hanwha + Avigilon).
**No writes made in this pass** — report only, per the standing stop-and-flag
gate (`scripts/load-camera-specs.ts`). Full machine-readable diff:
[`Axis Camera Seed/axis-delta.json`](./Axis%20Camera%20Seed/axis-delta.json).

## 0. Corrections to the original brief's assumptions

The brief that requested this pass (`Axis Camera Seed/axis_seed_refresh_brief.md`)
was written against stale numbers and a schema assumption that doesn't hold.
Corrected here so the rest of this report isn't read against the wrong
baseline:

1. **The seed table is not 68 rows.** It's **260** (Axis 37, Hanwha 193,
   Avigilon 30) as of the 2026-08-11 Hanwha refresh. This diff was run
   against the live 37 Axis rows, not the stale count.
2. **`camera_specs` has 10 columns, not 44.** The live schema
   (`supabase/migrations/20260615000002_phase10_camera_specs.sql`) is
   `vendor, model, model_aliases, sensor_count, max_width, max_height,
   sensor_detail, currently_shipping, source_url, as_of_date` — a
   storage-sizing grain. None of the PDF's rich spec fields (`max_fps`,
   `min_illumination_lux`, `zipstream_codec_support`, `power`, `io_ports`,
   `sustainability`, etc.) have a column to land in. Per your direction, this
   diff is scoped to what the schema actually stores: model identity,
   resolution, and sensor count/detail. The rich fields are kept as raw
   reference on each candidate (`_extraction_note`-style context) but are not
   diffed field-by-field and are never written as real columns.
3. **187 extracted rows ≠ 187 in scope.** 7 are "Explosion-protected
   devices" and 2 are "Canon network cameras" — different column schema
   entirely, never in scope per the brief's own section 2. That leaves
   **178**. A further **10** turned out to be thermal/bispectral (see §3),
   leaving **168** actually diffed.

## 1. New models to add — 120 ready, 1 flagged

Full candidate rows: [`Axis Camera Seed/_candidate-single.json`](./Axis%20Camera%20Seed/_candidate-single.json)
(117 rows) and [`Axis Camera Seed/_candidate-multisensor.json`](./Axis%20Camera%20Seed/_candidate-multisensor.json)
(3 rows). Both **pass `scripts/validate-camera-specs.ts` cleanly** and were
checked for `(vendor, model)` collisions against the live table (none found).

### 1a. 117 single-sensor models — ready to load as-is

Ordinary new SKUs across Box/Bullet/Dome/Modular/Panoramic/PTZ, each with a
`source_url` verified live against axis.com (not pattern-guessed) via
background research. 116 of 117 are high-confidence, directly-confirmed
product-page or datasheet URLs. One row (`FA3105-L`, see below) is
medium-confidence since the URL comes from resolving a source-data naming
artifact rather than a direct one-to-one search hit.

**Three PDF extraction artifacts corrected, not new SKUs:**

| Source table listed | Real Axis SKU | Evidence |
|---|---|---|
| `AXIS FA41151` | `AXIS FA4115` (Dome Sensor Unit) | Confirmed by re-extracting the source PDF's own table structure: the neighboring column values for this row match the FA4115 datasheet's lens/lux spec exactly, with a stray footnote-marker digit concatenated onto the SKU. |
| `AXIS FA11251` | `AXIS FA1125` (Sensor Unit) | Same pattern, same PDF row. |
| `AXIS FA11051` | `AXIS FA1105` (Sensor Unit) | Same pattern, same PDF row. |
| `AXIS FA3105-L1` | `AXIS FA3105-L` (Eyeball Sensor Unit) | Direct page fetch confirms no `-L1`/`-L2` variant exists on axis.com; only `FA3105-L` (part 01026-001). |

The corrected candidate rows use the real SKU as `model` and keep the
source-table's exact string as an alias so it's still searchable.

**11 F-series "main unit" models included normally** (`F9104-B Mk II`,
`F9111-R Mk II`, `F9114-R Mk II`, `F9114-B Mk II`, `FA51`, `FA51-B`, `FA54`) —
these have real, independent resolution figures and are ordinary new rows,
distinct from the 10 sensor-*head* models deferred in §3.

**Two source-table parentheticals resolved, not separate SKUs:**
`AXIS M3125-LVE (black and white)`, `AXIS M3126-LVE (black and white)`, and
`AXIS M3128-LVE (black and white)` are color-housing variants (distinct part
numbers, identical specs) that share one product page each — seeded as one
row per model, matching how existing color-variant rows in the table already
work.

### 1b. 3 multisensor models — ready, per ADR 0071

| Model | sensor_count | max_width×height | Basis |
|---|---|---|---|
| `P4708-PLVE` | 2 | 3840×2160 | Official datasheet states "2x 3840x2160 (2x 8MP)" explicitly — no ambiguity, confirmed by direct datasheet fetch. |
| `P1518-LE` | 2 | 3840×2160 | Genuine simultaneous dual-sensor (wide 8MP + telephoto/LPR 2MP), confirmed via official datasheet. Sized at the higher sensor per ADR 0071; per-sensor breakdown in `sensor_detail`. |
| `P1518-E` | 2 | 3840×2160 | Same camera family/sensor pair as `P1518-LE`, different housing. |

`P1518-LE`/`P1518-E` were **not** obvious from the PDF extraction alone — the
source table's `sensor_lens_fov` field lists two "1x" lens specs side by side
("8 MP: 1x ... 2 MP: 1x ..."), which doesn't match this repo's existing
"Nx sensor-count prefix" pattern for detecting multisensor cameras (that
pattern is what flagged `Q4809-PVE` and `P4708-PLVE` correctly). Background
research against the official datasheet confirmed both sensors are real,
independent, simultaneously-active video streams (not an illuminator,
radar, or accessory) — a genuinely new sensor-pairing shape not covered by
any existing multisensor row in this table.

### 1c. 1 flagged — cannot propose row data yet

**`AXIS Q4809-PVE`** (4-sensor panoramic, Panoramic cameras). The source
table only gives the fused/stitched resolution ("10240x2560 (26 MP)"), which
is not the per-sensor value (same trap as the already-seeded `Q3839-PVE`,
whose per-sensor 3840×2160 differs from its fused 7552×3776). Axis's own
datasheet states each of the 4 sensors is independently rated at **12 MP**,
but **does not publish a width×height pair for that 12MP figure anywhere on
axis.com** — not the datasheet, not the product page. The only way to get a
specific pixel dimension is to infer the sensor part number from its stated
specs (12MP, 1/2.3", 1.55µm pixel pitch strongly resembles the Sony IMX377,
native 4000×3000) — but that's a third-party inference, not an Axis-sourced
figure, and falls outside the sourcing bar used for every other row in this
report.

**Recommendation:** do not seed `Q4809-PVE` this pass. Either accept the
IMX377-based 4000×3000 inference explicitly as a documented approximation (a
judgment call, not a lookup), or hold until an authoritative per-sensor
figure is available (e.g. an Axis rep/portal source). Flagging rather than
guessing, per the brief's own instruction not to silently pick a number for
multisensor cases like this.

## 2. Existing Axis rows — spec drift

7 candidates surfaced by the diff; **6 are false positives** from extraction
ambiguity (explained below, no action needed), **1 is real**.

| Model | Existing | Extracted | Verdict |
|---|---|---|---|
| `Q3839-PVE` | 3840×2160 (per-sensor, sensor_count 4) | 7552×3776 (fused) | **False positive.** Extracted value is the stitched panorama, not per-sensor — same 4-sensor camera, same per-sensor spec, existing row is correct. |
| `Q3839-SPVE` | 3840×2160 (per-sensor, sensor_count 4) | 7552×3776 (fused) | **False positive**, same cause as above (stainless variant of Q3839-PVE). |
| `P3827-PVE` | 928×1856 (per-sensor, sensor_count 4) | 3712×1856 (fused) | **False positive**, same cause. |
| `P3818-PVE` | 2592×1944 (per-sensor, sensor_count 3) | 5120×2560 (fused) | **False positive**, same cause. |
| `Q6300-E` | sensor_count 4, 2592×1944 | sensor_count **1** (detector missed it), 2592×1944 | **False positive.** Resolution matches exactly; this repo's diff heuristic only recognizes a leading `"Nx "` prefix in `sensor_lens_fov` as the multisensor signal, and Q6300-E's field describes a single 360° lens instead. No real drift — sensor_count and resolution both already correct in the existing row. |
| `M5000-G` | sensor_count 4, 2592×1944 | sensor_count **1** (detector missed it), 2592×1944 | **False positive**, same detector-heuristic gap as Q6300-E (overview+PTZ combo phrased without an "Nx" prefix). |
| `Q1806-LE` | 2160×1512 | **2880×1620** | **Real — recommend updating.** Confirmed via the live axis.com product page and current datasheet: 2880×1620 (16:9, 4.67MP) is the camera's actual maximum resolution, exceeding 2160×1512 (4:3, 3.27MP) in total pixel count and matching the datasheet's own "4 MP" tagline. Datasheet revision/dimension-drawing dates predate the existing row's `as_of_date` (2026-06-15) — this isn't a firmware change since then, it looks like the original seeding captured the 4:3-mode max instead of the true 16:9 max. **Recommended fix:** update the existing `Q1806-LE` row to `max_width: 2880, max_height: 1620`. |

## 3. Deferred / excluded this pass

- **10 thermal/bispectral models** — 7 in the dedicated "Thermal cameras"
  category (`Q2802-E`, `Q2112-E`, `Q2111-E`, `Q2101-TE`, `Q1972-E`, `Q1971-E`,
  `Q1961-TE`) plus 3 hidden inside other categories (`Q87` and `Q6411-LE`,
  filed as "Pan/tilt/zoom cameras"; `F2180-TE`, filed as "Modular cameras").
  No existing precedent for simultaneous visual+thermal streams, and thermal
  resolution doesn't map onto the visible-light `RESOLUTIONS` buckets. See
  [ADR 0134](./docs/decisions/0134-thermal-cameras-deferred-from-camera-specs.md).
- **1 exceeds the resolution ceiling** — `AXIS Q1809-LE` at 41MP
  (7424×5568), above the 29MP `RESOLUTIONS` ceiling. This is the second
  camera (after Hanwha's `TNB-9000`) to trigger ADR 0121's documented
  "when to revisit" condition; the decision doesn't change — not seeded,
  logged as a known gap, same as `TNB-9000`.
- **10 F-series modular sensor heads** — `F2105-RE`, `F2107-RE`, `F2108`,
  `F2115-R`, `F2135-RE`, `F2137-RE`, `F4108`, `F4105-SLRE`, `F4105-LRE`,
  `F7225-RE`. Their datasheet fields say "See AXIS F91XX Main Units" instead
  of stating their own resolution — these are lens/sensor heads whose
  effective resolution depends entirely on whichever main unit they're
  paired with, so there's no standalone value to seed. The F91xx main units
  themselves have real resolutions and are included normally in §1a.
- **3 already covered by an existing alias** — `AXIS Q1728`, `AXIS Q1726`,
  `AXIS M5000` match existing rows `Q1728-LE`, `Q1726-LE`, `M5000-G` via
  alias, not their own model name. No action needed.
- **Explosion-protected devices (7) and Canon network cameras (2)** — never
  in scope per the brief; confirmed to use an entirely different column
  schema from the 7 in-scope categories (checked directly, not just taken on
  faith).

## 4. Recommended follow-up (not done in this pass)

No writes were made. If you want to proceed with seeding:

1. **Load the 120 ready new rows** via the existing gated loader — no SQL,
   no schema change needed:
   ```bash
   node --env-file=.env.local --import tsx scripts/load-camera-specs.ts "Axis Camera Seed/_candidate-single.json" --dry-run
   node --env-file=.env.local --import tsx scripts/load-camera-specs.ts "Axis Camera Seed/_candidate-single.json"
   node --env-file=.env.local --import tsx scripts/load-camera-specs.ts "Axis Camera Seed/_candidate-multisensor.json" --dry-run
   node --env-file=.env.local --import tsx scripts/load-camera-specs.ts "Axis Camera Seed/_candidate-multisensor.json"
   ```
   (Each requires the loader's typed `CONFIRM` prompt — nothing writes
   silently.) Once loaded, the reviewed rows should also be copied into
   `data/axis-camera-specs.json` / `data/axis-camera-specs-multisensor.json`
   so the local seed files stay in sync with what's live, matching how every
   prior refresh has kept them aligned.
2. **Fix `Q1806-LE`'s resolution** (§2) — same loader, same idempotent
   upsert on `(vendor, model)`, just a one-row seed file with the corrected
   `max_width`/`max_height`.
3. **Decide `Q4809-PVE`'s per-sensor resolution** (§1c) before seeding it —
   either accept the IMX377-based inference explicitly, or source the figure
   from Axis directly.
4. Thermal/bispectral deferral is recorded in ADR 0134; no action needed
   unless a partner requests one of those models.
