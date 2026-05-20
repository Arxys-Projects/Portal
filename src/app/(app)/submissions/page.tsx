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
       created_at, products:recommended_product_id(name, sku)`,
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
    created_at: string;
    products:
      | { name: string; sku: string }
      | { name: string; sku: string }[]
      | null;
  };
  const rows = (data ?? []) as Row[];
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
                const product = Array.isArray(r.products)
                  ? r.products[0]
                  : r.products;
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-2 text-neutral-600">
                      {formatDate(r.created_at)}
                    </td>
                    <td className="px-4 py-2 text-neutral-900">
                      {r.project_name ?? "(untitled)"}
                    </td>
                    <td className="px-4 py-2 text-neutral-700">
                      {product
                        ? `${r.recommended_units} × ${product.name}`
                        : `${r.recommended_units} ×`}
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
