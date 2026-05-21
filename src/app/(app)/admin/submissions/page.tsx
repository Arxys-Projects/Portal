import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PAGE_SIZE = 50;

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

function formatPrice(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `$${Number(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// A UUID-shaped recommended_product_id signals a pre-Step-3+4 submission
// whose FK target was dropped. Post-migration rows carry SKU strings.
function isUuidShaped(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

type Search = Promise<{ partnerId?: string; page?: string }>;

export default async function AdminSubmissionsPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const { partnerId, page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createSupabaseServerClient();
  // Phase 2 Step 3+4: the FK from submissions.recommended_product_id was
  // dropped; PostgREST can't embed products via that column anymore. Pull
  // submissions first, then batch-fetch products by SKU in a second query.
  let query = supabase
    .from("submissions")
    .select(
      `id, project_name, cameras_count, recommended_units, total_list_price_usd,
       total_partner_price_usd, recommended_product_id, created_at,
       partners!inner(id, company_name)`,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);
  if (partnerId) {
    query = query.eq("partner_id", partnerId);
  }
  const { data, error, count } = await query;

  // Load partners list for the filter dropdown (admin RLS admits this).
  const { data: partnerRows } = await supabase
    .from("partners")
    .select("id, company_name")
    .order("company_name");

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Submissions</h1>
        <p className="mt-3 text-sm text-red-600">
          Failed to load submissions: {error.message}
        </p>
      </div>
    );
  }

  type Row = {
    id: string;
    project_name: string | null;
    cameras_count: number;
    recommended_units: number;
    total_list_price_usd: number | null;
    total_partner_price_usd: number | null;
    recommended_product_id: string | null;
    created_at: string;
    partners:
      | { id: string; company_name: string }
      | { id: string; company_name: string }[]
      | null;
  };
  const rows = (data ?? []) as Row[];

  // Batch-fetch products by SKU for this page. Skip UUID-shaped (legacy)
  // recommended_product_id values — they don't match any post-migration row.
  const skuSet = new Set<string>();
  for (const r of rows) {
    if (r.recommended_product_id && !isUuidShaped(r.recommended_product_id)) {
      skuSet.add(r.recommended_product_id);
    }
  }
  const productBySku = new Map<string, { sku: string; product_group: string }>();
  if (skuSet.size > 0) {
    const { data: productRows } = await supabase
      .from("products")
      .select("sku, product_group")
      .in("sku", [...skuSet]);
    for (const p of productRows ?? []) {
      productBySku.set(p.sku, { sku: p.sku, product_group: p.product_group });
    }
  }
  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Submissions</h1>
          <p className="mt-1 text-sm text-neutral-600">
            All partner submissions. {total} total.
          </p>
        </div>
        <form method="get" className="flex items-end gap-2">
          <label htmlFor="partnerId" className="text-xs text-neutral-600">
            Filter by partner
            <select
              id="partnerId"
              name="partnerId"
              defaultValue={partnerId ?? ""}
              className="mt-1 block rounded border border-neutral-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">All partners</option>
              {(partnerRows ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.company_name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            Apply
          </button>
          {partnerId ? (
            <Link
              href="/admin/submissions"
              className="text-xs text-blue-600 hover:underline"
            >
              Clear
            </Link>
          ) : null}
        </form>
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">
          No submissions match this view.
        </p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Partner</th>
                <th className="px-4 py-2">Project</th>
                <th className="px-4 py-2">Recommendation</th>
                <th className="px-4 py-2 text-right">Cameras</th>
                <th className="px-4 py-2 text-right">List price</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((r) => {
                const partner = Array.isArray(r.partners)
                  ? r.partners[0]
                  : r.partners;
                const product = r.recommended_product_id
                  ? productBySku.get(r.recommended_product_id) ?? null
                  : null;
                const isLegacy =
                  !product &&
                  r.recommended_product_id !== null &&
                  isUuidShaped(r.recommended_product_id);
                const recommendationLabel = product
                  ? `${r.recommended_units} × ${product.product_group}`
                  : isLegacy
                    ? `${r.recommended_units} × (legacy)`
                    : `${r.recommended_units} ×`;
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-2 text-neutral-600">
                      {formatDate(r.created_at)}
                    </td>
                    <td className="px-4 py-2 text-neutral-900">
                      {partner?.company_name ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-neutral-900">
                      {r.project_name ?? "(untitled)"}
                    </td>
                    <td className="px-4 py-2 text-neutral-700">
                      {recommendationLabel}
                    </td>
                    <td className="px-4 py-2 text-right text-neutral-700">
                      {r.cameras_count}
                    </td>
                    <td className="px-4 py-2 text-right text-neutral-700">
                      {formatPrice(r.total_list_price_usd)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link
                        href={`/admin/submissions/${r.id}`}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm text-neutral-600">
          <p>
            Page {page} of {pageCount}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={{
                  pathname: "/admin/submissions",
                  query: { ...(partnerId ? { partnerId } : {}), page: page - 1 },
                }}
                className="rounded border border-neutral-300 px-3 py-1 hover:bg-neutral-100"
              >
                ← Previous
              </Link>
            ) : null}
            {page < pageCount ? (
              <Link
                href={{
                  pathname: "/admin/submissions",
                  query: { ...(partnerId ? { partnerId } : {}), page: page + 1 },
                }}
                className="rounded border border-neutral-300 px-3 py-1 hover:bg-neutral-100"
              >
                Next →
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
