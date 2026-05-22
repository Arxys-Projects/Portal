# Phase 2 Step 8b — HTML Price Book implementation

> **Single-step brief. One execution session, one commit.**
>
> **Model recommendation**: **Sonnet 4.6** with extended thinking enabled ("high").
>
> **Prerequisite**: Step 8a mockup approved (variant A — "datasheet card" style) by Andy. Living at `docs/phase-2/mockups/step-8a/` with `index.html`, `v400-detail.html`, hero images in `assets/`, and a README describing the layout decisions.

## What this step is

Convert the approved Step 8a mockup into a real Next.js price book inside the partner portal. Two routes (`/price-book` index + `/price-book/[slug]` family detail), data-driven from a `families.ts` source file + live Supabase `products` join, branded per arxys.com, fully responsive, print-friendly.

## What this step is NOT

- **Not a new XLSX surface.** Step 7 already ships the partner XLSX download.
- **Not a calculator integration.** Calculator stays separate.
- **Not a per-partner discount layer.** MSRP-only per ADR 0030 PQ3.
- **Not editable via admin UI.** Per Andy 2026-05-22: solo user, automated > manual. Content lives in `families.ts`; edits = file edit + git push + Vercel rebuild. Prices = Sheet → push-prices.ts (existing).
- **Not a portal-wide brand refactor.** New navy primary + Poppins are scoped to `/price-book/*` routes only via a route-local CSS scope. Rest of portal unchanged.
- **Not a per-SKU detail page.** Drill-down stops at family. SKU rows live inline in family pages.

## Why Sonnet 4.6 high

- Mockup already exists as static HTML — translation work, not design work.
- All content extracted: PDF text per family lives at `/tmp/arxys-pricebook.txt`; per-family content is also reproducible from the PPTX text export documented in the JOURNAL.
- All visual decisions are locked in the mockup. No "should we put X here" reasoning needed.
- Real surfaces to build: route handlers, data file, Supabase join, dashboard card, nav link, tests.

## Context to read first

1. **[`docs/phase-2/mockups/step-8a/`](./mockups/step-8a/)** — the visual + structural spec. **READ THE MOCKUP HTML BEFORE WRITING ANY COMPONENT CODE.** Replicate the layout faithfully; don't re-design.
   - `index.html` — grid layout, card design, compliance badges strip
   - `v400-detail.html` — hero + quick stats + key features + tech specs + SKU table + upgrade table + fine print + datasheet button + VSR tooltip + compliance badges
   - `README.md` — design notes + brand tokens
2. **[`AGENTS.md`](../../AGENTS.md)** — Next.js 16 caveats. Route Handlers are NOT pages; pages are NOT Route Handlers.
3. **[`docs/JOURNAL.md`](../JOURNAL.md)** — Phase 2 Steps 3+4 (schema), 5+6 (real pricing live), 7 (XLSX). Step 8 entry to be appended.
4. **[`docs/decisions/0030-phase-2-scope-and-locked-decisions.md`](../decisions/0030-phase-2-scope-and-locked-decisions.md)** — Goal 5 (HTML price book replaces Slides) + PQ3 (MSRP-only).
5. **[`docs/decisions/0031-step-3-4-schema-migration.md`](../decisions/0031-step-3-4-schema-migration.md)** — `products` table shape: `sku, product_name, msrp, price_type, product_group, sort_order, active, max_cameras, max_storage_tb`.
6. **[`src/app/(app)/dashboard/page.tsx`](../../src/app/(app)/dashboard/page.tsx)** — dashboard layout. Add a "Price Book" card alongside Calculator / Submissions / Price List XLSX.
7. **[`src/app/(app)/layout.tsx`](../../src/app/(app)/layout.tsx)** — top nav. Add a "Price Book" link.
8. **[`src/app/globals.css`](../../src/app/globals.css)** — Tailwind 4 `@theme inline` block where Arxys tokens are declared. Add navy + Poppins here.

## Andy's prereqs — all locked from mockup review

