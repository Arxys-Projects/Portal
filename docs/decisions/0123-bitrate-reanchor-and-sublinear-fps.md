# 0123 — Re-anchor the bitrate engine to Milestone's decimal figure, with a sub-linear fps curve

- **Status**: Accepted. Amends [#0050](./0050-codec-bitrate-reanchor.md) (codec anchor) and [#0049](./0049-milestone-complexity-curve.md) (complexity curve, unchanged but re-stated in decimal).
- **Date**: 2026-08-12

## Context

ADR 0050 anchored `CODEC_BITRATE.h265 = 0.037` against a live audit of Milestone's
XProtect calculator, documenting a deliberate +1.63% rounding. The 2026-08 math
audit found the match was made in **binary Kbit** against a figure Milestone
reports in **decimal** — verified twice, from the archived XSD bundle
(`bitPerSec: 2702e3` for a displayed "2702 Kbit/Sec") and again from the live
Solution Designer client (`toDataFlowFromKilobitsPerSecond` = `value × 1000`).

So at the reference point the engine billed **2,046 decimal kbit/s where Milestone
says 1,966**: +1.63% documented, plus **+2.44% nobody chose** (audit §C4). The
docs claimed one number and the engine did another.

Separately, the engine multiplied storage and bandwidth by `fps` — exponent 1.0.
Milestone's own tool does not: a 10/12/15/18 fps sweep measured **b ≈ 0.90**,
reproduced on three complexity tiers (audit §8). Measured encoder *emission*
supports a lower 0.6–0.77 (IPVM 0.57–0.59, Ma et al. ~0.77 for IPPP), which would
quote larger still.

Phase A's governing principle is one deliberate buffer and accurate math
everywhere else. An unintended +2.44% is neither.

## Options considered

- **Bless the +4.07%** and rewrite the ADR to call it intentional headroom — free,
  but relabels an arithmetic error as a decision and leaves the anchor unfalsifiable.
- **Fix only the unit slip** (−2.44%) and keep the +1.63% rounding — smaller diff,
  but keeps a rounding that no longer has a reason now that the buffer is explicit.
- **Full re-anchor** so the engine bills exactly 1,966 decimal kbit/s — the buffer
  slider becomes the only declared margin, and every figure traces to a live source.
- fps: **keep linear** (matches installer CBR-config practice, errs low only 5–9%
  in the 12–15 fps band the old margins absorbed) — but those margins are gone.
- fps: **b ≈ 0.6–0.77** (measured emission) — better physics, breaks parity with
  the tool the whole table is anchored to.
- fps: **b = 0.90** — what preserves Milestone parity.

## Decision

**Full re-anchor, in decimal, with an anchor-preserving fps exponent of 0.90.**

```
h265      = 1_966_000 / (2560 × 1440 × 15) = 0.0355487
h264      = h265 × 1.724                    = 0.0612860
h265smart = h265 × 0.80                     = 0.0284390   (ADR 0124)
```

The coefficient is **derived from the anchor in code**, not hardcoded, so the
reference point reproduces exactly and the anchor is the single source of truth.

**H.264 : H.265 = 1.724**, the live MSD measurement (2774/1609 at Low/12 fps),
not the legacy inherited 1.714 whose 0.12/0.07 ratio traces to the unsourced
legacy calculator. Since the table is anchored to Milestone, the ratio comes from
Milestone. *Confirmed with Andy 2026-08-12.*

The fps curve is **anchor-preserving** and this form is load bearing:

```
effective_fps = 15 × (fps / 15) ^ 0.90
```

A raw `fps ^ 0.9` would bill 15 fps as 11.6 and destroy the calibration. 15 fps is
unchanged; 12 fps bills 12.2756 (+2.30%).

**4MP stays 2560×1440.** MSD's own "4MP" bucket has moved to 2592×1520, but the
published Arxys VSR stream ratings are defined at 2560×1440 — adopting MSD's
bucket would desync the camera floor's rating basis from the storage math.
Documented in `tables.ts`, deliberately not adopted.

The `compute.test.ts` gate now asserts **decimal** kbit/s (1966 / 2950 / 4424 /
6637 / 9832) using the same expression the engine bills on, plus two independent
checks the coefficients were not fitted to: Milestone's 1609 (H.265) and 2774
(H.264) at Low/12 fps, which the anchor + b=0.90 + the 1.724 ratio reproduce to
within 0.05%.

## Consequences

**Positive:** every bitrate figure traces to a live, re-auditable source; the gate
measures what the engine bills rather than a parallel expression; the fps control
stops under-sizing the 12 fps deals that are most of the book; the anchor
reproduces to 0.00%.

**Negative:** −3.9% on all storage, which lands at a moment when drive prices have
roughly doubled. Sub-15 fps deals move up (+2.3% at 12 fps, +4.1% at 10, +17.5% at
5), so the two partly cancel and no deal moves by the headline figure alone.
b=0.90 tracks the anchor tool, not measured emission — if the goal ever shifts
from Milestone parity to physical accuracy, 0.6–0.77 is the range and it quotes
larger.

**When to revisit:** if Milestone Solution Designer's own coefficients move (it
replaced XProtect Designer in July 2026 and the values survived intact); if the
VSR ratings are ever re-established at MSD's 2592×1520 bucket, which would reopen
the 4MP question; or if a bench measurement of Arxys hardware gives a better fps
exponent than either vendor figure.
