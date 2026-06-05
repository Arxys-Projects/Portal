# 0047 — RAID usable-capacity approximation for the System Estimate capacity bars

- **Status**: Accepted
- **Date**: 2026-06-05

## Context

The System Estimate PDF's "Total storage" capacity bar compares required TB
against the recommended server's *usable* (net of RAID parity) capacity. No
usable-capacity utility existed: the calculator works in raw GB, and the
recommendation engine compares against the `products` table's pre-computed
`max_storage_tb`. The PDF instead joins `product_specs` (which carries
`storage_raw_tb`, `hdd_count`, and `raid_level_display` from the Phase 6
QuickCompare migration) and needs to turn raw capacity into usable.

The Price Book has marketing "Net Usable Storage" figures
(`families.ts skuExtraData`), but those are per-SKU strings, not derivable
arithmetic, and don't cover every tier.

## Options considered

- **Use `products.max_storage_tb`** — already loaded, but it is a
  camera/throughput-oriented sizing number, not a RAID-net capacity, so it
  would misrepresent the storage bar.
- **Compute from raw + RAID level** — `usableCapacityTb()` in `render.ts`:
  RAID 5 loses one drive `(n-1)/n`, RAID 6 loses two `(n-2)/n`, RAID 60 loses
  four `(n-4)/n`; anything else (RAID 1, "NA", software RAID, null) falls back
  to the brief's simple `(n-1)/n`.
- **Hardcode the Price Book net-usable strings** — accurate but brittle and not
  arithmetic; breaks for any SKU not in the lookup.

## Decision

Compute usable capacity arithmetically from `storage_raw_tb`, `hdd_count`, and
`raid_level_display`. It is an approximation — it ignores per-drive
nameplate-vs-formatted loss and assumes the RAID 60 layout is two spans — and is
labelled "usable" on a planning document, not a guaranteed figure. When the
`product_specs` join is missing (legacy submissions), the bar falls back to the
recommendation's covered storage.

## Consequences

**Positive:** One formula covers every SKU tier with no lookup table, driven by
columns that already exist. Reads correctly for the common RAID 5/6/60 levels in
the VideoX line.

**Negative:** The number can differ from the Price Book's marketing net-usable
figure by a few percent. Acceptable on a document whose footer already states
figures are planning estimates.

**When to revisit:** If sales needs the bar to match the published Price Book
net-usable number exactly, swap the formula for the `families.ts` lookup (and
accept the coverage gaps), or add a real net-usable column to `product_specs`.
