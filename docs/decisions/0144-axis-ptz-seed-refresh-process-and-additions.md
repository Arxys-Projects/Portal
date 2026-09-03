# 0144 — Axis PTZ seed refresh: sourcing process and 15 current-model additions

- **Status**: Accepted
- **Date**: 2026-09-03

## Context

Andy asked whether four specific Axis models (P3225-LVE Mk II, P3227-LVE, P3719-PLE,
Q6358-LE) were in the camera_specs seed. None were — but the check surfaced that
`data/axis-camera-specs.json` / `-multisensor.json` (the files `scripts/load-camera-specs.ts`
actually loads into the DB) hadn't been diffed against `Axis Camera Seed/` in this repo, a
scratch folder holding a prior research pass: 187 Axis models extracted and normalized from
Axis's own Q3 2026 "Comparison tables" PDF, per `Axis Camera Seed/axis_seed_refresh_brief.md`.
That brief's own scope rules call for a reviewed diff before any write — this ADR is that
review for the PTZ slice of it.

Cross-referencing the 21 rows tagged `"Pan/tilt/zoom cameras"` in
`axis-cameras-normalized-2026-q3.json` against the portal's seed found only 2 already present
(Q6300-E, and M5000/M5000-G via alias). Of the 19 gaps:

- **Q6411-LE** — bispectral thermal+visual PTZ. Excluded per Andy's "ignore thermals" call.
- **AXIS Q87** — a bispectral thermal/visual row with no specific model suffix (unlike every
  other row in the table); reads like a series/family entry rather than one sellable SKU.
  Excluded — needs a source page to identify the actual model number before it's addable at
  all, thermal or not.
- **Q6020-E** — categorized as PTZ in Axis's own table, but verified on axis.com to be a
  4-sensor 360° overview camera sold as a companion to a *separate* AXIS Q60-series PTZ head,
  not a PTZ itself and not single-sensor. Same shape as the already-seeded Q6300-E
  (multidirectional, `sensor_count: 4`, `sensor_detail` object). Excluded from this pass —
  fits the seed-refresh brief's standing rule that multisensor models get flagged for
  explicit schema review rather than force-fit into a single-sensor row.
- **The remaining 16** are genuine single-sensor PTZ cameras. Each was verified individually
  (see Process below) against its live axis.com support page: all 16 show no "Product end of
  support" notice and carry current AXIS OS support dates (2033–2035). 15 of the 16 became the
  additions below; the process section explains why 16 → 15.

## Process used to source the data

The normalized JSON's own caveats section (extraction from a PDF table) warns its field
values are raw strings, not vetted per-row — so nothing from it was trusted directly into the
seed. For each of the 16 candidate models:

1. Confirmed the model is real and current by fetching its live
   `axis.com/products/axis-<slug>/support` page and checking for a "Product end of support" /
   discontinuation banner (the same signal used earlier in this conversation to confirm
   P3225-LVE Mk II, P3227-LVE, and P3719-PLE are EOL, and Q6358-LE is not).
2. Pulled `max_width`/`max_height` from that page's own Technical Specifications table
   (authoritative, current-firmware numbers), not from the PDF extraction — this is also
   where Q6020-E's true sensor architecture was caught (the PDF row alone would have looked
   like an ordinary single-resolution PTZ).
3. Ran the result through `scripts/validate-camera-specs.ts` before treating it as seed-ready
   (per-vendor, per-schema checks — dimensions map to a `RESOLUTIONS` bucket, `(vendor,model)`
   uniqueness, etc.) — the same gate `load-camera-specs.ts` enforces before any DB write.
4. `model_aliases` follows the existing file's own convention: the model with its trailing
   descriptor suffix (`-E`, `-LE`, `-G`, `-V`, etc.) stripped, wherever that's unambiguous —
   skipped where the stripped form collides with another real, separately-seeded model (e.g.
   `M5075-G` did *not* get alias `M5075`, since `M5075` is itself a distinct seeded row).

This same process — live support-page check for EOL status, spec numbers pulled from the
Technical Specifications table rather than any prior extraction, then
`validate-camera-specs.ts` before treating a row as seed-ready — is the repeatable answer to
"how do we get the data if it's not already in the seed": go to the vendor's own current
product/support page per model, not the cheat-sheet PDF extraction, which is a useful
candidate list but not itself a trusted source.

One row, P5654-E Mk II, listed two resolutions in the PDF extraction
(1280x720 *and* 1920x1080 — likely two selectable stream profiles). The live support page's
own spec table reports a single `max_video_resolution` of 1920x1080, which is what got seeded
— consistent with how every other row in the existing file already encodes only the single
top-line max resolution.

## Options considered

- **Seed all 19 gaps, including thermals/multisensor** — rejected; Andy explicitly said
  ignore thermals, and Q6020-E/Q87 aren't single-sensor PTZ cameras the existing schema
  models cleanly (same reasoning the seed-refresh brief already applies to Q6411-LE and other
  bispectral/multisensor rows).
- **Trust the PDF-extracted spec values directly** — rejected; the brief's own caveats section
  warns these are raw, unverified strings, and Q6020-E's true multisensor nature would have
  been missed entirely by trusting the PDF's single resolution number.
- **Seed 15 verified single-sensor current models via live axis.com data** — chosen.

## Decision

Added 15 rows to `data/axis-camera-specs.json`: M5074, M5075, M5075-G, M5526-E,
P5654-E Mk II, P5655-E, P5676-LE, Q6086-E, Q6088-E, Q6225-LE, Q6325-LE, Q6355-LE, Q6358-LE,
V5925, V5938. All verified current (no EOL notice) as of 2026-09-03, all `sensor_count: 1`,
`sensor_detail: null`, `source_url` pointing at the live axis.com product page.

Deliberately **not** seeded in this pass: Q6411-LE and "AXIS Q87" (thermal/bispectral,
per Andy's instruction), and Q6020-E (multisensor 360° overview companion, not a PTZ — needs
the same explicit schema treatment as the already-seeded Q6300-E, not a plain single-sensor
row).

`validate-camera-specs.ts` passes clean against the updated file (43 rows, all checks PASS).
The actual DB load — `load-camera-specs.ts data/axis-camera-specs.json` — is a separate,
gated step: it hits production Supabase with the service-role key and requires a typed
`CONFIRM`, by design (mirrors the price-pipeline gate). That step is intentionally left for
Andy to run, not executed as part of this commit.

## Consequences

**Positive:** the calculator's Axis camera picker now covers current-generation PTZ hardware
(M50/M55/P56/Q60/Q62/Q63/V59 series) that was a known, verifiable gap. The sourcing process
(live support-page check → spec table → validator) is repeatable for the next vendor/category
slice of the `Axis Camera Seed/` diff, without re-deriving it from scratch.

**Negative:** the file still doesn't cover Q6020-E, Q6411-LE, or "AXIS Q87" — anyone searching
for those models in the calculator still won't find them until a follow-up multisensor/thermal
schema decision is made. The DB itself is unchanged until someone runs the load script.

**When to revisit:** when Q6020-E (or another multidirectional-plus-PTZ-head pairing) needs to
actually appear in the calculator — that's a schema question (how to represent a two-camera
system in a table keyed on one `(vendor, model)` row), not a data-sourcing one, and should
follow the same Opus-at-xhigh routing the seed-refresh brief already specifies for
multisensor/bispectral rows. Also revisit if `Axis Camera Seed/`'s remaining categories (Box,
Bullet, Dome, Modular, Panoramic) get the same diff-and-seed treatment this ADR gave PTZ.
