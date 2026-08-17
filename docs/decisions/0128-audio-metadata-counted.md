# 0128 — Audio and analytics metadata are counted data, via a per-group toggle

- **Status**: **Superseded by [#0131](./0131-audio-metadata-reversed-into-the-buffer.md)** (2026-08-17). The toggle and its +5% were withdrawn entirely, from bandwidth and storage alike: audio and metadata are fixed kbit/s add-ons, not a percentage of video bitrate, so a flat percentage is wrong in both directions at once. A ~2% storage-only cushion went into the buffer default (90% → 88%) instead. The "when to revisit" note at the bottom of this ADR is what came true.
- **Date**: 2026-08-12

## Context

Audio and analytics-metadata streams were unmodeled anywhere in the calculator
path — grep-verified across the whole chain (audit §Q3). Magnitudes:

- **Audio** 24–64 kbit/s per camera = 0.6–3.2% of a 2–4 Mbit/s stream (Axis audio
  technote).
- **Analytics metadata** ~4–25 kbit/s (Bosch VCD spec) to 20–100 kbit/s (Axis
  ecosystem partner doc) = 0.5–5%.

Combined: **2–8% undercount wherever those streams record.** It went unnoticed
because the old ×1.44 margin stack absorbed it. With that stack replaced by a
single declared buffer (ADR 0126), an unmodeled stream is now a genuine gap rather
than a rounding inside someone else's cushion.

## Options considered

- **Keep absorbing it silently** — no longer possible without eating the declared
  buffer, which would make the stated margin a lie.
- **A blanket +5% on every group** — simplest, but wrong for the groups that
  genuinely record video and nothing else.
- **A per-group toggle** — accurate either way, one more control.
- Default **OFF** (only count it when asked) or **ON**.

## Decision

**A per-group "records audio / analytics metadata" toggle applying +5%, defaulting
ON.**

Default ON because the published Arxys VSR rating profile itself specifies "On
motion, VMD + metadata" (`LEDGER_VSR_PARAMETERS`) — metadata is part of the profile
the appliances were rated against, so ON is the configuration the hardware numbers
already assume.

**Applied to the stream rate, not to storage alone.** Audio and metadata ride the
same network as the video, so the uplift reaches bitrate, bandwidth and storage
identically. This preserves the storage↔bandwidth identity the audit verified to
15 digits (§C4). Applying it to storage only would have created exactly the kind
of quiet inconsistency between two outputs of the same function that §C4 exists to
document.

*(Note: the Phase 2 plan's stack diagram shows this term in the storage chain,
because that diagram is about the buffer and does not depict bandwidth at all —
D7 handles bandwidth separately. Treating it as a stream-rate adder is the reading
that keeps the two consistent. Flagged for Andy at review.)*

**This is counted data, not a second buffer.** No other margin may be stacked
alongside it, and it is deliberately named for what it counts rather than for the
cushion it happens to provide.

## Consequences

**Positive:** the estimate covers what is actually written for the great majority
of deployments; a genuinely video-only group can now be sized accurately instead of
carrying an adder it does not need; bitrate, bandwidth and storage stay mutually
consistent.

**Negative:** +5% on nearly every group, partly offsetting Phase A's reductions.
5% is a single figure across a measured 2–8% range, so it over-counts a
camera with metadata but no audio and under-counts one recording high-bitrate audio
plus rich analytics. It is one more checkbox on an already dense group card, and a
partner who leaves it ticked without thinking gets the conservative answer — which
is the intended failure mode.

**When to revisit:** if per-stream measurement on real deployments justifies
splitting audio from metadata, or making the figure vary with resolution (it is a
roughly fixed kbit/s in reality, so its *percentage* is larger on low-bitrate
streams than on high ones — a flat 5% under-counts 720p and over-counts 4K).
