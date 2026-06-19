import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  familyBySlug,
  COLUMN_HEADERS,
  RIGHT_ALIGNED_COLUMNS,
  type SkuColumn,
  type Family,
} from "@/lib/price-book/families";

type ProductRow = {
  sku: string;
  product_name: string;
  msrp: number | null;
  price_type: string;
  max_storage_tb: number | null;
  max_cameras: number | null;
};

function formatMsrp(row: ProductRow): string {
  if (row.price_type === "market") return "Market";
  if (row.price_type === "call_for_quote") return "Call for Quote";
  if (row.msrp == null) return "—";
  return `$${Number(row.msrp).toLocaleString("en-US")}`;
}

function cellValue(
  col: SkuColumn,
  row: ProductRow,
  extra?: Partial<Record<SkuColumn, string>>,
): string {
  if (extra?.[col]) return extra[col]!;
  switch (col) {
    case "sku":
      return row.sku;
    case "product":
      return row.product_name;
    case "netStorage":
      return row.max_storage_tb != null ? `${row.max_storage_tb} TB` : "—";
    case "ssdStorage":
      return row.max_storage_tb != null ? `${row.max_storage_tb} TB` : "—";
    case "bandwidth":
      return row.max_cameras != null ? `${row.max_cameras} Mbit/s` : "—";
    case "monitors":
      return "—";
    case "msrp":
      return formatMsrp(row);
  }
}

