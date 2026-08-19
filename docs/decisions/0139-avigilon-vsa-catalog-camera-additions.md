# 0139 — Avigilon VSA catalog additions: PTZ back in scope, H5 Pro 40/61MP deferred, multi-mode sensors sized at highest total pixels

- **Status**: Accepted
- **Date**: 2026-08-19

## Context

Andy supplied the full Avigilon VSA Product Catalog (18 pages) to seed new camera
lines into `camera_specs`. Cross-checking the catalog against the existing
`data/avigilon-camera-specs.json` showed H6A/H6X, H6SL, H6M, and the H5A/H6A
Multisensor and Dual Head lines were already seeded and verified. The genuinely
new lines were H5 Pro, H5A Fisheye, H5A Corner, H5M, and the PTZ lines (H6A PTZ,
H5A PTZ, H5A IR PTZ).

Three sub-decisions came up while sourcing real pixel dimensions from Avigilon's
own per-model datasheets (never from the summary catalog's MP labels, per ADR
0062):

**1. PTZ scope.** ADR 0062 phase-1-excluded "thermal and PTZ/broadcast cameras"
because they don't fit resolution-bucket storage sizing "the way fixed cameras
do." Andy explicitly asked for PTZ cameras to be included this round. Thermal
stays excluded (ADR 0134 reasoning still applies — no visible+thermal dual-
channel representation has been decided). Modular (H5A Modular imager+main-unit
system) also stays excluded — it is the literal "configurable/modular-sensor
platform" ADR 0062 was written to exclude, and nothing about this request
touches that reasoning.

**2. Multi-mode single-sensor resolution selection.** Several lines (H6A/H6X,
H6A PTZ, H5 Pro, H5A Corner, H5M) publish more than one selectable native
resolution mode at the same marketed MP tier — different aspect-ratio crops of
the same sensor (e.g. H5 Pro 26MP: 6240×3512 16:9 vs. 6240×4160 3:2). ADR 0071
already established "size at the highest" for *multi-sensor* mixed-resolution
devices; this is the single-sensor analog and wasn't previously covered.

**3. H5 Pro exceeds the resolution bucket ceiling.** `camera-resolution.ts`
(ADR 0058) caps at a 29MP bucket (6576×4384). H5 Pro's 40MP and 61MP tiers
(7,776×5,184 = 40.3MP and 9,568×6,376 = 61.0MP) exceed that ceiling under
*either* selectable aspect mode — `validate-camera-specs.ts` fails both rows
with "exceeds the largest bucket, needs manual review." This is a limit of the
shared storage/bandwidth math table (`tables.ts`), not a seed-data mistake, and
extending it is a bigger change than this task's scope — it changes calculator
behavior for every future 30MP+ camera, not just these two rows.

## Options considered

- **Leave PTZ excluded** — rejected: Andy explicitly asked for it this round.
- **Extend `RESOLUTIONS` with new 40/61MP buckets to fit H5 Pro** — rejected
  for *this* task: it's a shared-system change to core calculator math
  (`tables.ts`), not camera seed data, and needs its own deliberate decision
  (what bitrate/storage assumptions apply at 40–61MP) rather than being a side
  effect of a catalog seed.
- **Guess a single canonical resolution per multi-mode tier** (e.g. always
  prefer 16:9) — rejected: checked against real numbers, 16:9 sometimes
  *undershoots* the marketed MP by a wide margin (H5 Pro 26MP 16:9 = 21.9MP,
  9% short of the 3:2 mode's 26.0MP) — an arbitrary aspect preference would
  silently under-provision storage math for exactly the sizing reason ADR 0071
  rejected averaging/guessing for multi-sensor devices.
- **Size multi-mode sensors at whichever mode has the highest total pixel
  count** — chosen: consistent with ADR 0071's "provision with headroom, never
  guess" philosophy, and directly computable from each datasheet's own
  published numbers with no interpretation needed.
- **Drop H5 Pro 40MP/61MP silently** — rejected: matches neither this file's
  own convention (ADR 0062's "log deferred models") nor the standing
  transparency rule from ADR 0135 (exclude and flag, never silently drop).

## Decision

Added 16 new single-sensor rows to `data/avigilon-camera-specs.json`, each
sized at the datasheet's real *active pixel* resolution — never the marketing
MP label — and, where a device publishes multiple selectable native modes,
sized at whichever mode has the highest total pixel count:

- **H6A PTZ**: 2MP → 1920×1080, 4MP → 2560×1440 (confirmed distinct from H6A
  Dome/Bullet's 4MP of 2688×1520 — same generation name, different sensor
  crop; do not conflate).
- **H5A PTZ**: 4MP → 2688×1512, 8MP → 3840×2160.
- **H5A IR PTZ**: 2MP → 1937×1097 (odd native pixel count, taken verbatim from
  the datasheet's "Active Pixels" row), 4MP → 2688×1512, 8MP → 3840×2160.
- **H5 Pro**: 8MP → 3840×2160, 16MP → 4944×3296 (3:2, 16.30MP > 16:9's
  16.07MP), 26MP → 6240×4160 (3:2, 25.96MP > 16:9's 21.91MP). **40MP and 61MP
  deferred** — see Consequences.
- **H5A Fisheye**: 8MP → 2048×2048, 12MP → 3008×3008 (from the original
  catalog's own "Active Pixels" row; note the fisheye MP label does not equal
  width×height here either — 2048² is 4.19MP, not 8MP — Avigilon's fisheye MP
  rating refers to the pre-crop sensor, not delivered pixels).
- **H5A Corner**: 3MP → 2048×1536 (4:3 > 16:9's 1920×1080), 5MP → 2592×1944
  (4:3 > 16:9's 2560×1440). Cold-rolled-steel and stainless-steel body
  variants share identical resolution and are collapsed into one row each per
  the standing convention (same pattern as H6A's D1/D2/-IR lens variants).
- **H5M**: 2MP → 1920×1080 (highest of four selectable modes), 5MP →
  2592×1944 (4:3 > 5:4's 2560×1440).

`sensor_count: 1` and `sensor_detail: null` throughout — these are ordinary
fixed/PTZ cameras, not multisensor devices, so ADR 0071's `sensor_detail`
convention doesn't apply.

The file went from 19 rows to 37 after drafting 18 candidate rows, then to 35
after dropping the 2 out-of-range H5 Pro rows (see below). All 35 rows pass
`scripts/validate-camera-specs.ts`.

## Consequences

**Positive:** PTZ lines are now quotable in the calculator, matching Andy's
explicit request. Every new row cites a real per-model Avigilon datasheet
`source_url`, so a future auditor can re-verify without re-deriving pixel math
from MP labels. The multi-mode "highest total pixels" rule is now a
documented, reusable pattern for the next vendor camera with selectable
aspect-ratio streaming modes.

**Negative:** H5 Pro 40MP and 61MP are not in `camera_specs` — an integrator
quoting one of these two SKUs must size it by hand, the same gap ADR 0134
already flagged would recur. H6A PTZ's 4MP (2560×1440) is *lower* pixel count
than H6A Dome/Bullet's 4MP (2688×1520) despite sharing a generation name and
marketed MP figure — anyone hand-comparing PTZ vs. fixed-camera bandwidth at
"the same 4MP" will see a real, correct discrepancy, not a bug.

**When to revisit:** if a bid ever needs an H5 Pro 40MP or 61MP camera, at
which point someone must decide how to extend `RESOLUTIONS` in `tables.ts` —
new discrete buckets vs. a different sizing strategy above 29MP — as its own
reviewed change to shared calculator math, not folded into a camera-seed task.
