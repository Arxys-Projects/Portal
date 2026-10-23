// Pipedrive v2 product endpoints for the price-pipeline scripts
// (push-prices, backup-pipedrive-products, audit-pipedrive-products). The v1
// product CRUD they used before has been out of support since 2026-08-01.
//
// The token is a parameter rather than read from env, so the caller decides
// where credentials come from. listPipedriveProducts is also the product read
// behind Project Portal Step 5's deal lines (src/lib/projects/project-deal.ts);
// the writes below stay script-only.

import { waitMsFor429 } from "./company-api";
import type { PdProduct, PdProductRequest } from "./product-sync";

const PD_V2_BASE = "https://api.pipedrive.com/api/v2";
const MAX_429_RETRIES = 5;

// GET /api/v2/products, cursor-paged at the 500 maximum. Lists linkable and
// non-linkable products alike; deleted products are never returned. Also the
// product read behind Step 5's deal-line preview, so a 429 waits for
// x-ratelimit-reset and retries, like company-api.ts.
export async function listPipedriveProducts(token: string): Promise<PdProduct[]> {
  const out: PdProduct[] = [];
  let cursor: string | null = null;
  for (let attempt = 0; ; ) {
    const url = new URL(`${PD_V2_BASE}/products`);
    url.searchParams.set("limit", "500");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url.toString(), { headers: { "x-api-token": token } });
    if (res.status === 429 && attempt < MAX_429_RETRIES) {
      attempt++;
      await new Promise((r) => setTimeout(r, waitMsFor429(res.headers.get("x-ratelimit-reset"))));
      continue;
    }
    attempt = 0;
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
