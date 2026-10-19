// Pipedrive v2 product endpoints for the price-pipeline scripts
// (push-prices, backup-pipedrive-products, audit-pipedrive-products). The v1
// product CRUD they used before has been out of support since 2026-08-01.
//
// The token is a parameter rather than read from env so the scripts stay the
// only place that loads credentials. The portal app's own Pipedrive client is
// client.ts; this module is not used by the app.

import type { PdProduct, PdProductRequest } from "./product-sync";

const PD_V2_BASE = "https://api.pipedrive.com/api/v2";

// GET /api/v2/products, cursor-paged at the 500 maximum. Lists linkable and
// non-linkable products alike; deleted products are never returned.
export async function listPipedriveProducts(token: string): Promise<PdProduct[]> {
  const out: PdProduct[] = [];
  let cursor: string | null = null;
  for (;;) {
    const url = new URL(`${PD_V2_BASE}/products`);
    url.searchParams.set("limit", "500");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url.toString(), { headers: { "x-api-token": token } });
    if (!res.ok) throw new Error(`Pipedrive GET /api/v2/products failed (${res.status})`);
    const json = (await res.json()) as {
      success: boolean;
      error?: string;
      data: PdProduct[] | null;
      additional_data?: { next_cursor?: string | null };
    };
    if (!json.success) throw new Error(`Pipedrive GET /api/v2/products: ${json.error}`);
    out.push(...(json.data ?? []));
    cursor = json.additional_data?.next_cursor ?? null;
    if (!cursor) return out;
  }
}

// POST /api/v2/products (create) or PATCH /api/v2/products/{id} (update).
export async function writePipedriveProduct(
  token: string,
  method: "POST" | "PATCH",
  path: string,
  body: PdProductRequest,
): Promise<PdProduct> {
  const res = await fetch(`${PD_V2_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "x-api-token": token },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { success: boolean; error?: string; data: PdProduct };
  if (!res.ok || !json.success) throw new Error(`Pipedrive ${method} ${path}: ${json.error ?? res.status}`);
  return json.data;
}
