import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { productGroupToFamilySlug } from "@/lib/price-book/families";

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
// whose FK target was dropped. Post-migration rows carry SKU strings (e.g.
// `VX5-V800-720`) which never match the UUID pattern.
function isUuidShaped(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

type Search = Promise<{ page?: string }>;

export default async function PartnerSubmissionsPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // RLS already scopes to the caller's own rows — no application filter.
  const supabase = await createSupabaseServerClient();
  const { data, error, count } = await supabase
    .from("submissions")
    .select(
      `id, project_name, cameras_count, recommended_units, total_list_price_usd,
       recommended_product_id, created_at`,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">
          Submission history
        </h1>
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
    recommended_product_id: string | null;
    created_at: string;
  };
  const rows = (data ?? []) as Row[];

  // Phase 2 Step 3+4: submissions.recommended_product_id is TEXT (SKU for
  // post-migration rows, UUID-shaped string for legacy rows). The FK is
  // gone, so we batch-fetch the products for this page in a second query
  // and join in memory.
  const skuSet = new Set<string>();
  for (const r of rows) {
    if (r.recommended_product_id && !isUuidShaped(r.recommended_product_id)) {
      skuSet.add(r.recommended_product_id);
    }
  }
  const productBySku = new Map<string, { product_group: string; sku: string }>();
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
      <div className="mb-4">
        <Link
          href="/dashboard"
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back to dashboard
        </Link>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">
            Submission history
          </h1>
          <p className="mt-1 text-sm text-neutral-600">
            Your past calculator submissions. {total} total.
          </p>
        </div>
        <Link
          href="/calculator"
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          New calculation
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">
          You have not saved a calculation yet.{" "}
          <Link href="/calculator" className="text-blue-600 hover:underline">
            Start one now.
          </Link>
        </p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Project</th>
                <th className="px-4 py-2">Recommendation</th>
                <th className="px-4 py-2 text-right">Cameras</th>
                <th className="px-4 py-2 text-right">List price</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((r) => {
                const product = r.recommended_product_id
                  ? productBySku.get(r.recommended_product_id) ?? null
                  : null;
                const isLegacy =
                  !product &&
                  r.recommended_product_id !== null &&
                  isUuidShaped(r.recommended_product_id);
                const familySlug = product
                  ? productGroupToFamilySlug(product.product_group)
                  : null;
                const productGroupLabel = product
                  ? product.product_group
                  : isLegacy
                    ? "(legacy)"
                    : null;
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-2 text-neutral-600">
                      {formatDate(r.created_at)}
                    </td>
                    <td className="px-4 py-2 text-neutral-900">
                      {r.project_name ?? "(untitled)"}
                    </td>
                    <td className="px-4 py-2 text-neutral-700">
                      {r.recommended_units} ×{" "}
                      {productGroupLabel && familySlug ? (
                        <Link
                          href={`/price-book/${familySlug}`}
                          className="text-[#054A91] hover:underline font-medium"
                        >
                          {productGroupLabel}
                        </Link>
                      ) : (
                        productGroupLabel ?? ""
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-neutral-700">
                      {r.cameras_count}
                    </td>
                    <td className="px-4 py-2 text-right text-neutral-700">
                      {formatPrice(r.total_list_price_usd)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link
                        href={`/submissions/${r.id}`}
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
                href={{ pathname: "/submissions", query: { page: page - 1 } }}
                className="rounded border border-neutral-300 px-3 py-1 hover:bg-neutral-100"
              >
                ← Previous
              </Link>
            ) : null}
            {page < pageCount ? (
              <Link
                href={{ pathname: "/submissions", query: { page: page + 1 } }}
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