function SkuTable({
  columns,
  rows,
  skuExtraData,
}: {
  columns: SkuColumn[];
  rows: ProductRow[];
  skuExtraData?: Family["skuExtraData"];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200">
      <table className="w-full text-sm">
        <thead className="bg-[#054A91] text-white">
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                className={`px-4 py-3 font-semibold ${
                  RIGHT_ALIGNED_COLUMNS.has(col) ? "text-right" : "text-left"
                }`}
              >
                {COLUMN_HEADERS[col]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.sku}
              className={`border-t border-neutral-100 ${
                i % 2 === 1 ? "bg-neutral-50" : ""
              } hover:bg-neutral-100`}
            >
              {columns.map((col) => {
                const val = cellValue(
                  col,
                  row,
                  skuExtraData?.[row.sku],
                );
                const isRight = RIGHT_ALIGNED_COLUMNS.has(col);
                const isSku = col === "sku";
                const isMsrp = col === "msrp";
                return (
                  <td
                    key={col}
                    className={`px-4 py-3 ${isRight ? "text-right" : ""} ${
                      isSku ? "font-mono text-xs" : "text-neutral-700"
                    } ${isMsrp ? "font-semibold text-[#054A91]" : ""}`}
                  >
                    {val}
                  </td>
                );
              })}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-6 text-center text-neutral-400 text-xs"
              >
                No active SKUs found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default async function FamilyDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const family = familyBySlug(slug);
  if (!family) notFound();

  const supabase = await createSupabaseServerClient();

  // Primary SKU table
  const allPrimaryGroups = family.productGroups;
  const { data: primaryProducts } = await supabase
    .from("products")
    .select("sku, product_name, msrp, price_type, max_storage_tb, max_cameras")
    .in("product_group", allPrimaryGroups)
    .eq("active", true)
    .order("sort_order");

  // Tier section products
  const tierProductsMap = new Map<string, ProductRow[]>();
  for (const tier of family.tierSections) {
    const { data: tierRows } = await supabase
      .from("products")
      .select(
        "sku, product_name, msrp, price_type, max_storage_tb, max_cameras",
      )
      .in("product_group", tier.productGroups)
      .eq("active", true)
      .order("sort_order");
    tierProductsMap.set(tier.title, (tierRows ?? []) as ProductRow[]);
  }

  // Upgrade options
  const { data: upgradeProducts } =
    family.upgradeSkus.length > 0
      ? await supabase
          .from("products")
          .select("sku, product_name, msrp, price_type, max_storage_tb, max_cameras")
          .in("sku", family.upgradeSkus)
          .eq("active", true)
      : { data: [] };

  const rows = (primaryProducts ?? []) as ProductRow[];
  const upgrades = (upgradeProducts ?? []) as ProductRow[];

  return (
    <div>
      {/* Breadcrumb */}
      <div className="text-xs text-neutral-500 mb-5">
        <Link href="/price-book" className="hover:text-[#054A91]">
          ← Price Book
        </Link>
        <span className="mx-2 text-neutral-300">/</span>
        <span className="text-neutral-700">{family.shortName}</span>
      </div>

      {/* Hero */}
      <section className="pb-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left: hero image */}
          <div className="lg:col-span-5 bg-neutral-50 rounded-lg p-8 flex items-center justify-center min-h-48">
            {family.heroImage ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={family.heroImage}
                alt={family.displayName}
                className="max-h-72 object-contain"
              />
            ) : (
              <span className="text-[#fbb040] font-bold text-5xl">
                {family.shortName}
              </span>
            )}
          </div>

          {/* Right: copy */}
          <div className="lg:col-span-7">
            <div>
              <p className="text-[#fbb040] font-semibold text-sm uppercase tracking-widest">
                {family.eyebrow}
              </p>
              <h1 className="mt-2 text-4xl font-semibold text-[#054A91]">
                {family.shortName}
              </h1>
            </div>

            <p className="mt-3 text-lg text-neutral-700 leading-snug">
              {family.tagline}
            </p>

            <div className="mt-6 rounded-lg border-l-4 border-[#fbb040] bg-neutral-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#054A91]">
                Great For
              </p>
              <p className="mt-1.5 text-sm text-neutral-700 leading-relaxed">
                {family.greatFor}
              </p>
            </div>

            {/* Quick stats */}
            <div className="mt-6 grid grid-cols-3 gap-4">
              {family.kpis.map((kpi) => (
                <div
                  key={kpi.label}
                  className="text-center bg-[#f0f5fa] rounded-lg py-3 relative"
                >
                  <div className="text-xs text-neutral-500 uppercase tracking-wide flex items-center justify-center gap-1">
                    {kpi.label}
                    {kpi.vsrTooltip && (
                      <details className="inline-block relative no-print">
                        <summary className="cursor-help list-none text-[#fbb040] font-bold leading-none">
                          ⓘ
                        </summary>
                        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-64 bg-[#054A91] text-white text-xs font-normal text-left p-3 rounded shadow-lg z-10 normal-case tracking-normal">
                          <strong className="text-[#fbb040]">
                            VSR (Video Stream Rate):
                          </strong>{" "}
                          4MP @ 15 fps, record on motion, with VMD + metadata,
                          75% motion activity, 30-day retention, h.264.20 &
                          h.265.20 CODEC (~3–5 Mb video file).
                        </div>
                      </details>
                    )}
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-[#054A91]">
                    {kpi.value}
                  </div>
                  <div className="text-xs text-neutral-500">{kpi.unit}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Compliance badges */}
      <section className="pb-8">
        <div className="rounded-lg bg-[#f0f5fa] border border-neutral-200 px-6 py-4 flex flex-wrap items-center justify-around gap-4 text-sm font-semibold text-[#054A91]">
          {[
            "Multi-VMS Validated: Milestone, Avigilon, Genetec, NXWitness, Hanwha, Exacq, Axxonsoft",
            "NDAA Compliant",
            "American Made",
          ].map((badge) => (
            <div key={badge} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#fbb040] shrink-0" />
              <span>{badge}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Key features + Tech specs */}
      <section className="pb-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 border-b border-neutral-200 pb-2">
              Key Features
            </h2>
            <ul className="gold-star mt-4 space-y-2 text-sm text-neutral-700">
              {family.keyFeatures.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 border-b border-neutral-200 pb-2">
              Technical Specs
            </h2>
            <ul className="gold-star mt-4 space-y-2 text-sm text-neutral-700">
              {family.technicalSpecs.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Primary SKU table */}
      <section className="pb-10">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">
          {family.shortName} Configurations
        </h2>
        <SkuTable
          columns={family.skuTableColumns}
          rows={rows}
          skuExtraData={family.skuExtraData}
        />
      </section>

      {/* Tier sections (e.g. V150 on V100 page) */}
      {family.tierSections.map((tier) => {
        const tierRows = tierProductsMap.get(tier.title) ?? [];
        return (
          <section key={tier.title} className="pb-10">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">
              {tier.title}
            </h2>
            <SkuTable
              columns={tier.columns}
              rows={tierRows}
              skuExtraData={family.skuExtraData}
            />
            {tier.caption && (
              <p className="mt-2 text-xs text-neutral-400">{tier.caption}</p>
            )}
          </section>
        );
      })}

      {/* Upgrade options */}
      {upgrades.length > 0 && (
        <section className="pb-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">
            Upgrade Options
          </h2>
          <div className="overflow-x-auto rounded-lg border border-neutral-200">
            <table className="w-full text-sm">
              <thead className="bg-neutral-100">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold text-neutral-600">
                    SKU
                  </th>
                  <th className="text-left px-4 py-2.5 font-semibold text-neutral-600">
                    Add-on
                  </th>
                  <th className="text-right px-4 py-2.5 font-semibold text-neutral-600">
                    MSRP
                  </th>
                </tr>
              </thead>
              <tbody>
                {upgrades.map((row) => (
                  <tr key={row.sku} className="border-t border-neutral-100">
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {row.sku}
                    </td>
                    <td className="px-4 py-2.5 text-neutral-700">
                      {row.product_name}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-neutral-900">
                      {formatMsrp(row)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Documentation */}
      <section className="pb-10">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 border-b border-neutral-200 pb-2 mb-4">
          Documentation
        </h2>
        {family.datasheetUrl ? (
          <div className="flex flex-wrap gap-3">
            {(
              family.datasheetButtons ?? [
                { label: "Download Datasheet", url: family.datasheetUrl },
              ]
            ).map((btn) => (
              <a
                key={btn.url}
                href={btn.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-[#054A91] hover:border-[#054A91] transition"
              >
                <svg
                  className="w-4 h-4 text-[#fbb040]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 10v6m0 0l-3-3m3 3l3-3M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z"
                  />
                </svg>
                {btn.label}
              </a>
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-400">Documentation coming soon.</p>
        )}
      </section>

      {/* Fine print */}
      <section className="pb-12">
        <div className="rounded-lg bg-neutral-50 border border-neutral-200 p-5 text-xs text-neutral-600 leading-relaxed">
          <p>
            <span className="font-semibold">VSR (Video Stream Rate):</span> 4MP
            @ 15fps, record on motion, with VMD & metadata capture, 75% motion
            activity, 30-day retention, h.264.20 & h.265.20 CODEC. ~3-5 Mb
            video file.
          </p>
          <p className="mt-2">
            For installations with less than 300 cameras, free SQL Server
            Express edition can often be used; for larger systems, Microsoft SQL
            Server Standard or Enterprise edition is recommended. Client View
            application on server not supported (requires dedicated client view
            workstation). Windows Server IoT for Storage Workgroup EULA and
            Microsoft conditions apply.
          </p>
          <p className="mt-2">
            Prices and specs subject to change without notice. Arxys reserves
            the right to substitute components, ensuring equivalent or superior
            performance. NDAA compliant with no disclosures.
          </p>
        </div>
      </section>
    </div>
  );
}
