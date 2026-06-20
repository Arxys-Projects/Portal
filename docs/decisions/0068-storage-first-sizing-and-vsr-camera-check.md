# 0068 — Storage-first sizing on net-usable capacity + VSR camera check

- **Status**: Proposed
- **Date**: 2026-06-19

## Context

A real deal needing **1,764.3 TB net-usable** storage and **332 cameras** was
recommended **4 × VX5-V700-480**, and the System Estimate printed
"1,764.3 TB of 1,600.0 TB usable · System utilization 110% · 20% headroom built
in" — an over-capacity system presented as valid, with a **false** headroom
claim.

Root cause: the recommendation engine ([`src/lib/recommend/algorithm.ts`](../../src/lib/recommend/algorithm.ts),
ADR 0032) sized storage against the **raw nameplate** `products.max_storage_tb`
(480 TB/unit → `ceil(1764.3/480)=4`), while every capacity bar divides by the
**RAID net-usable** figure from `product_specs` (`usableCapacityTb()`, ADR 0047
— V700 is RAID 60, 24 drives → 400 TB usable/unit → 4×400 = 1,600 < 1,764.3).
Raw said "fits"; usable said "doesn't." Storage never actually bound the choice,
and the "20% headroom built in" string was a hardcoded display literal, not an
enforced or computed value.

Separately, the camera dimension was gated on a raw stream count vs a per-unit
`max_cameras` that is defined in VSR-reference terms (4MP @ 15fps reference
stream), so a high-resolution schedule was under-counted against capacity.

Constraints: `max_cameras` (VSR-referenced) and the net-usable inputs
(`storage_raw_tb`, `hdd_count`, `raid_level_display`) already exist — **no
schema, seed, or migration change**. The change alters what NEW quotes
recommend; old project-quote snapshots render their frozen recommendation
unchanged (ADR 0061).

## Options considered

- **Size storage against net-usable, keep camera-count gate** — fixes the
  over-capacity bug but leaves high-resolution schedules mis-gated. Half a fix.
- **Add a fixed headroom multiplier to the existing raw-storage rule** — still
  divides by raw; the displayed usable denominator would keep disagreeing.
- **Storage-first on net-usable (×1.2 hard floor) + VSR camera check (×1.1 soft
  floor), cheapest valid config across the whole catalog** — fixes both, makes
  the capacity line honest by construction. Chosen.

## Decision

Two-floor, storage-priority sizing. For each numeric SKU:

- **Step 1 — storage (HARD, ×1.2), on net-usable per unit:**
  `units_for_storage = ceil(neededUsableTb × 1.2 / usableStorageTb)`
- **Step 2 — VSR camera check (SOFT, ×1.1):**
  `units_for_vsr = ceil(totalVsr × 1.1 / maxCameras)`, where
  `totalVsr = Σ streamCount × (megapixels / 4)` (resolution-normalized only — no
  fps/codec/motion/retention; EPYC 9005 makes fps a non-factor in range).
- `units = max(1, units_for_storage, units_for_vsr)`; the cheapest `(model × N)`
  across the catalog wins — no compute-tier lock, so a larger-storage SKU is
  selected whenever it clears both floors more cheaply.

`coveredStorageTb` is now net-usable (`units × usableStorageTb`), matching every
capacity-bar denominator. The hardcoded "20% headroom built in" note is replaced
by `utilizationNote()`: actual headroom at ≤100% ("18% headroom"), "OVER
CAPACITY" above 100%. A disclaimer header — "Possible system based on
parameters. Arxys engineering will send a detailed quote…" — is added to the
calculator recommendation panel and the System Estimate recommended-system
block.

1.1 is the only camera margin; 1.2 is a hardware-headroom margin distinct from
the calculator's `STORAGE_OVERHEAD` (already baked into `neededUsableTb`) — no
double-counting.

## Consequences

**Positive:** Recommendations can no longer ship over-capacity; the capacity
line never asserts headroom that doesn't exist; storage genuinely drives SKU and
unit selection; the camera check reflects resolution. The failing deal now sizes
4 × VX5-V800-720 (2,560 TB usable, 68.9% utilization).

**Negative:** New quotes are larger/pricier than before for storage-heavy deals
(the previous numbers were wrong, but the change is visible). The engine now
joins `product_specs` per recommendation. Several `algorithm.test.ts`
expectations changed because the algorithm legitimately picks different configs.

**When to revisit:** if `max_cameras` stops being VSR-referenced, if RAID-net
math (ADR 0047) changes, or if the 1.2 / 1.1 margins need tuning against field
data.
