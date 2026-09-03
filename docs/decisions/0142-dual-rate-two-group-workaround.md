# 0142 — Dual-rate recording profiles as two motion-triggered groups, until a real control exists

- **Status**: Accepted. Amends nothing; works around the gap ADR 0125 already named as a
  future item ("Milestone's Speedup mode... would need its own control").
- **Date**: 2026-08-26

## Context

The Travis AFB dorm camera RFQ specifies a dual-rate recording profile: continuous
recording that never stops, at a 5fps baseline, rising to 15fps during motion events. The
calculator's `GroupInput` (`compute.ts:338-354`) has exactly one `fps` field and a two-mode
`recordingMode: "constant" | "motion"` — confirmed by Phase 0 research (see
[`travis-afb-phase0-findings.md`](../../travis-afb-phase0-findings.md), Q2) to be a
deliberate XOR, not an oversight. There is no way to express "always recording, but at two
different rates" in one group today.

Two submissions (Projects 1 and 2, funded-base primary and failover) needed to be built now,
ahead of any decision on whether to build the real dual-rate control (scoped in the Phase 0
findings at ~14 source + ~9 test files, no migration).

## Options considered

- **Wait for the real control before quoting.** Correct long-term, but blocks a live federal
  RFQ on an engineering task with no committed timeline.
- **Approximate with a single blended continuous fps** (e.g. 10fps for 50% motion). Rejected
  per the Phase 0 Q1 finding: motion% is a pure recording-duty-cycle scalar that never
  touches bitrate in this engine (ADR 0125), so a blended-fps group under-states the true
  event-peak bandwidth by 31–50%, not a rounding-sized error.
- **Two motion-triggered groups per physical camera population** — a baseline group at 5fps
  with `motionPercent = 100 − m`, and an event group at 15fps with `motionPercent = m`.
  Chosen.

## Decision

Model each dual-rate camera population as **two calculator groups**, both `recordingMode:
"motion"`:

```
baseline group:  fps = 5,  motionPercent = 100 − m
event group:     fps = 15, motionPercent = m
```

Storage sums to the mathematically exact answer this way — `dutyCycle()` is a linear scalar
on the storage product, so `(100−m)% at 5fps + m% at 15fps` sums correctly with no
approximation. **This is the one thing the workaround gets exactly right, unconditionally.**

Two things it does **not** get right, and neither self-corrects — both are visible on every
submission built this way and must be read past, not trusted at face value:

1. **Total bandwidth double-counts.** The submission detail page's own "Network Sizing"
   figure (e.g. Project 1's 756.32 Mbit/s) sums *all six* groups' peak bandwidth, but a
   physical camera is in its baseline state or its event state, never both — the true
   network figure is the sum of the **event groups only** (Project 1: 163.25 + 308.36 +
   79.62 = **551.23 Mbit/s**, not 756.32). The page's own copy — "size switches and uplinks
   for at least this much" — is wrong by construction for a workaround submission and must
   be manually corrected before this number reaches an integrator.
2. **Total camera count and VSR load double-count.** The displayed camera count (172) is
   twice the true physical population (86), because each camera is represented by two
   groups. The recommendation engine's soft VSR floor (`units_for_vsr`, ADR 0068, ×1.1) is
   therefore computed against a doubled load. For both Travis AFB submissions this did not
   change the recommended SKU — storage sizing (`units_for_storage`, HARD ×1.2) dominated in
   both cases, as it does for essentially all storage-heavy deals — but this was **confirmed
   by inspecting the actual recommendation, not proven in general**. A future workaround
   submission where camera count is the binding constraint (very high camera count, modest
   storage) could recommend more hardware than actually needed.

Neither distortion is flagged anywhere in the UI. Anyone reading a workaround-built
submission — including a future Claude Code session — needs to know to discount the
displayed camera count and bandwidth figure, and trust only the storage figure and the final
recommended SKU (after confirming, as done here, that storage was in fact binding).

## Consequences

**Positive:** unblocks quoting a dual-rate profile today with exactly correct storage sizing
and no schema/migration risk. Reversible — once a real dual-rate control exists, these
submissions can be recreated correctly with no data-model cleanup required (the six-group
shape is just camera groups, not a schema extension).

**Negative:** every workaround submission carries two numbers (camera count, bandwidth) that
read as authoritative but are not, with no in-product warning. A partner-facing document
generated from one of these submissions (System Estimate, Project Quote PDF) will print the
inflated bandwidth figure verbatim unless someone manually overrides it — **this has not
been checked against the PDF templates and should be verified before either document ships
externally.**

**When to revisit:** as soon as the real dual-rate control (P1 in the Phase 0 findings) is
built — recreate Projects 1 and 2 with it and retire the two-group shape. Also revisit
immediately if a future workaround deal's camera count (not storage) looks likely to bind
the recommendation — the VSR doubling is unverified in that regime.
