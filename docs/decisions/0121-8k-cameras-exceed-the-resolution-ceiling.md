# 0121 — 8K cameras exceed the RESOLUTIONS ceiling; `TNB-9000` deferred

- **Status**: Accepted
- **Date**: 2026-08-11

## Context

The August 2026 Hanwha price list contains one true 8K network camera,
`TNB-9000`, whose official datasheet Resolution row reads `7680x4320` —
33,177,600 pixels on a single 36 mm CMOS imager.

The largest bucket in `RESOLUTIONS` (`tables.ts`) is `29MP (6576×4384)` =
28,829,184 pixels. Under ADR 0058's Option C round-up rule, `mapPixelsToBucket`
returns `null` for any camera above that ceiling rather than clamping it, and
`validate-camera-specs.ts` turns that null into a hard validation failure. ADR
0058 anticipated this case explicitly: an out-of-range pixel count "maps to no
bucket and is flagged for manual review rather than silently clamped."

`TNB-9000` is the first camera to actually hit the ceiling. The roster also
banded `TNO-A26081` as "8K", but its datasheet gives `6240x4160` (25.96MP), which
fits the 29MP bucket and seeded normally — so the ceiling problem is confined to
one model.

## Options considered

- **Clamp `TNB-9000` to the 29MP bucket.** One row, no schema change, but
  under-sizes storage for a 33MP camera by ~13% and violates the round-up rule
  that exists precisely to avoid under-provisioning. Rejected.
- **Add an 8K bucket to `RESOLUTIONS`.** Correct long-term, but `RESOLUTIONS`
  feeds the calculator's resolution dropdown for every vendor, so adding a tier
  changes a shared partner-facing control. Too broad to bundle into a seed
  refresh, and it needs its own bitrate validation.
- **Defer the model (chosen).** Seed the other 140 rows; leave `TNB-9000` out
  until a bucket exists to size it against.

## Decision

`TNB-9000` is not seeded. The other 140 rows from the August delta loaded
normally. The model is recorded here and in the JOURNAL as a known gap rather
than being clamped into a bucket that would under-size it.

The scope cut is one model out of 141, and it is the only Hanwha camera in the
active price list above 29MP.

## Consequences

**Positive:** no under-sized storage estimate ships; the shared `RESOLUTIONS`
table and the calculator dropdown are untouched by a seeding pass; ADR 0058's
round-up guarantee holds without exception.

**Negative:** an integrator specifying a `TNB-9000` finds nothing in the picker
and must size it by hand. Any future 8K Hanwha, Axis or Avigilon model hits the
same wall.

**When to revisit:** when a second 8K camera appears in any vendor's price list,
or when a partner asks for `TNB-9000`. The fix is to add an 8K tier
(`7680×4320`) to `RESOLUTIONS` with a validated bitrate, after which this row
seeds with no other change.
