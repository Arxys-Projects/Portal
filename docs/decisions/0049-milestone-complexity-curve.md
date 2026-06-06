# 0049 — Milestone complexity curve + codec damping over a vendor blend; six descriptive scene levels

- **Status**: Accepted
- **Date**: 2026-06-05

## Context

The calculator is an **agnostic bridge**: it must produce defensible storage/
bandwidth numbers for any VMS and any camera, not match one vendor exactly. The
"complexity" knob multiplies frame bitrate to model how busy/detailed a scene
is. Two reference vendors quantify this very differently:

- **Milestone** uses a steep encoder-bitrate "complexity" coefficient — roughly
  5× from floor to High.
- **Avigilon** ties it to camera "scene type" and spans only ~2.86× across all
  six of its levels (its measured top step is ×1.25 → ~6.25× cumulative).

The old table used three vague levels (`Low (office) 0.5`, `Medium (retail) 1.0`,
`High (outdoor) 1.5`) — both too coarse and anchored to nothing verifiable.
Users also guess wrong on abstract Low/Medium/High adjectives.

## Options considered

- **Blend Milestone + Avigilon curves** — averages two sources, so the result
  anchors to *neither* verified curve and can't be defended against either tool.
- **Adopt Avigilon's flatter camera-tied curve** — matches modern smart cameras
  but under-sizes against conservative VMS defaults and isn't what Milestone (a
  common partner VMS) would quote.
- **Adopt Milestone's steeper curve as the conservative bound, six descriptive
  levels, and model smart-camera flattening via the codec selector** — uses one
  verifiable source for the curve and a second independent knob (codec) for
  compression behavior.

## Decision

Adopt **Milestone's steeper complexity curve as the conservative upper bound**,
expressed as six descriptive scene levels (multipliers 1.0 / 1.5 / 2.25 / 3.375
/ 5.0 / 7.0). The smart-compression damping that flattens real cameras is
modeled by the **codec selector** (`CODEC_BITRATE.smart`), not by blending
curves. Labels are concrete example scenes (Avigilon-style — "Reception,
stairway, hallway, garages" etc.) so users pick by recognizing their site, not
by interpreting an adjective. The top sixth rung (×7.0) is an
edge-case-protection extrapolation above Avigilon's measured ~6.25×, rounded up
for headroom on the rarest, most-demanding scenes, consistent with the
never-skin-of-the-teeth sizing bias. The scalar `complexity` column keeps the
coarse `tier` (low/med/high) for legacy readers; the full level round-trips via
a banked `complexityLabel` (see JOURNAL 2026-06-05).

## Consequences

**Positive:** Numbers are traceable to one verified vendor curve (audited live —
see [0050](./0050-codec-bitrate-reanchor.md)). Six concrete scenes remove the
adjective-guessing problem. Codec and complexity stay orthogonal, so smart-codec
flattening is a deliberate user choice, not baked into the curve.

**Negative:** The curve is steeper than a modern smart camera actually produces,
so H.265/H.264 (non-smart) selections size conservatively high. That is the
intended bias for a planning tool, but it can over-quote storage if a partner
forgets to pick the Smart codec for a smart camera.

**When to revisit:** If the agnostic-bridge stance is dropped in favor of
matching a specific VMS's published calculator, re-derive the multipliers from
that tool and reconsider whether codec damping should fold into the curve.
