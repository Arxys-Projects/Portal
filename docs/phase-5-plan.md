# Portal Phase 5 — Competitive Server Comparison Tool

> **Status: Complete (2026-05-29).** All three steps done.

Phase 5 ports the VMS server comparison calculator from the WordPress marketing site
into the authenticated partner portal. The core logic is simpler than Phase 4 — it is
a lookup table with a display engine, not a workload algorithm. The main new
infrastructure is two additive tables (Arxys product specs and competitor models),
seeded directly from the production JSON that already drives the WP plugin.

The portal version is meaningfully better than the public one in three ways: the lead
form (4 required fields) disappears entirely because the partner is already
authenticated; the Pipedrive integration is fully wired from day one (the WP plugin
has all custom fields commented out as TODOs); and Arxys gains competitive
intelligence — which vendor models authenticated partners are actively researching.

Three steps:

- **Step 1 — Schema + seed. ✅ DONE (2026-05-29).** Two additive migrations:
  `product_specs` (21 Arxys VideoX rows) and `competitor_products` (34 competitor
  rows — 14 Milestone Husky IVO, 20 Avigilon NVR6), seeded inline from the production
  JSON. Update script at `scripts/update-comparison-data.ts` for future refreshes.
- **Step 2 — Comparison UI.** The interactive tool: vendor/model selects, spec
  comparison table with advantage column, pricing input, deployment multiplier slider,
  callouts. Auth-gated Server Component + client state. Dashboard card linking to
  `/comparison`.
- **Step 3 — PDF + quote action.** Comparison PDF via the existing
  `@react-pdf/renderer` infrastructure; a "Get My Quote" Server Action that creates a
  Pipedrive deal + sends an internal email, reusing the existing `pipedriveClient`
  and `buildDealFields` patterns.

## Naming

**Portal Phase 5** = this work. **Phase 5 Step N** = a discrete work unit.

## Locked decisions

- **(locked) Data source: seeded from the production JSON, not through the pricing
  pipeline.** `data/server-specs.json` is the source of truth. Both tables seeded via
  migration; refreshed via `scripts/update-comparison-data.ts`.
- **(locked) Arxys spec data lives in `product_specs`, not as added columns on
  `products`.** Keeps comparison data decoupled from the pricing pipeline.
- **(locked) `competitor_products` is a new table.** `arxys_match_id text REFERENCES
  product_specs(id)`. Avigilon `msrp_current` seeds as NULL.
- **(locked) `display_specs` and `messages` are TypeScript constants, not DB
  tables.** Same pattern as `STAGE_PROBABILITY` in Phase 4 forecast.ts.
- **(locked) No lead capture form.** Partner is authenticated; "Get My Quote" CTA
  uses the existing partner record.
- **(locked) Pipedrive deal creation on quote request.** Reuses `pipedriveClient` +
  `buildDealFields`. Deal title prefix "Comparison:" distinguishes from sizing deals.
- **(locked) MSRP only + partner discount note for v1.** Arxys MSRP from
  `product_specs.msrp`; note says "your partner discount applied at checkout." No new
  fields on partners table.
- **(locked, OQ-1 confirmed) Separate `product_specs` table.** Not extending
  products.
- **(locked, OQ-2 confirmed) Inline SQL seed.** All 21+34 rows as INSERTs in the
  migration file.
- **(locked, OQ-3 confirmed) Advantage column: numeric delta for numeric fields;
  fixed badge for highlighted string fields.** String fields with
  `highlight_if_better = YES` always show "Arxys advantage" — no string-matching
  logic needed.
- **(locked) `cpu_architecture` JSON field → `cpu_passmark` DB column.** The JSON
  field name is misleading; DB and TypeScript use `cpu_passmark` for clarity.

## Work-unit table

| # | Title | Depends on | Status |
|---|---|---|---|
| **Step 1** | Schema + seed | none | ✅ Done 2026-05-29 |
| **Step 2** | Comparison UI | Step 1 | ✅ Done 2026-05-29 |
| **Step 3** | PDF + quote action | Step 2 | ✅ Done 2026-05-29 |

---

## Step 2 — Comparison UI

**Code work:**
- New `src/lib/comparison/data.ts`: `getComparisonData()` — server-side fetches all
  rows from both tables and returns typed arrays.
