# 0092 — "Net Usable Capacity": canonical definition, and the RAID 60 parity fix

- **Status**: Accepted
- **Date**: 2026-07-24

## Context

The Phase 0 spec audit ([`datasheets/spec-source-audit-phase0.md`](../../datasheets/spec-source-audit-phase0.md))
found that net-usable storage was produced two different ways and disagreed for 8 of 21 rack SKUs.
The Price Book renders hand-typed strings from `families.ts` `skuExtraData`, which
[`cell-value.ts`](../../src/lib/price-book/cell-value.ts) treats as authoritative *over* the computed
value; the Calculator, System Estimate PDF, and Project Quote all use `usableCapacityTb()` instead.

Investigating the disagreement uncovered a bug rather than a data-entry problem.
`usableCapacityTb()` charged RAID 60 a flat 4 parity drives. That is correct only at 24 drives. The
authoritative hardware rules (confirmed 2026-07-24) are: **no hot spares on any model**; V200 is
RAID 5; V400/V500/V600 are RAID 6; V700 and V800 are RAID 60 built from **12-drive RAID 6 stripes**.
The V800 has 36 drives — three spans, so **six** parity drives, not four.

Because `VX5-V800-720` sits in the Calculator's live candidate pool, the Calculator was sizing it at
640 TB usable against an actual 600 TB. The stated requirement for the recommender is that it must
never under-spec, so a 6.7% overstatement on the flagship SKU was a direct correctness failure: a
project sized at 620 TB was told a single V800-720 would hold it.

Separately, the term "Net Usable Capacity" was never defined anywhere — not in the code, not on
documents — despite appearing on the Price Book, the System Estimate PDF, the Project Quote, and the
Customer Proposal.

## Options considered

**RAID 60 parity**
- Span-derived parity, `2 × (n / 12)` — matches the hardware; one formula covers V700 and V800.
- Per-model lookup table — explicit, but a new table to maintain and it drifts from `hdd_count`.
- Store the parity drive count as a column — most flexible, but adds a column with no write path
  (the audit found 26 such columns already).

**V100 net-usable** (2 drives, sold "RAID 1 or JBOD")
- Publish both figures — accurate for a configurable box.
- Publish RAID 1 only (16/20/24 TB) — conservative, consistent with never-under-spec.
- Publish JBOD only (32/40/48 TB) — matches what the Price Book shows today for two of three tiers.

**Capacity units on documents**
- Decimal TB with an explicit label — industry convention, matches drive nameplate.
- Publish decimal TB *and* approximate binary TiB — pre-empts the "Windows shows less" support call.
- Switch the headline to binary TiB — most honest from the customer's seat, but ~9% smaller than how
  every competitor quotes.

## Decision

**1. Net Usable Capacity is raw HDD nameplate capacity less RAID parity overhead, with no hot
spares**, computed as:

| RAID level | Parity drives | Usable |
|---|---|---|
| 5 | 1 | `raw × (n−1)/n` |
| 6 | 2 | `raw × (n−2)/n` |
| 60 (12-drive spans) | `2 × (n/12)` | `raw × (n − 2×(n/12))/n`, which reduces to **`raw × 5/6`** |

Per model: V200 `× 3/4`; V400 `× 6/8`; V500 `× 10/12`; V600 `× 14/16`; V700 and V800 `× 5/6`.
Implemented in [`capacity-utils.ts`](../../src/lib/capacity-utils.ts) with `RAID60_SPAN_DRIVES = 12`.

**2. The V100 publishes both configurations** — RAID 1 mirrored (16/20/24 TB) and JBOD/spanned
(32/40/48 TB) — because the unit ships configurable and a single figure would misrepresent one of
the two. The currently published 36 TB for `VX5-V100-32` is wrong under either reading and is
withdrawn.

**3. Documents publish both decimal TB and the approximate binary figure.** The pipeline is decimal
throughout (`GB_PER_TB = 1000`), so the computed number is post-RAID decimal TB, pre-format. The
OS-visible binary figure is roughly 9.1% lower (a 600 TB array shows as ~545 TiB). Both appear so the
published number and what the customer sees in Windows can be reconciled without a support call.

**4. Landing sequence.** Shipping now: the parity formula, the two `families.ts` typos
(`VX5-V400-192` 132→144, `VX5-V700-384` 316→320), the test expectations that encoded the old parity,
and the V100 dual-publish strings (item 2) — the last of these because it removes a customer-facing
figure that is wrong under either RAID reading, and it fits inside the existing `skuExtraData`
override with no new rendering. Item 3 (the decimal/binary pair) is deferred to the document phase:
it touches the PDF pipeline and needs a footnote pattern rather than a string change.

The V100 strings deliberately stay as `skuExtraData` overrides rather than becoming computed values.
`usableCapacityTb()` takes a single RAID level and cannot express "either of two configurations", so
a configurable unit is exactly the case the override path exists for. When the override path is
retired during unification (§4 of the audit's open items), the V100 needs a modelled answer — two
columns, or a nullable "alternate configuration" field — not a deletion.

## Consequences

**Positive:** one formula, matching the hardware, for every consumer. The Calculator stops
over-crediting V800 capacity, closing the only place it silently under-specced. The Price Book, PDFs,
and Calculator now agree on 18 of 21 rack SKUs (the 3 V100 rows pending item 2). `families.ts`
storage overrides become redundant for rack SKUs, so the
override-beats-computed path in `cell-value.ts` can retire during unification — the `ssdStorage`
overrides for management/ACM SKUs still need a home, as those have no `product_specs` row to compute
from.

**Negative:** every V800 quote and PDF now reports 6.7% less usable capacity than before. That is
the correct number, but it is a visible drop on the flagship SKU and anyone comparing a new quote to
an old one will see it — worth a heads-up to sales rather than letting it surface in a customer
conversation. Some projects previously sized to a single V800 will now size to two, changing the
price. The V100 cells now carry a two-value string ("16 TB RAID 1 / 32 TB JBOD") in a right-aligned
numeric column, which is wider than any other cell in that table and may wrap on narrow viewports —
acceptable in exchange for not publishing a wrong number, but a candidate for a dedicated
two-line treatment when the datasheet templates are built. Item 3 means the published figure still
does not reconcile with what Windows reports until the document phase lands.

**When to revisit:** if a model ships with a RAID 60 span width other than 12 drives (the constant is
named for exactly this), if hot spares are ever introduced, if a RAID level outside 5/6/60 appears,
or if the decimal-versus-binary presentation proves confusing in the field.
