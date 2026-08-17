# 0134 — Thermal and bispectral cameras deferred from `camera_specs`

- **Status**: Accepted
- **Date**: 2026-08-17

## Context

The Axis Q3 2026 "Comparison tables" extraction (187 models) includes a
dedicated "Thermal cameras" category (7 models: `Q2802-E`, `Q2112-E`,
`Q2111-E`, `Q2101-TE`, `Q1972-E`, `Q1971-E`, `Q1961-TE`) plus three more models
filed under ordinary visible-light categories that are actually bispectral
(simultaneous thermal + visual) units: `AXIS Q87` and `AXIS Q6411-LE`
(both "Pan/tilt/zoom cameras") and `AXIS F2180-TE` (a "Modular cameras" sensor
head, already excluded separately — see the no-standalone-resolution note in
`axis_diff_report.md`). A category-label filter alone misses the last two;
they were only caught by scanning every field for a thermal/bispectral
signature (see `Axis Camera Seed/_diff.ts`).

No vendor currently has a single thermal or bispectral row in `camera_specs`
— not Axis, Hanwha, or Avigilon. Two things about these cameras don't fit the
table's existing shape:

1. **Resolution.** The `camera_specs` grain (`max_width`/`max_height`,
   feeding `mapPixelsToBucket`/`RESOLUTIONS`) is built for visible-light
   storage-sizing math. Thermal sensors are tiny by comparison (e.g.
   `Q6411-LE`'s thermal channel is a native 384×288, upscaled for display to
   768×576) and contribute negligibly to bitrate/storage next to the visual
   channel's 1920×1080 — so simply picking the higher-resolution stream (the
   pattern ADR 0071 uses for ordinary multisensor cameras) would silently
   discard the thermal channel's existence from the row entirely, not just its
   pixel count.
2. **Representation.** ADR 0071 covers two shapes: N identical sensors
   (stitched panoramic) and a same-camera overview+PTZ combo. A bispectral
   camera is neither — it's two dissimilar sensor *types* (thermal vs.
   visible-light), which changes what "sensor count" and "resolution" even
   mean for the storage-sizing math thermal footage doesn't obviously belong
   in.

## Options considered

- **Seed as `sensor_count: 2`, sized at the visual sensor's resolution,
  thermal detail in `sensor_detail`.** Mechanically possible (would pass
  `validate-camera-specs.ts`), but it's a guess at what the storage math
  *should* do with a thermal stream, made without anyone deciding it — the
  underlying question (does thermal footage count toward VSR storage sizing
  at all, and if so how) hasn't been decided anywhere in this codebase.
- **Seed as `sensor_count: 1`, visual resolution only, silently drop the
  thermal channel.** What the diff's naive heuristic did before this pass
  caught it. Rejected — it seeds a real product with a wrong device
  description (a `Q6411-LE` is bispectral; a row that only ever mentions
  1920×1080 doesn't say that).
- **Defer all 10 (chosen).** Seed nothing thermal or bispectral this pass;
  log them as a known gap, same treatment as the `TNB-9000` ceiling case in
  ADR 0121.

## Decision

None of the 10 thermal/bispectral models are seeded in this refresh. They are
logged in `axis_diff_report.md` and here as a deferred category, not silently
dropped or guessed into a shape nobody chose.

## Consequences

**Positive:** no `camera_specs` row ships with a fabricated or silently
incomplete resolution figure for a thermal product; the decision of whether
and how thermal streams factor into VSR storage sizing stays open rather than
being decided implicitly by whichever heuristic happened to run first.

**Negative:** none of the 7 Axis thermal models, `Q87`, or `Q6411-LE` appear
in the partner-facing camera picker; an integrator quoting one of these must
size it by hand. The same gap will recur for any future Hanwha/Avigilon
thermal or bispectral model.

**When to revisit:** when a partner requests a quote involving a thermal or
bispectral camera, or when someone decides how thermal channels should factor
into the storage/bandwidth math — at that point this ADR's scope cut is
superseded by whatever representation gets chosen.
