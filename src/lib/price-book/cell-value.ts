// Pure cell-rendering logic for the Price Book per-SKU configuration tables
// (src/app/(app)/price-book/[slug]/page.tsx). Kept free of server-only /
// Supabase imports so it is unit-testable on its own. See ADR 0069.

import { usableCapacityTb } from "@/lib/capacity-utils";
import type { SkuColumn } from "./families";

// A row from the `products` table. max_storage_tb is the RAW HDD nameplate and
// max_cameras is a stream count — neither is rendered directly anymore (see the
// netStorage / bandwidth cases below); they remain for the SKU/product/MSRP
// columns and potential future use.
export type ProductRow = {
  sku: string;
  product_name: string;
  msrp: number | null;
  price_type: string;
  max_storage_tb: number | null;
  max_cameras: number | null;
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
function formatTb(tb: number): string {
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
      // "Net Usable Storage" = RAID net-usable, NOT the raw nameplate
      // (max_storage_tb). Compute from the joined product_specs config.
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
      // models have no product_specs row to compute from, and the HDD video
      // nameplate (max_storage_tb) does not describe SSD capacity — so "—" when
      // no override exists, never the raw nameplate.
      return "—";
    case "bandwidth":
      // "Max Camera Bandwidth" = the real bandwidth field, NOT the camera count
      // (max_cameras). max_bandwidth_mbps from product_specs; "—" when absent.
      return spec?.max_bandwidth_mbps != null
        ? `${spec.max_bandwidth_mbps} Mbit/s`
        : "—";
    case "monitors":
      return "—";
    case "msrp":
      return formatMsrp(row);
  }
}
