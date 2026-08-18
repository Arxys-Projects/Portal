import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  familyBySlug,
  datasheetButtonsFor,
  COLUMN_HEADERS,
  RIGHT_ALIGNED_COLUMNS,
  type SkuColumn,
  type Family,
} from "@/lib/price-book/families";
import {
  cellValue,
  formatMsrp,
  type ProductRow,
  type ProductSpecLite,
} from "@/lib/price-book/cell-value";
// ADR 0133 — the single source for the VSR rating profile. The price book used to
// hand-write its own description of it in two places; both now render from here.
import {
  LEDGER_VSR_CAPTION,
  LEDGER_VSR_PARAMETERS,
  ledgerVsrProfileSentence,
} from "@/lib/datasheet/copy";

function SkuTable({
  columns,
  rows,
  specsBySku,
  skuExtraData,
}: {
  columns: SkuColumn[];
  rows: ProductRow[];
  specsBySku: Record<string, ProductSpecLite>;
  skuExtraData?: Family["skuExtraData"];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-sm">
        <thead className="bg-[#14346b] text-white">
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
              className={`border-t border-line-soft ${
                i % 2 === 1 ? "bg-neutral-50" : ""
              } hover:bg-neutral-100`}
            >
              {columns.map((col) => {
                const val = cellValue(
                  col,
                  row,
                  specsBySku[row.sku],
                  skuExtraData?.[row.sku],
                );
                const isRight = RIGHT_ALIGNED_COLUMNS.has(col);
                const isSku = col === "sku";
                const isMsrp = col === "msrp";
                return (
                  <td
                    key={col}
                    className={`px-4 py-3 ${isRight ? "text-right" : ""} ${
                      isSku ? "font-mono text-xs" : "text-ink-soft"
                    } ${isMsrp ? "font-semibold text-[#14346b]" : ""}`}
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
                className="px-4 py-6 text-center text-ink-soft text-xs"
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
    .from("current_products")
    .select("sku, product_name, msrp, price_type")
    .in("product_group", allPrimaryGroups)
    .eq("active", true)
    .eq("hidden_from_catalog", false)
    .order("sort_order");

  // Tier section products
  const tierProductsMap = new Map<string, ProductRow[]>();
  for (const tier of family.tierSections) {
    const { data: tierRows } = await supabase
      .from("current_products")
      .select("sku, product_name, msrp, price_type")
      .in("product_group", tier.productGroups)
      .eq("active", true)
      .eq("hidden_from_catalog", false)
      .order("sort_order");
    tierProductsMap.set(tier.title, (tierRows ?? []) as ProductRow[]);
  }

  // Upgrade options
  const { data: upgradeProducts } =
    family.upgradeSkus.length > 0
      ? await supabase
          .from("current_products")
          .select("sku, product_name, msrp, price_type")
          .in("sku", family.upgradeSkus)
          .eq("active", true)
          .eq("hidden_from_catalog", false)
      : { data: [] };

  const rows = (primaryProducts ?? []) as ProductRow[];
  const upgrades = (upgradeProducts ?? []) as ProductRow[];

  // Net-usable storage and camera bandwidth live in product_specs, not products.
  // product_specs.id IS the SKU, so join products.sku -> product_specs.id for
  // every SKU rendered on this page (primary + tiers + upgrades).
  const allSkus = [
    ...rows.map((r) => r.sku),
    ...[...tierProductsMap.values()].flat().map((r) => r.sku),
    ...upgrades.map((r) => r.sku),
  ];
  const specsBySku: Record<string, ProductSpecLite> = {};
  if (allSkus.length > 0) {
    const { data: specRows } = await supabase
      .from("product_specs")
      .select(
        "id, storage_raw_tb, hdd_count, raid_level_display, max_bandwidth_mbps",
      )
      .in("id", allSkus);
    for (const s of specRows ?? []) {
      const spec = s as {
        id: string;
        storage_raw_tb: number | string | null;
        hdd_count: number | null;
        raid_level_display: string | null;
        max_bandwidth_mbps: number | null;
      };
      specsBySku[spec.id] = {
        storage_raw_tb:
          spec.storage_raw_tb == null ? null : Number(spec.storage_raw_tb),
        hdd_count: spec.hdd_count,
        raid_level_display: spec.raid_level_display,
        max_bandwidth_mbps: spec.max_bandwidth_mbps,
      };
    }
  }

  const datasheetButtons = datasheetButtonsFor(family);

  return (
    <div>
      {/* Breadcrumb */}
      <div className="text-xs text-ink-soft mb-5">
        <Link href="/price-book" className="hover:text-[#14346b]">
          ← Price Book
        </Link>
        <span className="mx-2 text-neutral-300">/</span>
        <span className="text-ink-soft">{family.shortName}</span>
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
              <span className="text-[#c17f10] font-bold text-5xl">
                {family.shortName}
              </span>
            )}
          </div>

          {/* Right: copy */}
          <div className="lg:col-span-7">
            <div>
              <p className="text-[#c17f10] font-semibold text-sm uppercase tracking-widest">
                {family.eyebrow}
              </p>
              <h1 className="mt-2 text-4xl font-semibold text-[#14346b]">
                {family.shortName}
              </h1>
            </div>

            <p className="mt-3 text-lg text-ink-soft leading-snug">
              {family.tagline}
            </p>

            <div className="mt-6 rounded-lg border-l-4 border-[#fbb040] bg-neutral-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#14346b]">
                Great For
              </p>
              <p className="mt-1.5 text-sm text-ink-soft leading-relaxed">
                {family.greatFor}
              </p>
            </div>

            {/* Quick stats */}
            <div className="mt-6 grid grid-cols-3 gap-4">
              {family.kpis.map((kpi) => (
                <div
                  key={kpi.label}
                  className="text-center bg-[#eef2f8] rounded-lg py-3 relative"
                >
                  <div className="text-xs text-ink-soft uppercase tracking-wide flex items-center justify-center gap-1">
                    {kpi.label}
                    {kpi.vsrTooltip && (
                      <details className="inline-block relative no-print">
                        <summary className="cursor-help list-none text-[#c17f10] font-bold leading-none">
                          ⓘ
                        </summary>
                        {/* ADR 0133 — the rating profile is rendered from
                            LEDGER_VSR_PARAMETERS, the same source the datasheet
                            strip uses. It used to be hand-written here (and again
                            in the fine print below), and the two copies had
                            drifted from the canonical values and from each other.
                            As label/value lines rather than a sentence: this is a
                            small tooltip read by non-specialists, and the pairs
                            are easier to scan than running text. */}
                        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-64 bg-[#14346b] text-white text-xs font-normal text-left p-3 rounded shadow-lg z-10 normal-case tracking-normal">
                          <strong className="text-[#fbb040]">
                            VSR (Video Stream Rate):
                          </strong>
                          <dl className="mt-1.5 space-y-0.5">
                            {LEDGER_VSR_PARAMETERS.map((p) => (
                              <div key={p.label} className="flex gap-1.5">
                                <dt className="shrink-0 text-white/70">{p.label}</dt>
                                <dd className="font-semibold">{p.value}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      </details>
                    )}
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-[#14346b]">
                    {kpi.value}
                  </div>
                  <div className="text-xs text-ink-soft">{kpi.unit}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Compliance badges */}
      <section className="pb-8">
        <div className="rounded-lg bg-[#eef2f8] border border-line px-6 py-4 flex flex-wrap items-center justify-around gap-4 text-sm font-semibold text-[#14346b]">
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
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-soft border-b border-line pb-2">
              Key Features
            </h2>
            <ul className="gold-star mt-4 space-y-2 text-sm text-ink-soft">
              {family.keyFeatures.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-soft border-b border-line pb-2">
              Technical Specs
            </h2>
            <ul className="gold-star mt-4 space-y-2 text-sm text-ink-soft">
              {family.technicalSpecs.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Primary SKU table */}
      <section className="pb-10">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-soft mb-3">
          {family.shortName} Configurations
        </h2>
        <SkuTable
          columns={family.skuTableColumns}
          rows={rows}
          specsBySku={specsBySku}
          skuExtraData={family.skuExtraData}
        />
      </section>

      {/* Tier sections (e.g. V150 on V100 page) */}
      {family.tierSections.map((tier) => {
        const tierRows = tierProductsMap.get(tier.title) ?? [];
        return (
          <section key={tier.title} className="pb-10">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-soft mb-3">
              {tier.title}
            </h2>
            <SkuTable
              columns={tier.columns}
              rows={tierRows}
              specsBySku={specsBySku}
              skuExtraData={family.skuExtraData}
            />
            {tier.caption && (
              <p className="mt-2 text-xs text-ink-soft">{tier.caption}</p>
            )}
          </section>
        );
      })}

      {/* Upgrade options */}
      {upgrades.length > 0 && (
        <section className="pb-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-soft mb-3">
            Upgrade Options
          </h2>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-sm">
              <thead className="bg-panel">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold text-ink-soft">
                    SKU
                  </th>
                  <th className="text-left px-4 py-2.5 font-semibold text-ink-soft">
                    Add-on
                  </th>
                  <th className="text-right px-4 py-2.5 font-semibold text-ink-soft">
                    MSRP
                  </th>
                </tr>
              </thead>
              <tbody>
                {upgrades.map((row) => (
                  <tr key={row.sku} className="border-t border-line-soft">
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {row.sku}
                    </td>
                    <td className="px-4 py-2.5 text-ink-soft">
                      {row.product_name}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-ink">
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
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-soft border-b border-line pb-2 mb-4">
          Documentation
        </h2>
        {datasheetButtons.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {datasheetButtons.map((btn) => (
              <a
                key={btn.url}
                href={btn.url}
                {...(btn.external
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-4 py-3 text-sm font-medium text-[#14346b] hover:border-[#14346b] transition"
              >
                <svg
                  className="w-4 h-4 text-[#c17f10]"
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
          <p className="text-sm text-ink-soft">Documentation coming soon.</p>
        )}
      </section>

      {/* Fine print */}
      <section className="pb-12">
        <div className="rounded-lg bg-neutral-50 border border-line p-5 text-xs text-ink-soft leading-relaxed">
          {/* ADR 0133 — same canonical source as the KPI tooltip above and the
              datasheet's parameter strip. Running text here, so it takes the
              derived sentence rather than the label/value lines. */}
          <p>
            <span className="font-semibold">VSR (Video Stream Rate):</span>{" "}
            {ledgerVsrProfileSentence()}. {LEDGER_VSR_CAPTION}
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