| Locked | Decision | Source |
|---|---|---|
| Variant A (datasheet card) | Approved | Andy 2026-05-22 |
| Brand: navy `#054A91` primary + Poppins headings scoped to /price-book/* | Approved | mockup |
| Datasheet URL pattern | `https://www.arxys.com/wp-content/uploads/Arxys-VideoX-Factsheet-{FAMILY}-V5.pdf` (FAMILY = product_group, uppercase) | Andy 2026-05-22 |
| v700/v800 hero | Accept LOWRES for now; replace later | Andy 2026-05-22 |
| Additions | Compliance badges row + VSR tooltip + print stylesheet | Andy 2026-05-22 |
| Page grouping | One card per family-page concept (V250 page = V250 + V255 SKUs, V260 page = V260 + V270 SKUs, others 1:1) | PPTX layout |
| Editability | Pure data-driven, no admin UI. families.ts + Supabase. | Andy 2026-05-22 |

No further Andy questions before execution — surface for clarification only if PDF/PPTX content is genuinely ambiguous.

## Family inventory + content source

The PPTX has 10 family-page concepts (slides 5–14). The portal price book mirrors this 1:1.

| Slug | Display name | product_group(s) | PPTX slide | Hero image |
|---|---|---|---|---|
| `v100` | V100 — 1U 2Bay Value Server | `V100`, `V150` (V150 has its own table on the V100 page) | 5 | `v100-hero.png` |
| `v250` | V250 — Management/Directory Server | `V250`, `V255` (same table, tier variants) | 6 | `1u-chassis-hero.png` |
| `v260` | V260 — ACM Server | `V260`, `V270` (same table, tier variants) | 7 | `1u-chassis-hero.png` |
| `v200` | V200 — 1U 4Bay Video Server | `V200` | 8 | `1u-chassis-hero.png` |
| `v400` | V400 — 2U 8Bay Video Server | `V400` | 9 | `v400-v500-hero.png` |
| `v500` | V500 — 2U 12Bay Video Server | `V500` | 10 | `v400-v500-hero.png` |
| `v600` | V600 — 3U 16Bay Video Server | `V600` | 11 | `v600-hero.png` |
| `v700` | V700 — 4U 24Bay Video Server | `V700` | 12 | `v700-v800-hero-LOWRES.png` |
| `v800` | V800 — 4U 36Bay Video Server | `V800` | 13 | `v700-v800-hero-LOWRES.png` |
| `sw` | Security Workstations | `SW10`, `SW20`, `SW25`, `SW30`, `SW35` (all in one table) | 14 | one of image14/15/16/17/20 from PPTX — verify visually |

**Note on V150**: The V100 PPTX page contains a small secondary SKU table for V150 ACM. On the portal, render V150 as a **second tier-table on the V100 family page**, below the main V100 SKU table. Title the section "V150 ACM — Value Management Server".

**Note on SW page**: The SW page has a DIFFERENT table structure than V-family pages — it has columns `SKU | Product | Maximum Camera Bandwidth | Maximum Monitors | MSRP` instead of `SKU | Product | Net Usable Storage | MSRP`. The family-detail template must accept a custom column set, OR the SW page is a special-case template. **Recommendation: parameterize the SKU table column set in `families.ts` as `skuTableColumns: SkuColumn[]`** so the template is generic.

**Note on VX5-PP5-V100**: This is a "5 Year Protection Plan" extension SKU listed on the SW workstation page (slide 14) as an upgrade option. Render in the SW page's upgrade options section.

## Code work — file-by-file

### 1. `src/app/globals.css` — add navy + Poppins (route-scoped)

Add to the existing `@theme inline` block:

```css
--color-arxys-navy: #054A91;
--color-arxys-navy-deep: #03396f;
--color-arxys-navy-soft: #f0f5fa;
--font-poppins: "Poppins", system-ui, sans-serif;
```

At the top of `globals.css`, add a Google Fonts import:

```css
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=Montserrat:wght@400;500;600&display=swap');
```

Then a scoped class for the price book route boundary:

```css
.price-book-route h1,
.price-book-route h2,
.price-book-route h3,
.price-book-route h4 {
  font-family: var(--font-poppins);
}
```

The `/price-book` layout wraps children in `<div className="price-book-route">` so the scope holds.

### 2. `src/lib/price-book/families.ts` — content data

Full module with all 10 families. Schema:

```ts
import "server-only";

export type SkuColumn = "sku" | "product" | "netStorage" | "ssdStorage" | "bandwidth" | "monitors" | "msrp";

export type FamilyKpi = {
  label: string;       // "Max VSR"
  value: string;       // "200"
  unit: string;        // "streams"
};

export type FamilyTierSection = {
  // Some families (V100, V250, V260) have a second tier-table on the same
  // page. Most have null.
  title: string;       // "V150 ACM — Value Management Server"
  productGroups: string[];   // ['V150']
  columns: SkuColumn[];      // typically ['sku', 'product', 'ssdStorage', 'msrp']
  caption?: string;          // optional below-table note
};

export type Family = {
  slug: string;              // 'v400' — URL slug + lower-case product_group
  displayName: string;       // 'V400 — 2U 8Bay Video Server'
  eyebrow: string;           // 'VideoX V5 · 2U 8-Bay Video Server'
  shortName: string;         // 'V400'
  tagline: string;           // 'Strong security and reliable performance for medium to medium-large deployments.'
  greatFor: string;          // full paragraph from PPTX
  keyFeatures: string[];     // 5 bullets from PPTX
  technicalSpecs: string[];  // 5 bullets from PPTX
  kpis: FamilyKpi[];         // 3 quick-stats tiles
  productGroups: string[];   // ['V400'] — joins to products.product_group; SKUs in main table
  skuTableColumns: SkuColumn[];  // typically ['sku', 'product', 'netStorage', 'msrp']
  tierSections: FamilyTierSection[];  // additional tier tables (V100 → V150, etc); usually empty
  heroImage: string;         // '/price-book/v400-v500-hero.png'
  datasheetUrl: string | null;  // null hides the button; otherwise the arxys.com URL
  sortOrder: number;
};

export const FAMILIES: Family[] = [
  // V100 — 1U 2Bay Value Server
  // V150 — secondary tier on V100 page
  // V200 — 1U 4Bay Video Server
  // V250 — Management
  // V260 — ACM
  // V400 — 2U 8Bay Video Server
  // V500 — 2U 12Bay Video Server
  // V600 — 3U 16Bay Video Server
  // V700 — 4U 24Bay Video Server
  // V800 — 4U 36Bay Video Server
  // SW — Security Workstations
];

// Datasheet URL generation per Andy 2026-05-22.
export function datasheetUrlFor(productGroup: string): string {
  return `https://www.arxys.com/wp-content/uploads/Arxys-VideoX-Factsheet-${productGroup}-V5.pdf`;
}
```

**Content seed source**: every text field comes from `/tmp/arxys-pricebook.txt` (the pdftotext extraction). Specifically the per-family blocks under each "VideoX V5 - <Family>" header on PPTX pages 5–14. Lift verbatim — don't paraphrase. Key fields per PPTX section:

- `eyebrow` = page title minus the "VideoX V5 - " prefix
- `tagline` = first sentence of the GREAT FOR block
- `greatFor` = full GREAT FOR paragraph
- `keyFeatures` = the 5–6 bullets under "KEY FEATURES"
- `technicalSpecs` = the 5–6 bullets under "TECHNICAL SPECS"
- `kpis` = `[Max VSR ##, ## Mbps throughput, 5-year warranty]` derived from the bullets. SW page has different KPIs — see PPTX page 14.
- `productGroups` = list of product_group strings appearing in the page's SKU table(s)
- `datasheetUrl` = compute via `datasheetUrlFor(family.shortName)` for families with a single product group; for combined pages (V100+V150, V250+V255, V260+V270) use the primary family's group; SW uses `Arxys-VideoX-Factsheet-SW-V5.pdf` (verify URL liveness)
- `sortOrder` = 1–10 in the order above

### 3. `src/app/(app)/price-book/layout.tsx` — route-scoped wrapper

```tsx
export default function PriceBookLayout({ children }: { children: React.ReactNode }) {
  return <div className="price-book-route">{children}</div>;
}
```

### 4. `src/app/(app)/price-book/page.tsx` — index page

Server Component. Reads `FAMILIES` from families.ts. For each family, queries Supabase products for the family's product_groups to get the minimum MSRP for the "From $X,XXX" display. Renders the layout from `mockups/step-8a/index.html` verbatim — port HTML→JSX, replace data with real values.

Pseudocode for the price-from join:

```ts
const supabase = await createSupabaseServerClient();
const allGroups = FAMILIES.flatMap(f => f.productGroups);
const { data: products } = await supabase
  .from("products")
  .select("product_group, msrp, price_type")
  .eq("active", true)
  .in("product_group", allGroups);

// For each family: min(msrp) across its product_groups where price_type='numeric'
const minByFamily = new Map<string, number | null>();
for (const f of FAMILIES) {
  const familyProducts = (products ?? []).filter(p =>
    f.productGroups.includes(p.product_group) && p.price_type === "numeric" && p.msrp != null
  );
  minByFamily.set(f.slug, familyProducts.length > 0
    ? Math.min(...familyProducts.map(p => Number(p.msrp)))
    : null);
}
```

Render the grid grouped by family categories (NVR/Mgmt/ACM 5yr; Video & Analytics 5yr; High-Density 5yr; Workstations). The grouping can live in families.ts as a `category` field on each family if cleaner than hardcoding in the page.

### 5. `src/app/(app)/price-book/[slug]/page.tsx` — family detail

Server Component. Reads `FAMILIES.find(f => f.slug === params.slug)`. If not found, `notFound()`. Queries Supabase products filtered by `product_group in family.productGroups`. Renders the layout from `mockups/step-8a/v400-detail.html` verbatim — port HTML→JSX, replace data.

SKU table rendering: each `Family.skuTableColumns` entry maps to a column header + cell renderer. Tier sections render the same table with their own column set + product_groups filter.

Upgrade options: a separate query for products with `product_group in ['GPU', 'NIC', 'RAM']` (or whatever the universal upgrade products are). For SW family, also include `PP5` (warranty extension). Consider hardcoding the upgrade SKU list per family in families.ts as `upgradeSkus: string[]` if the per-family upgrade list varies — let the PPTX content guide.

VSR tooltip: use a native `<details><summary>` element matching the mockup HTML so no client JS is needed.

Print stylesheet: copy the `@media print` rules from the mockup into the `globals.css` `.price-book-route` scope.

Datasheet button: render only if `family.datasheetUrl !== null`. Link target="_blank" rel="noopener noreferrer".

### 6. `public/price-book/` — image migration

Copy from `docs/phase-2/mockups/step-8a/assets/` to `public/price-book/`:

```bash
mkdir -p public/price-book
cp docs/phase-2/mockups/step-8a/assets/*.png public/price-book/
```

References in families.ts use `/price-book/v400-v500-hero.png` etc. The `v700-v800-hero-LOWRES.png` keeps its name as a flag — JOURNAL records the known asset issue.

For SW workstation hero: view the PPTX media images (image14/15/16/17/20) and pick the most representative shot. Copy to `public/price-book/sw-hero.png`.

### 7. `src/app/(app)/dashboard/page.tsx` — add a Price Book card

Insert a new card alongside Calculator / Submissions / Price List XLSX. Same styling pattern as existing cards. Link → `/price-book`. Card content:

```
VideoX V5 Price Book
Browse families, specs, and current MSRPs.
Open price book →
```

### 8. `src/app/(app)/layout.tsx` — top nav link

Add "Price Book" link to the existing header nav alongside Dashboard / Calculator / Submissions. Active state when route starts with `/price-book`.

### 9. `src/lib/price-book/families.test.ts` — sanity tests

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FAMILIES, datasheetUrlFor } from "./families";

describe("FAMILIES", () => {
  it("has unique slugs", () => {
    const slugs = FAMILIES.map(f => f.slug);
    assert.equal(new Set(slugs).size, slugs.length);
  });
  it("every family has at least one productGroup", () => {
    for (const f of FAMILIES) {
      assert.ok(f.productGroups.length > 0, `${f.slug} has no productGroups`);
    }
  });
  it("sortOrder is dense and unique", () => {
    const sorted = [...FAMILIES].sort((a, b) => a.sortOrder - b.sortOrder).map(f => f.sortOrder);
    for (let i = 0; i < sorted.length; i++) {
      assert.equal(sorted[i], i + 1, "sortOrder must be 1..N");
    }
  });
  it("datasheetUrlFor follows arxys.com convention", () => {
    assert.equal(
      datasheetUrlFor("V400"),
      "https://www.arxys.com/wp-content/uploads/Arxys-VideoX-Factsheet-V400-V5.pdf",
    );
  });
});
```

### 10. (Optional) Datasheet URL liveness probe — one-off script

Before going live, verify each `datasheetUrl` returns 200. One-off script:

```bash
for f in V100 V200 V250 V260 V400 V500 V600 V700 V800 SW; do
  url="https://www.arxys.com/wp-content/uploads/Arxys-VideoX-Factsheet-${f}-V5.pdf"
  code=$(curl -sILk -o /dev/null -w "%{http_code}" "$url")
  echo "$f $code $url"
done
```

For any family that returns 404, set `datasheetUrl: null` in families.ts. Log in JOURNAL: "Datasheet URL liveness probe — N of 10 families have published datasheets; <list> awaiting publish".

## Verification gates

1. `npm run lint` — 0 errors. (Pre-existing `<img>` warnings from Step 1 are OK.)
2. `npm run build` — clean, **+2 routes** (`/price-book`, `/price-book/[slug]`).
3. `npm test` — all pass (existing + new families.test.ts).
4. **Manual smoke** (this is the critical gate — visual review is the point of Step 8):
   - `npm run dev`.
   - Sign in.
   - Dashboard shows new "Price Book" card.
   - Top nav shows "Price Book" link.
   - Click → `/price-book` renders the family grid.
   - Compliance badges row renders below the page hero.
   - Click any family card → `/price-book/<slug>` family detail renders.
   - Hero shows: chassis photo / family name / "Great For" / Download Datasheet button / 3-tile quick stats / VSR tooltip works on hover.
   - Compliance badges row below hero.
   - Key Features + Technical Specs in two columns with gold-star bullets.
   - SKU table with navy header, zebra stripes, real MSRPs from Supabase (numeric only).
   - Upgrade options table below.
   - Fine-print panel at the bottom.
   - Browser print preview (`Cmd+P`) → looks clean: no header/nav, datasheet button hidden, navy header treated.
5. **Datasheet links** — click "Download Datasheet" on 2–3 family pages; verify PDF opens at the arxys.com URL.
6. **Mobile responsive** — open DevTools, switch to mobile viewport. Grid collapses to 1-col, hero stacks, tables horizontally scroll cleanly.
7. **Legacy submission detail still works** — no regression to /submissions or /admin/submissions.
8. `scripts/test-rls.ts` — 10/10 pass. Price book is RLS-bound to `products` reads; existing policies cover it.

## Definition of done

- [ ] `src/lib/price-book/families.ts` fully populated for all 10 families (V100 + V150, V200, V250+V255, V260+V270, V400, V500, V600, V700, V800, SW). Content lifted from `/tmp/arxys-pricebook.txt` verbatim.
- [ ] Image migration: `public/price-book/*.png` populated; SW workstation hero chosen.
- [ ] `globals.css` adds navy + Poppins + route-scoped class + print styles.
- [ ] `/price-book` + `/price-book/[slug]` routes built matching the mockup.
- [ ] Dashboard card + nav link added.
- [ ] `families.test.ts` written and passing.
- [ ] Datasheet URL liveness probe run; any 404 families have `datasheetUrl: null`; JOURNAL records which.
- [ ] All 8 verification gates green.
- [ ] JOURNAL entry written ("Phase 2 Step 8 — HTML price book live").
- [ ] Optional ADR if any non-obvious decision surprises you (e.g. the page-grouping rule for V100/V150 or V250/V255).
- [ ] Working tree clean; one coherent commit.
- [ ] **Don't push without Andy's nod.**
- [ ] Delete `docs/phase-2/mockups/step-8a/` directory as part of the commit (superseded by the real implementation). Keep `docs/phase-2/step-8b-price-book-implementation.md` (this brief) until JOURNAL entry lands; then delete in the same commit.

## Open questions to surface during execution

Most decisions are locked. Surface to Andy ONLY if you hit:

1. **Datasheet URL 404 for unexpected families.** If V400/V500/V600 return 404 — Andy hadn't published them yet. Ask before going live: ship with null buttons, or wait?
2. **SW workstation hero unclear.** Multiple workstation images in the PPTX; if none reads as the obvious hero, ask Andy.
3. **Upgrade SKU list per family.** The PPTX shows different upgrade SKUs on different family pages (e.g. V400 page has SFP28x25 transceivers; V100 page only has GPU-A1000). Encoding which upgrades are relevant per family adds complexity — surface for Andy to confirm: per-family upgrade list, or universal upgrade list with caveats per family?
4. **V250 vs V255 tier rendering.** Single SKU table with both rows, or two separate "tier" tables? The PPTX has them in one table. Default: one table.

## Lessons from prior Phase 2 steps to carry into this step

- **Manual dev-server smoke is the only catch for visual/print/Content-Disposition issues.** Build + tests can't see the rendered page. Don't defer the smoke.
- **PostgREST embed-via-FK doesn't work for `products` joined from anywhere that lost its FK.** Use explicit SKU lookups (Step 3+4 lesson). The price book queries `products` directly by `product_group` — no embed needed; safe.
- **When introducing new fonts**, the FOIT (flash of invisible text) hurts page-load perception. The Google Fonts `display=swap` parameter handles it.
- **Adding a new dependency**: not applicable for this step — no new packages needed.

## Out of scope reminders

- No partner-discount column or per-user pricing.
- No admin UI for editing families.ts.
- No CMS.
- No per-SKU detail page (drill-down ends at family).
- No price-history / change-log page.
- No PDF generation from family pages (the Slides+Sheets PDFs are the canonical Source — the portal links out).
- No portal-wide brand refactor (other portal pages keep current styling).
- No new database migrations (zero schema changes).

## Effort estimate

**1.5–2 days focused Sonnet 4.6 high.**

- families.ts data seeding (10 families, ~30 fields each, all lifted from PDF text): 2–3 hrs of clerical work.
- Layout component port (mockup HTML → JSX with Tailwind classes): 2 hrs.
- Supabase price-min join + family detail SKU query: 1 hr.
- Image migration + SW hero pick: 30 min.
- globals.css updates + Poppins import + scoped class + print styles: 30 min.
- Dashboard card + nav link: 20 min.
- Tests: 30 min.
- Datasheet URL liveness probe + react to 404s: 30 min.
- Manual smoke + responsive check + print preview: 1 hr.
- JOURNAL entry + commit: 30 min.
- Buffer: 1–2 hrs.

## When you finish

1. All 8 verification gates green.
2. JOURNAL entry written.
3. Delete `docs/phase-2/mockups/step-8a/` directory and `docs/phase-2/step-8b-price-book-implementation.md` (this brief) as part of the commit. The JOURNAL entry replaces both as canonical record.
4. One coherent commit. Example subject: `feat(price-book): HTML price book index + family pages`.
5. **Don't push without Andy's nod.**
6. Summary back to Andy: route count, screenshots if possible (or specific page paths to spot-check), datasheet liveness summary (X/10 live), anything unexpected.
