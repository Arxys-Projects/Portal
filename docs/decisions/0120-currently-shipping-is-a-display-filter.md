# 0120 — `currently_shipping` is a display filter, so EOL annotation is deferred

- **Status**: Accepted
- **Date**: 2026-08-11

## Context

The August 2026 Hanwha price list retires five models that are already seeded in
`camera_specs`: `PNM-7002VD`, `PNM-9020V`, `PNM-9022V`, `PNM-9322VQP` and
`TNV-8010C`. The plan for the refresh pass was to set `currently_shipping = false`
on those rows and record the replacement SKU, treating the flag as provenance —
a marker that a model is no longer orderable from Hanwha, not a soft delete.
Partners still run discontinued cameras and still need to size storage for them,
so the models had to stay selectable in the calculator.

That plan assumed `currently_shipping` gates only the seed loader. It does not.
`search_camera_specs` (`20260616000001_phase10_camera_search_rpc.sql:38`) has
`and cs.currently_shipping` in its WHERE clause, and that RPC is the *only* read
path behind the partner-facing camera picker: `CameraModelPicker`
(`calculator-form.tsx:1280`) → `searchCameraModels` (`actions.ts:698`) → the RPC.
The migration's own header comment states the intent plainly: *"currently_shipping
is filtered out so retired models can be re-seeded without surfacing in the
picker."* The flag is a display filter.

Flipping it on the five EOL rows would therefore have removed them from the
picker — the exact outcome that was ruled out. The discovery also surfaced a
pre-existing instance of the same problem: `PNM-9020V` already carries
`currently_shipping = false` in production, so it is already unselectable.

## Options considered

- **Drop `and cs.currently_shipping` from the RPC, then flip the flags.** Makes
  the flag pure provenance as originally intended and un-hides `PNM-9020V`, but
  changes partner-facing query behaviour in the same pass as a 140-row data load,
  mixing a schema change into a seed refresh.
- **Flip the flags anyway.** Accurate provenance, but silently removes five
  models integrators may still be sizing. Rejected.
- **Record EOL in `sensor_detail` notes only.** Keeps models visible and records
  status where nothing queries it, but writes to existing rows for a field no
  consumer reads.
- **Defer EOL annotation entirely (chosen).** Add new rows only; leave every
  existing row and every flag exactly as-is.

## Decision

EOL annotation is deferred out of this pass. The refresh added new rows only. No
existing row was modified for EOL purposes, no `currently_shipping` value was
changed, and nothing was deleted — all 53 previously seeded Hanwha rows, EOL or
not, remain present and selectable.

`currently_shipping` is documented here as a **display filter**, not provenance.
Any future use of it must account for the picker consequence.

## Consequences

**Positive:** zero regression risk to the partner picker; the five EOL models stay
selectable for partners still running them; the semantics of the flag are now
written down rather than inferred from an ADR note.

**Negative:** the table carries no EOL signal at all, so the August retirements
live only in this ADR and the JOURNAL. `PNM-9020V` remains hidden from the picker
— a known, pre-existing defect this pass deliberately did not fix.

**When to revisit:** when EOL status needs to be visible in the product. That
work should start by removing the RPC filter (making the flag safe to set), then
backfill the flag and replacement SKUs in one pass. Fixing `PNM-9020V` is the
smallest useful first step.
