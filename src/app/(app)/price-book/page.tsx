import Link from "next/link";
import Image from "next/image";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  FAMILIES,
  FAMILY_CATEGORIES,
  type Family,
} from "@/lib/price-book/families";
import Footer from "@/app/(app)/_components/footer";

function formatFrom(msrp: number | null): string {
  if (msrp == null) return "—";
  return `$${msrp.toLocaleString("en-US")}`;
}

export default async function PriceBookIndexPage() {
  const supabase = await createSupabaseServerClient();

  const allGroups = FAMILIES.flatMap((f) => f.productGroups);
  const { data: products } = await supabase
    .from("current_products")
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
    "workstations",
  ];

  const sections = categoryOrder.map((cat) => ({
    cat,
    ...FAMILY_CATEGORIES[cat],
    families: sorted.filter((f) => f.category === cat),
  }));

  return (
    <div>
      {/* ── Page hero ── */}
      <section className="bg-[linear-gradient(135deg,#173a72,#0d2247)] text-white -mx-4 -mt-8 px-4 py-5">
        <div className="mx-auto max-w-5xl flex flex-col md:flex-row md:items-center md:justify-between gap-8">
          {/* Left: copy */}
          <div className="flex-1">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-[#fbb040] font-semibold text-4xl uppercase leading-tight">
                VIDEOX V5
              </span>
              <h1 className="text-4xl font-semibold leading-tight">
                MSRP Price Book
              </h1>
            </div>
            <p className="mt-3 text-white/90 max-w-2xl text-sm leading-relaxed">
              Purpose-built IP video servers for demanding VMS workloads. Run
              H.265 at line speed, double camera counts per server, and protect
              30% more margin than Dell-branded quotes.
            </p>
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-white tracking-wide">
                Effective: 05/05/2026
              </span>
              <span className="text-white/60">·</span>
              <a
                href="https://www.arxys.com/videox-appliances/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-white/70 hover:text-white underline"
              >
                View all VideoX Appliances on arxys.com →
              </a>
            </div>
          </div>

          {/* Right: product images */}
          <div className="flex items-center gap-4 shrink-0">
            <Image
              src="/price-book/Windows_Server_2022.png"
              alt="Microsoft Windows Server 2022 and 2025"
              width={120}
              height={100}
              className="object-contain"
            />
            <Image
              src="/price-book/5_year_warranty-circle-2.png"
              alt="Five Year Warranty"
              width={100}
              height={100}
              className="object-contain"
            />
          </div>
        </div>
      </section>

      {/* ── H.265 + Enterprise Grade (two-column row) ── */}
      <div className="mx-auto max-w-5xl mt-8">
        <div className="grid grid-cols-1 md:[grid-template-columns:38%_62%] rounded-lg border border-line overflow-hidden">
          {/* Left 38% — H.265 performance */}
          <section className="bg-[#14346b] text-white border-r border-white/10 p-5">
            <div className="flex items-center gap-3 mb-3">
              <span className="inline-block rounded border border-[#fbb040] px-2 py-0.5 text-xs font-bold text-[#fbb040] tracking-widest uppercase">
                H.265 HEVC
              </span>
            </div>
            <h2 className="text-2xl font-semibold leading-snug">
              VideoX V5 Drives H.265 Performance
            </h2>
            <p className="mt-2 text-white/85 text-sm leading-relaxed">
              V5&apos;s AMD Zen5 architecture delivers 2.3x more H.265 streams
              per server, eliminating the performance penalty that forces most
              NVRs to fall back to H.264. Run modern codecs at full speed
              without compromising camera counts or analytics.
            </p>
            <div className="mt-4">
              <a
                href="https://www.arxys.com/videox-v5-launch-deliver-on-the-promise-of-h-265-today/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded bg-[#fbb040] px-5 py-2.5 text-sm font-semibold text-[#1a1205] transition hover:bg-[#eaa52c]"
              >
                Learn More →
              </a>
            </div>
          </section>

          {/* Right 62% — Enterprise Grade */}
          <div className="bg-white p-5">
            <p className="font-bold text-ink text-sm mb-3">
              Enterprise Grade:{" "}
              <span className="font-normal">
                Arxys VideoX servers come standard with:
              </span>
            </p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm text-ink">
              <ul className="space-y-1.5">
                {[
                  "Microsoft Windows Server 2022 or 2025",
                  "Dedicated secure remote management",
                  "Hot-swap, enterprise-class HDDs and SSDs",
                  "Resilient Hardware RAID with cachevault protection",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1 w-2 h-2 rounded-full bg-[#fbb040] shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <ul className="space-y-1.5">
                {[
                  "Hot-swap and redundant power and cooling",
                  "Rack slide rails, and lockable drive access",
                  "Multi-VMS Validated: Milestone, Avigilon, Genetec, NXWitness, Hanwha, Exacq, Axxonsoft",
                  "NDAA Compliant · American Made",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1 w-2 h-2 rounded-full bg-[#fbb040] shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* ── Family grid ── */}
      <div className="mx-auto max-w-5xl py-10">
        {sections.map((section) => (
          <div key={section.cat} className="mt-10 first:mt-0">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
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
                  className="group block rounded-lg border border-line bg-white overflow-hidden hover:border-[#14346b] transition"
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
                      <span className="text-[#c17f10] font-bold text-3xl">
                        {family.shortName}
                      </span>
                    )}
                  </div>
                  <div className="p-4 border-t border-line-soft">
                    <p className="text-xs font-semibold text-[#c17f10] uppercase tracking-wide">
                      {family.cardEyebrow}
                    </p>
                    <h3 className="mt-1 font-semibold text-[#14346b]">
                      {family.displayName}
                    </h3>
                    <p className="mt-1 text-xs text-ink-soft leading-snug line-clamp-2">
                      {family.tagline}
                    </p>
                    <div className="mt-3 flex items-baseline justify-between">
                      <span className="text-xs text-ink-soft">From</span>
                      <span className="text-lg font-semibold text-[#14346b]">
                        {formatFrom(minBySlug.get(family.slug) ?? null)}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}

        {/* Disclaimer + footer */}
        <div className="mt-12 pt-6 border-t border-line text-xs text-ink-soft leading-relaxed">
          <p>
            Prices and specs subject to change without notice. All tariff taxes
            are passed on to buyers. Prices and quotes expire immediately upon
            new prices and quotes. Prices, specs and availability superseded by
            latest Arxys price list on that date. We put our best effort and
            knowledge to maintain the accuracy of specifications and price.
            Should there be any discrepancies we reserve the right to follow our
            specifications and pricing. In case of a newer component or part we
            reserve the right to change to the newer part at our discretion.
            Thanks for your understanding.
          </p>
        </div>
        <Footer />
      </div>
    </div>
  );
}
