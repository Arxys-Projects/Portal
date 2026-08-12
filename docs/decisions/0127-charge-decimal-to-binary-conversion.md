# 0127 — Charge the decimal→binary conversion in sizing, and publish the "available" figure

- **Status**: Accepted. Closes item 3 of [#0092](./0092-raid-parity-and-decimal-tb.md), decided 2026-07-24 and never built.
- **Date**: 2026-08-12

## Context

The engine is decimal end-to-end (ADR 0092) and drives are sold decimal, which is
internally consistent and matches the price book. But a VMS sees **binary**
capacity on a **formatted** filesystem, and nothing in the chain ever charged that
loss. A quoted 720 TB delivered roughly 643 TB of VMS-visible space.

Partners were closing the gap by hand — "multiply net usable by 10% to get
approximate" — which is both a rough figure and evidence that the tool was leaving
a known step to the reader.

Milestone charges it explicitly, and the exact factor was reversed from two of its
own exported proposals and confirmed on both (audit §8):

- 1 × 4 TB Husky HE150D → "available 3.57 TB"
- 4 × Husky HE1000R (8 × 16 TB) → "85.73 TB per server available"

Both satisfy `available = RAID_net_decimal × 0.8931`, which decomposes as
`0.909495` (decimal TB → binary TiB, 10¹² / 2⁴⁰) × `0.9819` (formatting and
filesystem reserve allowance, ~1.81%). The parity arithmetic underneath it
(`usableCapacityTb(128, 8, "6") = 96`) matches Arxys's existing helper exactly.

## Options considered

- **Leave it to the partner** — status quo; a known, quantified step done by hand,
  differently each time.
- **Fold it into the utilization buffer** — one fewer factor, but conflates physics
  with a policy choice, and a partner lowering the slider would appear to change
  what a formatted disk holds.
- **Charge it separately in sizing, and publish the resulting figure per SKU.**

## Decision

**Charge `÷ 0.8931` in sizing, as its own step, and publish `available` alongside
the existing decimal net-usable figure per SKU.**

```
required_RAID_net_decimal = required_available / 0.8931
```

`AVAILABLE_CAPACITY_FACTOR` and `availableCapacityTb()` live in `capacity-utils.ts`
next to `usableCapacityTb()`, which stays exactly as it was — the decimal RAID-net
figure the Price Book publishes and the recommender sizes against. The new helper
is one step further down.

**This is physics, not buffer.** It is kept separate from ADR 0126's utilization
cap in both code and copy: one is what the hardware actually gives you, the other
is how full you choose to run it. Folding them together would make the slider look
like it changes disk geometry.

The `available` figure is published on:

- the **Price Book** SKU tables — `"400 TB (357.2 TB available)"`, so a partner can
  match a row against a Milestone proposal's "X TB of Y available" line;
- the **admin spec form's** net-usable preview, so an editor changing a spec row
  sees this move too;
- the **System Estimate PDF** capacity bar, as a note under total storage.

A unit test pins both Milestone proposal figures directly, so the comparison the
column exists to enable cannot silently break.

## Consequences

**Positive:** the quote finally covers what the VMS will actually see; a partner
can set an Arxys estimate beside a Milestone or Genetec proposal and compare the
same quantity without arithmetic; a hand step with a rule-of-thumb error bar is
gone; ADR 0092's open item is closed.

**Negative:** +11.97% on required capacity, on top of an overall Phase A reduction
— it is the single largest upward factor in the change. The 0.9819 formatting
allowance is empirical: it is what reproduces both Milestone proposals exactly, but
Milestone does not document what it comprises, so it is INHERITED rather than
derived. The Price Book cell is now two figures where it was one, which is more
text in a dense table.

**When to revisit:** if a filesystem change (or a different VMS with a different
reserve) moves the 0.9819 component measurably. The 0.909495 half is arithmetic
and will not change. If the price book cell proves too dense in the field, the
available figure could move to its own column rather than being dropped.
