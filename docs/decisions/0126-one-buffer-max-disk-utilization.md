# 0126 — One buffer: a Max disk utilization cap replaces both ×1.2 constants

- **Status**: Accepted. Supersedes the `STORAGE_FLOOR` half of [#0068](./0068-storage-first-sizing-and-vsr-camera-check.md) and retires `STORAGE_OVERHEAD`.
- **Date**: 2026-08-12

## Context

The engine carried two ×1.2 constants in two files:

- `STORAGE_OVERHEAD` (`tables.ts`) — "database, indexes, filesystem", inherited
  from the legacy calculator's `OH=1.20`, unsourced.
- `STORAGE_FLOOR` (`algorithm.ts`) — hardware headroom, in-house policy (ADR 0068).

ADR 0068 stated they were distinct. That is true *by intent*, but the audit found
both were partly margin against the same estimate uncertainty, and together they
were **×1.44 with neither ever stated to the user** (§C5). Add the +4.07% bitrate
bias and the stack reached **×1.499 over accurately modeled video** — a number
that appeared nowhere, in no document, and that nobody had ever multiplied out.

No VMS documents anything near a 20% database/filesystem overhead. Documented
analogs top out far lower: Milestone's AWS calculator uses a 5% archive margin,
Nx/WAVE ~10% free space, Exacq ≤85% fill, ext4 5%. Real DB + index + filesystem
cost is ≤10%; the rest was scene-estimate risk wearing a database-overhead label.

Meanwhile both reference tools expose the margin as a visible knob. Milestone's
Solution Designer has **Max. Disk Utilization**, defaulting to 90% on auto-select
(70% with a specific Husky model). Genetec Security Center applies **10%,
partner-adjustable 10–30%** — read off multiple partner-supplied proposals.

## Options considered

- **Keep 1.2 but relabel honestly** — free, still invisible, still ×1.44.
- **Drop `STORAGE_OVERHEAD` to a documented 1.05–1.10, keep `STORAGE_FLOOR`** —
  better sourced, but the margin stays split across two files and unstated.
- **One user-visible cap replacing both** — comparable to the tools partners quote
  against, and the whole margin becomes one number.
- Semantics: **additive** (×1.10) or **a utilization cap** (÷0.90).
- Default: 80% (the midpoint, more cushion) or 90% (matching both reference tools).

## Decision

**Delete both constants. Replace with one per-project Max disk utilization slider,
60–90%, defaulting to 90%.**

```
required_available_capacity = required_recorded_data / (utilization / 100)
```

**The semantics are a cap, not an additive margin.** 90% → ÷0.90 = ×1.111. It is
**not** ×1.10. Getting this backwards would quietly under-size every quote.

Labeled **"Max disk utilization"** exactly as Milestone labels it, so the number is
directly comparable against a Milestone or Genetec proposal set beside it — which
is the point of the change, not a side effect.

**The default sits at the floor of the range deliberately.** Every adjustment a
user can make adds margin, never removes it. The slider is one-directional by
construction, so a partner cannot make a quote more aggressive than the default,
only more cautious.

Applied **per group** inside `computeGroup` rather than once at the total, so the
storage column on every table and PDF still sums to the project total. Both steps
are scalar, so allocating them per group is exact.

`VSR_FLOOR` (×1.1) **stays**. It is the camera dimension, has no storage effect,
and the audit found no double count against it.

**Quick Calc pins 80%, not the 90% default.** It is a fixed standard (ADR 0082)
and does not expose the slider, so it needs a pinned value; Andy set it one notch
more conservative because Quick Calc takes a stream count and a retention period
and nothing else, carrying far more scene uncertainty than a configured
multi-group project. Note this is `÷0.80 = ×1.25`, slightly **more** cushion than
the `STORAGE_OVERHEAD = 1.2` it replaces there — no utilization value reproduces
×1.20 exactly (it would be 83.33%), and chasing it would put an off-scale number
in the UI for no benefit. One exported constant,
`QUICK_CALC_UTILIZATION_PCT`, is read by both the preview and the save path, so
the two can never diverge.

`submissions.storage_tb` **changes meaning**: it now banks required decimal
RAID-net capacity, buffer and binary charge (ADR 0127) included. Already-issued
documents are safe — the audit swept for this explicitly (§Q7) and nothing
downstream recomputes — but the column stops being comparable across the boundary.
So **`calc_version` is added to `submissions`; existing rows are version 1**, and
`max_disk_utilization_pct` is deliberately **not backfilled**: no single value
reproduces the old ×1.44 under the new semantics, so a backfill would be an
invention. NULL renders as *not recorded*, never as today's default.

## Consequences

**Positive:** the entire storage-side margin is one number the partner picks, sees,
and can compare against a competing proposal. `storageGb / rawStorageGb` is a flat
**×1.306** for every deal shape — the buffer is auditable at a glance instead of
being reverse-engineered out of three files. Quotes line up with the tool partners
set beside them.

**Negative:** ×1.499 → ×1.306 is a real reduction in cushion, arriving when drive
prices have roughly doubled — deals near a SKU boundary will flip down (the
canonical fixture drops one tier, −$14,656). Partners can now make a quote larger
but never smaller than default, which is safe but means the slider will mostly sit
untouched. A per-project cap cannot express "more cushion on the NVR that also runs
analytics"; that would need per-group buffers, which is more knob than the evidence
justifies.

**When to revisit:** if field data shows deals routinely running above the chosen
cap, the default moves rather than a second constant reappearing. If Milestone or
Genetec change their own defaults, this should follow — matching them is the
stated purpose. Any proposal to add a second storage multiplier anywhere in the
stack should be read as a regression of this ADR.
