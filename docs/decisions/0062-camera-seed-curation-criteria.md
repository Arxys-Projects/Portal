# 0062 — Camera seed curation criteria (native pixels, shipping, fixed-sensor)

- **Status**: Accepted
- **Date**: 2026-06-15

## Context

Phase 10 Step 2 loads the first vendor camera library (Axis) into `camera_specs`. The acquisition plan (Phase 10 journal entry) set the broad rules: vendor-primary sources, fixed-sensor only, currently-shipping only. Building the Axis seed surfaced concrete curation questions that will recur for the Hanwha and Avigilon seeds, so the criteria are pinned here as one reusable standard. The data feeds storage sizing, so a wrong sensor count or resolution becomes a wrong customer quote; accuracy outranks coverage.

## Options considered

- **Ingest a vendor model list at face value (e.g. an LLM-generated catalog).** Fast, but such lists quote marketing megapixels, not native pixels, and include discontinued or mis-specced rows. Rejected as a source of truth; usable only as a candidate inventory.
- **Store marketing MP and derive pixels.** A single MP tier maps to multiple native resolutions (4MP can be 2688x1512 or 2560x1440), so derivation guesses. Rejected.
- **Datasheet-verified native pixels per model, with explicit inclusion/exclusion rules (chosen).**

## Decision

Every seed row is verified against the vendor's own datasheet or product page, and `max_width` x `max_height` is the native pixel resolution of the highest-MP sensor read from that page, never a marketing MP value converted to pixels. `source_url` and `as_of_date` are recorded per row. Curation rules:

- **Currently-shipping only.** Models the vendor marks discontinued/EOL/replaced are dropped (e.g. the Axis P3265/P3267/P3268-LVE were dropped in favour of their P3275/P3285 successors).
- **Fixed-sensor only.** Fixed multidirectional/multisensor models are included with their true `sensor_count` and sized at the highest-MP sensor per ADR 0058 (e.g. AXIS P3737-PLE, 4 sensors). Configurable/modular-sensor platforms are excluded.
- **Per-sensor pixels must be published.** A model whose datasheet gives only a stitched/combined panorama resolution and no per-sensor native pixels is dropped, because honest sizing needs the single-sensor figure (e.g. AXIS P3827-PVE dropped).
- **Phase-1 exclusions: thermal and PTZ/broadcast.** Thermal sensors (e.g. 384x288) and PTZ/broadcast cameras validate against the schema but do not fit resolution-bucket storage sizing the way fixed cameras do, so they are excluded from the phase-1 library. This is a reviewed scope choice, not a schema limit; they can be added later via an idempotent re-load.

A candidate seed is always presented for human review before the admin load (the load is gated by `validate-camera-specs.ts` and a typed CONFIRM, and is idempotent on the `(vendor, model)` key).

## Consequences

**Positive:** the library carries datasheet-grounded native resolutions with provenance per row; sizing is honest; the same criteria apply cleanly to Hanwha and Avigilon. Re-loads are safe and diff-only.

**Negative:** coverage is narrower than a raw vendor catalog (Axis phase-1 seed is 26 fixed cameras, not the full portfolio); thermal/PTZ are absent until a later pass; verification is manual per model, so each vendor seed is real research effort.

**When to revisit:** when thermal or PTZ sizing is wanted in the calculator, or when a vendor publishes a structured spec feed that removes the need for per-model datasheet verification.
