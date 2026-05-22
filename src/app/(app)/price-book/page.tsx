import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  FAMILIES,
  FAMILY_CATEGORIES,
  type Family,
} from "@/lib/price-book/families";

function formatFrom(msrp: number | null): string {
  if (msrp == null) return "—";
  return `$${msrp.toLocaleString("en-US")}`;
}

export default async function PriceBookIndexPage() {
  const supabase = await createSupabaseServerClient();

  const allGroups = FAMILIES.flatMap((f) => f.productGroups);
  const { data: products } = await supabase
    .from("products")
    .select("product_group, msrp, price_type")
    .eq("active", true)
    .in("product_group", allGroups);

  const minBySlug = new Map<string, number | null>();
  for (const f of FAMILIES) {
    const rows = (products ?? []).filter(
      (p) =>
        f.productGroups.includes(p.product_group) &&
        p.price_type === "numeric" &&
        p.msrp != null,
    );
    minBySlug.set(
      f.slug,
      rows.length > 0 ? Math.min(...rows.map((p) => Number(p.msrp))) : null,
    );
  }

  const sorted = [...FAMILIES].sort((a, b) => a.sortOrder - b.sortOrder);

  const categoryOrder: Family["category"][] = [
    "nvr-mgmt-acm",
    "nvr-analytics",
    "high-density",
  ];

  const sections = categoryOrder.map((cat) => ({
    cat,
    ...FAMILY_CATEGORIES[cat],
    families: sorted.filter((f) => f.category === cat),
  }));

  return (
    <div>
      {/* Page hero */}
      <section className="bg-[#054A91] text-white -mx-4 -mt-8 px-4 py-12">
        <div className="mx-auto max-w-5xl">
          <p className="text-[#fbb040] font-medium text-sm uppercase tracking-widest">
            VideoX V5
          </p>
          <h1 className="mt-2 text-4xl font-semibold leading-tight">
            MSRP Price Book
          </h1>
          <p className="mt-3 text-white/80 max-w-2xl text-sm">
            AMD Zen5-powered VideoX V5 servers deliver 30–50% storage and
            bandwidth savings versus H.264. Browse families below for full SKU,
            MSRP, and spec details. Prices live from current price list.
          </p>
          <div className="mt-6 flex items-center gap-3 text-xs text-white/60">
            <span>Effective 05/05/2026</span>
            <span className="text-white/40">·</span>
            <span>Prices and specs subject to change without notice</span>
          </div>
        </div>
      </section>

      {/* Compliance badges strip */}
      <div className="mx-auto max-w-5xl mt-8 -mb-2">
        <div className="rounded-lg bg-neutral-50 border border-neutral-200 px-6 py-3 flex flex-wrap items-center justify-around gap-4 text-xs font-semibold text-[#054A91]">
          {[
            "Multi-VMS Validated",
            "PSA Security Partner",
            "TAA & NDAA Compliant",
            "American Made",
          ].map((badge) => (
            <div key={badge} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#fbb040]" />
              <span>{badge}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Family grid */}
      <div className="mx-auto max-w-5xl py-10">
        {sections.map((section) => (
          <div key={section.cat} className="mt-10 first:mt-0">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              {section.label}
              <span className="ml-2 normal-case font-normal">
                · {section.warranty}
              </span>
            </h2>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {section.families.map((family) => (
                <Link
                  key={family.slug}
                  href={`/price-book/${family.slug}`}
                  className="group block rounded-lg border border-neutral-200 bg-white overflow-hidden hover:border-[#054A91] transition"
                >
                  <div className="aspect-[4/3] bg-neutral-50 flex items-center justify-center p-6">
                    {family.heroImage ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={family.heroImage}
                        alt={family.displayName}
                        className="max-h-full object-contain"
                      />
                    ) : (
                      <span className="text-[#fbb040] font-bold text-3xl">
                        {family.shortName}
                      </span>
                    )}
                  </div>
                  <div className="p-4 border-t border-neutral-100">
                    <p className="text-xs font-semibold text-[#fbb040] uppercase tracking-wide">
                      {family.cardEyebrow}
                    </p>
                    <h3 className="mt-1 font-semibold text-[#054A91]">
                      {family.displayName}
                    </h3>
                    <p className="mt-1 text-xs text-neutral-600 leading-snug line-clamp-2">
                      {family.tagline}
                    </p>
                    <div className="mt-3 flex items-baseline justify-between">
                      <span className="text-xs text-neutral-500">From</span>
                      <span className="text-lg font-semibold text-[#054A91]">
                        {formatFrom(minBySlug.get(family.slug) ?? null)}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}

        {/* Footer note */}
        <div className="mt-12 pt-6 border-t border-neutral-200 text-xs text-neutral-500 leading-relaxed">
          <p>
            Prices and specs subject to change without notice. All tariff taxes
            are passed on to buyers. All Arxys VideoX products are NDAA
            compliant with no disclosures. Windows Server IoT for Storage
            Workgroup EULA and Microsoft conditions apply.
          </p>
          <p className="mt-2">
            © Arxys 2026 · VideoX© · DataX© · AnalyticX© ·{" "}
            <a
              href="https://www.arxys.com"
              className="text-[#054A91] hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              www.arxys.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
