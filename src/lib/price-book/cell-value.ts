// Pure cell-rendering logic for the Price Book per-SKU configuration tables
// (src/app/(app)/price-book/[slug]/page.tsx). Kept free of server-only /
// Supabase imports so it is unit-testable on its own. See ADR 0069.

import { usableCapacityTb } from "@/lib/capacity-utils";
import type { SkuColumn } from "./families";

// A row from the `products` table — identity and price only.
//
// products.max_storage_tb (RAW HDD nameplate) and products.max_cameras (a stream
// count) are deliberately NOT in this type. They were once rendered as "Net
// Usable Storage" and "Max Camera Bandwidth", which was wrong twice over: wrong
// basis, and populated for only 6 of the 21 rack SKUs. Both figures now come from
// the joined product_specs row (see ProductSpecLite / the netStorage + bandwidth
// cases below). Keeping them out of the type is what makes the old bug
// unrepresentable rather than merely absent. See ADR 0092/0094 and JOURNAL
// 2026-07-27.
export type ProductRow = {
  sku: string;
  product_name: string;
  msrp: number | null;
  price_type: string;
};

// The slice of `product_specs` the SKU table needs. product_specs.id IS the SKU
// (see render.ts loadProductSpec), so we join products.sku -> product_specs.id.
// All QuickCompare columns are nullable.
export type ProductSpecLite = {
  storage_raw_tb: number | null;
  hdd_count: number | null;
  raid_level_display: string | null;
  max_bandwidth_mbps: number | null;
};

export function formatMsrp(row: ProductRow): string {
  if (row.price_type === "market") return "Market";
  if (row.price_type === "call_for_quote") return "Call for Quote";
  if (row.msrp == null) return "—";
  return `$${Number(row.msrp).toLocaleString("en-US")}`;
}

// TB display: round to one decimal and drop a trailing ".0" (e.g. 60, 62.5).
// Exported so the admin spec form's net-usable preview (ADR 0096 §4b) prints
// the figure exactly as the Price Book will — the preview's whole value is that
// the editor sees the published number, not a differently-rounded cousin.
export function formatTb(tb: number): string {
  return `${Math.round(tb * 10) / 10}`;
}

export function cellValue(
  col: SkuColumn,
  row: ProductRow,
  spec?: ProductSpecLite,
  extra?: Partial<Record<SkuColumn, string>>,
): string {
  // skuExtraData overrides (families.ts) are authoritative when present.
  if (extra?.[col]) return extra[col]!;
  switch (col) {
    case "sku":
      return row.sku;
    case "product":
      return row.product_name;
    case "netStorage": {
      // "Net Usable Storage" = RAID net-usable, never the raw HDD nameplate.
      // Computed from the joined product_specs config.
      const usable = spec
        ? usableCapacityTb(
            spec.storage_raw_tb,
            spec.hdd_count,
            spec.raid_level_display,
          )
        : null;
      return usable != null ? `${formatTb(usable)} TB` : "—";
    }
    case "ssdStorage":
      // SSD storage is shown only for management / ACM servers, whose figures
      // come from skuExtraData overrides ("2x DB & 2x OS", "2x 480GB"). These
      // models have no product_specs row at all — product_specs is rack-video-
      // only, which is what appliance_specs (migration 20260723000001) exists to
      // fix — so there is nothing to compute from and no override means "—".
      return "—";
    case "bandwidth":
      // "Max Camera Bandwidth" = the real bandwidth field, never a camera count.
      // max_bandwidth_mbps from product_specs; "—" when absent.
      return spec?.max_bandwidth_mbps != null
        ? `${spec.max_bandwidth_mbps} Mbit/s`
        : "—";
    case "monitors":
      return "—";
    case "msrp":
      return formatMsrp(row);
  }
}
