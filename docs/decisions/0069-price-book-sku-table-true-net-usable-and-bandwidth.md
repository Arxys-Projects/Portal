# 0069 — Price Book SKU table renders true net-usable storage and real bandwidth

- **Status**: Accepted
- **Date**: 2026-06-19

## Context

The Price Book family page ([`src/app/(app)/price-book/[slug]/page.tsx`](../../src/app/(app)/price-book/[slug]/page.tsx)) renders a per-SKU configuration table. Its cell renderer drew three columns from the wrong source:

- **"Net Usable Storage"** showed `products.max_storage_tb` — the RAW HDD nameplate (e.g. V700 = 480 TB) — under a label that promises net-usable. This is the same raw-vs-net-usable confusion ADR 0068 fixed in the sizing engine: every capacity figure the customer sees elsewhere divides by RAID net-usable (`usableCapacityTb`, ADR 0047), so the Price Book over-stated capacity by a full parity stripe (V700: 480 shown vs 400 actual).
- **"SSD Storage"** had the same `max_storage_tb` fallback — meaningless for the SSD-based management/ACM servers that use this column.
- **"Max Camera Bandwidth"** showed `products.max_cameras` (a stream count) with a `Mbit/s` suffix — the camera count mislabeled as bandwidth (V700: "325 Mbit/s" where real bandwidth is 4000).

The correct figures live in `product_specs` (`storage_raw_tb`, `hdd_count`, `raid_level_display`, `max_bandwidth_mbps`), keyed by `product_specs.id` which IS the SKU. `skuExtraData` overrides in `families.ts` already supply correct display strings for many SKUs and are authoritative when present; the bugs only surfaced for SKUs without an override.

## Options considered

- **Compute every column from `product_specs`, fall back to raw nameplate.** Rejected — falling back to the wrong number is what caused the bug; "—" is more honest than a misleading figure.
- **Compute `ssdStorage` via `usableCapacityTb` too.** Rejected — SSD storage on management/ACM servers is mirrored OS/DB SSDs (RAID 1, described as strings like "2x DB & 2x OS"), not the parity video array; those models have no `product_specs` row, so the parity math is both inapplicable and uncomputable.
- **Join `product_specs` only for the storage/bandwidth columns; keep `skuExtraData` overrides authoritative.** Chosen.

## Decision

Join `products.sku → product_specs.id` for every SKU rendered on the page and pass that spec slice into the cell renderer. `netStorage` → `usableCapacityTb(storage_raw_tb, hdd_count, raid_level_display)`; `bandwidth` → `max_bandwidth_mbps`; both render "—" when the spec or field is absent. `ssdStorage` renders "—" with no override and is **never** backed by the HDD nameplate. `skuExtraData` overrides still win over any computed value.

The cell logic was extracted to a pure module ([`src/lib/price-book/cell-value.ts`](../../src/lib/price-book/cell-value.ts)) so it is unit-testable without the page's `server-only` Supabase import.

## Consequences

**Positive:** Price Book capacity/bandwidth now agree with the sizing engine, the PDFs, and the comparison tool — one net-usable definition across the product. Honest "—" instead of a wrong number where data is missing. Cell logic is unit-tested.
**Negative:** One extra `product_specs` query per family page render (≤21 rows, indexed by PK). `ssdStorage` shows "—" for any SSD SKU lacking a `skuExtraData` override — acceptable, since the override is the intended source.
**When to revisit:** If `product_specs` gains rows for the management/ACM/SW families (or a real SSD-capacity field), reconsider computing `ssdStorage` instead of relying solely on overrides.
