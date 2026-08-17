# Axis Camera Seed Refresh — Claude Code Brief

**Model/effort:** Sonnet 5 at medium for mechanical diffing and row generation;
escalate to Opus 5 at xhigh only if the comparison surfaces schema-level judgment
calls (e.g. how to represent multi-sensor/multi-lens specs in existing columns).

**Source of truth for this brief:** `axis_cameras_normalized.json` (187 rows),
extracted and normalized from Axis's official Q3 2026 "Comparison tables" PDF
(internal title "AXIS Cheat Sheet", created 2026-07-22). This is Axis's own
published spec sheet, not scraped or inferred — treat field values as authoritative
Axis data, modulo the extraction/normalization caveats below.

---

## 1. Objective

Compare `axis_cameras_normalized.json` against the portal's existing camera seed
table (68 rows: Axis, Hanwha, Avigilon — same table the Hanwha refresh added to)
and:

1. Identify which of the 187 extracted Axis models are **already seeded**.
2. Identify which are **new** and should be added.
3. Flag any **existing Axis rows whose specs have drifted** from this current
   source (e.g. a firmware-driven max-fps change, a codec support addition).
4. Produce an Opus-reviewable diff before any writes — **do not auto-write to
   the seed table**. Follow the standing stop-and-flag gate for schema/data writes.

## 2. Scope rules

- **In scope:** Box, Bullet, Modular, Dome, Panoramic, PTZ, and Thermal network
  cameras (categories present in the normalized file). This mirrors what the
  Hanwha/Avigilon rows cover today.
- **Out of scope for this pass:** Explosion-protected devices, Canon-badged
  cameras, radar, access control, audio, intercoms, recorders, workstations.
  These exist in `axis_all_categories_raw.json` if a future pass wants them,
  but do not seed them without an explicit decision — the calculator's current
  schema is built around network cameras only.
- **Multisensor/multi-lens models** (e.g. `AXIS Q4809-PVE` — 4x sensor panoramic;
  `AXIS Q6411-LE` — bispectral thermal+visual PTZ; dual-lens box cameras like
  `AXIS Q1728-LE` with 13mm/48mm variants): these do not fit a single
  resolution/sensor/lens cell cleanly. **Do not silently pick one sensor's specs
  and drop the rest.** Follow the same pattern established in the Hanwha
  multisensor exception handling — flag these for explicit schema decision
  rather than guessing. Route these specifically to Opus 5 at xhigh, same as
  the Hanwha multisensor routing rule.
- **No deletion** of existing seeded rows (Axis, Hanwha, or Avigilon) in this
  pass. No backfilling of discontinued/EOL models — check current Axis
  datasheet pages for any model showing signs of EOL language if uncertain.

## 3. Known extraction caveats (read before trusting a mismatch)

- Field values are **raw strings from the PDF**, not pre-parsed into numeric
  types. E.g. `max_fps` is `"50/60"` (color/B&W or two frame-rate modes,
  context-dependent — check `highlighted_features` and `wdr_lightfinder` for
  which convention applies per row), `min_illumination_lux` is
  `"0.05/0.00"` (Color/B&W pair). Any diffing logic must parse these
  consistently with however the existing seed table already encodes them —
  check the existing Axis rows' encoding before assuming a format.
- `sensor_lens_fov` sometimes bundles multiple lens variants or multiple
  sensors as one long string (see multisensor note above). Do not regex-split
  this blindly; a model with "13 mm: ... 48 mm: ..." is one model with two lens
  options, not two rows.
- Checkmark/dash encoding (`√ / -`, `√ / √ / -`) reflects the PDF's own slash-
  delimited multi-feature columns (e.g. `zipstream_codec_support` is
  H.264/H.265/AV1 support as three or four checkmarks depending on page — the
  column order is NOT guaranteed identical across every table since some
  pages have 3 slash-delimited values and some have 4). **Verify positional
  meaning per row against the `category`/`page` fields before trusting a
  position-based parse** — do not assume column 1 always means H.264 for every
  row without checking.
- `page` field lets you trace any row back to the exact PDF page for manual
  verification if a diff looks suspicious.
- One legitimate duplicate exists in the raw (not normalized-cameras) file:
  `AXIS XC1311` appears in both explosion-protected and network-audio tables
  — this is a real product appearing in two catalog contexts, not an
  extraction bug. Not relevant to this camera-only pass since it's a speaker.

## 4. Deliverables expected from this Claude Code session

1. `axis_diff_report.md` — three sections: New models to add (with proposed
   row data mapped to the existing seed schema), Existing models with spec
   drift (old value vs. new value, per field), Flagged multisensor models
   needing a schema decision before seeding.
2. **No direct writes to the seed table or Supabase.** Output the report only.
   Andy reviews, then a follow-up session executes the actual insert following
   the existing ADR-numbered decision + JOURNAL.md discipline.

## 5. Files provided

- `axis_cameras_normalized.json` / `.csv` — 187 network camera models, 44
  canonical columns, ready to diff.
- `axis_all_categories_raw.json` — full 304-record extraction across every
  category in the PDF (audio, access control, intercoms, etc.) in case a
  future pass wants those.