- New `src/app/(app)/comparison/page.tsx`: Server Component; calls
  `getComparisonData()`, passes `competitorProducts` (grouped by vendor),
  `productSpecs` (indexed by id), `DISPLAY_SPECS` constant, and `MESSAGES` constant
  as props to the client form.
- New `src/lib/comparison/display-specs.ts`: `DISPLAY_SPECS: DisplaySpec[]` and
  `MESSAGES: ComparisonMessage[]` TypeScript constants derived from `display_specs`
  and `messages` arrays in `data/server-specs.json`. Use `cpu_passmark` as spec key
  (not `cpu_architecture`).
- New `src/app/(app)/comparison/comparison-form.tsx`: client component. State:
  `selectedVendor`, `selectedModelId`, `userPrice` (string), `serverCount` (number,
  1–25). Derived: `vendorModel`, `arxysModel`, `priceDelta`, `deploymentTotal`.
  Renders: two selects → results panel (spec table + pricing row + multiplier slider
  + callouts + action buttons). Results hidden until model is selected.
- `src/app/(app)/dashboard/page.tsx`: add comparison tool card alongside existing
  cards.
- Read `src/app/(app)/calculator/calculator-form.tsx` first for state +
  conditional-render patterns to match.

**Verification gates:** `npm run build` clean · `npm run lint` 0 new errors ·
`npm test` green · `scripts/test-rls.ts` green · manual smoke: select Milestone →
all 14 models appear; select Avigilon → all 20 models; pick a model → full spec table
renders with correct advantage highlights; pricing delta and multiplier update live;
dashboard card links to /comparison.

**ADR during execution:** none required (standard pattern).

---

## Step 3 — PDF + quote action

**Code work:**
- New `src/lib/pdf/comparison-template.tsx`: `@react-pdf/renderer` template for the
  comparison. Read `src/lib/pdf/render.ts` first to match its Document/Page/styles.
- New `src/app/(app)/api/comparison/pdf/route.ts`: auth-gated PDF route, mirrors
  `src/app/(app)/api/price-book/xlsx/route.ts` structure.
- New `src/app/(app)/comparison/actions.ts`: `requestComparisonQuote(payload)` Server
  Action. Payload: `vendorName`, `vendorModelName`, `arxysModelId`, `arxysMsrp`,
  `serverCount`. Creates Pipedrive deal via new `createComparisonDeal()` wrapper in
  `src/lib/pipedrive/deal.ts`. Sends internal notification email. No PDF attachment,
  no partner email.
- Wire "Download PDF" and "Get My Quote" buttons in `comparison-form.tsx`.

**Verification gates:** build · lint · tests · RLS · manual: PDF renders correct
spec table + footer; "Get My Quote" creates Pipedrive deal with title prefix
"Comparison:" and correct value/note; internal email fires; no duplicate deal on
second click.

**ADR during execution:** `0043-comparison-pipedrive-deal.md` (deal distinction,
lead_source field, same-pipeline rationale).

---

## Out of scope / future

- `comparison_submissions` table for portal-side competitive intelligence.
- Partner discount applied to Arxys MSRP (requires `discount_pct` on partners).
- Genetec Security Center as a third VMS vendor.
- Admin UI to update comparison data without running the script.

## References

- `data/server-specs.json` — authoritative seed source.
- `supabase/migrations/20260529000001_phase5_product_specs.sql`
- `supabase/migrations/20260529000002_phase5_competitor_products.sql`
- `scripts/update-comparison-data.ts` — future refresh mechanism.
- `src/lib/comparison/types.ts` — shared types.
- `src/lib/pipedrive/{client,deal}.ts` — Pipedrive infrastructure (Step 3).
- `src/lib/pdf/render.ts` + `src/app/(app)/api/price-book/xlsx/route.ts` — PDF
  patterns (Step 3).
- `src/app/(app)/calculator/{calculator-form,actions,page}.tsx` — client state +
  Server Action patterns (Steps 2+3).
- `src/app/(app)/dashboard/page.tsx` — dashboard card placement (Step 2).
- `docs/decisions/0042-comparison-data-architecture.md` — Step 1 ADR.
