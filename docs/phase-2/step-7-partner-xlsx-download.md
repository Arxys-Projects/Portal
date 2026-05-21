# Phase 2 Step 7 — Partner XLSX download (dashboard tool)

> **Single-step brief. One execution session, one commit.**
>
> **Model recommendation**: **Sonnet 4.6** with extended thinking enabled ("high"). Reasoning below.
>
> **Prerequisite**: Phase 2 Steps 5+6 landed. `products` table has the full ~36-row Master Sheet population with real MSRPs; partner-price display is live; ADR 0019 is closed.

## Why Sonnet 4.6 high

This is a small, mechanical feature: one library decision (XLSX generator), one new file (~80 lines for the generator), one new route handler (~40 lines), one dashboard card. No schema changes, no algorithm changes, no consumer cascade. Opus would be overkill.

## What this step is

Add a "Download price list" button to `/dashboard` that streams an XLSX of the current `products` table to any authenticated partner. MSRP-only. No discount logic. ~36 rows from Sheet → spreadsheet in one click. Goal 4 from ADR 0030.

## What this step is NOT

- **Not the HTML price book page (Step 8).** Step 7's XLSX is a downloadable artifact; Step 8 is an in-portal page.
- **Not a partner-discount mechanic.** PQ3 from ADR 0030 explicitly left partner pricing deferred to Step 8 scoping. Step 7 ships MSRP-only.
- **Not a CSV.** XLSX gives partners cell-formatted prices that Excel/Numbers/LibreOffice open natively without the locale-dependent CSV parsing headaches.
- **Not a per-product-group filter.** Single sheet, all active products, sorted by `sort_order`.
- **Not an email-attached XLSX on submission.** The submission PDF stays the per-submission artifact; the XLSX is the full catalog.
- **Not an admin-only feature.** Any authenticated partner gets the same MSRP-only XLSX. RLS already constrains `products` reads to `active=true` for non-admins.

## Context to read first

1. **[`AGENTS.md`](../../AGENTS.md)** — Next.js 16 caveat (Route Handlers, dynamic routes, no Node legacy APIs). **Heed the "this is NOT the Next.js you know" warning** — verify Route Handler signature against `node_modules/next/dist/docs/` before writing.
2. **[`docs/JOURNAL.md`](../JOURNAL.md)** — Phase 2 Steps 5+6 entry. Note current production data shape: 36 products, mix of numeric/MKT/CFQ rows, accessories + NVR + switches + GPUs.
3. **[`docs/decisions/0030-phase-2-scope-and-locked-decisions.md`](../decisions/0030-phase-2-scope-and-locked-decisions.md)** — Goal 4 + PQ3 (XLSX is MSRP-only).
4. **[`docs/decisions/0031-step-3-4-schema-migration.md`](../decisions/0031-step-3-4-schema-migration.md)** — `products` table shape: `sku`, `product_name`, `msrp` (nullable), `price_type`, `product_group`, `sort_order`, `active`, `max_cameras`, `max_storage_tb`.
5. **[`docs/proposals/phase-2-pricing-pipeline.md`](../proposals/phase-2-pricing-pipeline.md)** — "Phase 2 — Portal Price Book Page" section has the MKT/CFQ rendering convention ("Market Price" / "Call for Quote" strings). Step 7 follows the same convention for consistency with the future Step 8 page.
6. **[`src/lib/supabase/server.ts`](../../src/lib/supabase/server.ts)** — `createSupabaseServerClient()` for the Route Handler.
7. **[`src/app/api/submissions/[id]/pdf/route.ts`](../../src/app/api/submissions/%5Bid%5D/pdf/route.ts)** — existing precedent for "Route Handler that streams a binary file with Content-Disposition." Mirror this shape for the XLSX route. **Critical: this is the closest existing pattern to copy.**
8. **[`src/app/(app)/dashboard/page.tsx`](../../src/app/(app)/dashboard/page.tsx)** — current dashboard layout. Three cards today (Calculator, Submission history, Admin-conditional). Add a fourth card for the price book download.

## Andy's prereqs / decisions

Eight small decisions. Most have a clear default; ask only if you want to deviate.

### Q1 — XLSX library choice (the only real decision)

| Library | Size | Pros | Cons |
|---|---|---|---|
| **`exceljs`** | ~620 KB | Mature, full styling, streaming, widely recognized | Larger; slight API verbosity |
| `write-excel-file` | ~100 KB | Smallest, modern API, single-purpose | Less widely used; thinner ecosystem |
| `xlsx` (SheetJS CE) | ~1.6 MB | Famous, lots of docs | Apache-2.0 since 2024 but historically CVE-prone; sometimes feels abandoned |
| `xlsx-populate` | ~250 KB | Compact | Lower activity |
| CSV-with-.xlsx-extension | 0 KB | No dependency | Loses currency formatting; Excel sometimes parses with locale glitches |

- **Recommendation: `exceljs`.** Server-side only (no client-bundle impact); widely recognized; supports the cell-level `numFmt` API we want for currency formatting; future-compatible if Step 8's HTML price book ever shares generation logic.
- **Alternative if you want a lighter footprint: `write-excel-file`.** API is simpler; both work fine for our scale.
- **Andy decision needed.**

### Q2 — Where the download button lives

- **(a)** *(Recommended)* `/dashboard` — alongside Calculator + Submission history + Admin cards. Matches the brief's "dashboard widget" wording.
- **(b)** `/submissions` page header (next to "New calculation").
- **(c)** Both (small duplication, more discoverable).
- **Recommendation: (a) only.** The XLSX is reference data, not submission-related; dashboard is the right home. Adding it to `/submissions` would imply the downloaded file is tied to submissions, which it isn't.
- **Andy decision needed.**

### Q3 — Columns in the XLSX

Current `products` columns: `sku`, `product_name`, `msrp`, `price_type`, `product_group`, `sort_order`, `active`, `max_cameras`, `max_storage_tb`, `updated_at`.

- **(a)** *(Recommended)* `SKU | Product Name | Product Group | MSRP`. Four columns. Goal 4 specifies MSRP-only; the rest is reference data partners scan visually.
- **(b)** Add `Camera Capacity` + `Storage Capacity (TB)` columns. Only 6 of 36 rows have values (V-family); blank cells for the rest. Mildly noisy.
- **(c)** Include `Updated` column (per-row updated_at). Useful for partners tracking price changes; nice-to-have.
- **Recommendation: (a).** Tight, scannable, exactly what Goal 4 asked for. Add (b) or (c) later if partners request.
- **Andy decision needed.**

### Q4 — MKT / CFQ MSRP rendering

The Master Sheet has 1 MKT row (`VX5-RAM-32GB`) and 2 CFQ rows (`VX5-SW30-300`, `VX5-SW35-300`).

- **(a)** *(Recommended)* MSRP cell = `"Market Price"` for `price_type='market'`, `"Call for Quote"` for `price_type='call_for_quote'`. Matches the proposal's Step 8 HTML Price Book spec verbatim — Step 7 ships the convention first, Step 8 inherits.
- **(b)** MSRP cell = blank. Cleaner visually but loses information.
- **(c)** MSRP cell = `$0.00`. Confusing.
- **Recommendation: (a).** Convention consistency wins.
- **Andy decision needed.**

### Q5 — Filename convention

- **(a)** *(Recommended)* `Arxys-Price-List-YYYY-MM-DD.xlsx`. Mirrors the PDF filename pattern (`Arxys-Report-YYYY-MM-DD-<id>.pdf`).
- **(b)** `arxys-price-list.xlsx` — no date; always overwrites in Downloads folder.
- **(c)** `Arxys VideoX Price List - 2026-05-22.xlsx` — branded but spaces in filename can cause issues in some workflows.
- **Recommendation: (a).** Date-stamped + dashes-only.
- **Andy decision needed.**

### Q6 — Last-updated stamp in the file

- **(a)** *(Recommended)* Header rows at top of the sheet: row 1 title `"Arxys VideoX Price List"`, row 2 `"Generated <YYYY-MM-DD HH:MM UTC>"`, row 3 blank, row 4 = column headers, row 5+ = data.
- **(b)** No header rows; row 1 = column headers, row 2+ = data. Tighter but loses provenance.
- **Recommendation: (a).** Partners need to know when their copy was generated.
- **Andy decision needed.**

### Q7 — MSRP cell format

- **(a)** *(Recommended)* exceljs cell `numFmt: '"$"#,##0.00'`. Cell value is the raw number (`16640`), displayed as `$16,640.00`. Excel-friendly: partners can SUM, formula-reference, sort numerically.
- **(b)** Pre-formatted string `"$16,640.00"`. Pretty but breaks downstream formulas.
- **Recommendation: (a).** Numeric storage + currency display = best of both.

### Q8 — Caching posture for the Route Handler

Next.js 16 Route Handlers default to caching `GET` responses. The XLSX must always reflect the current `products` table.

- **(a)** *(Recommended)* Add `export const dynamic = 'force-dynamic'` to the route. Always re-queries Supabase; never serves stale data.
- **(b)** Add `export const revalidate = 60` for a 60-second cache. Tiny cost-saving but partners might see stale prices for up to 60s after a Step 5 push.
- **Recommendation: (a).** Until daily download volume becomes a cost concern, freshness > caching.

## Backup posture

Step 7 does **not** write to production data. No schema changes, no inserts, no updates. Read-only. Standard pre-deploy backup is unnecessary; the JSON dump pattern from Step 3+4 is overkill here.

## Code work — file-by-file task list

### 1. `package.json` + lockfile

Add `exceljs` (or whichever Q1 lands on) as a **runtime dependency** (not devDep — used in server-side Route Handler):

```
npm install exceljs
```

Verify with `npm run build` that Turbopack + Next.js 16 + exceljs play nicely. exceljs is pure JavaScript (no native bindings), so this should be a no-op.

### 2. New: `src/lib/price-book/xlsx.ts` (~80 lines)

Pure XLSX generation. No I/O, no Supabase, no Next.js. Takes a list of products + a timestamp; returns a `Buffer`.

```ts
import "server-only";
import ExcelJS from "exceljs";

export type PriceBookRow = {
  sku: string;
  product_name: string;
  product_group: string;
  msrp: number | null;
  price_type: "numeric" | "market" | "call_for_quote";
};

export async function generatePriceBookXlsx(
  rows: PriceBookRow[],
  generatedAt: Date,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Arxys Partner Portal";
  wb.created = generatedAt;

  const ws = wb.addWorksheet("Price List");

  // Title rows
  ws.mergeCells("A1:D1");
  ws.getCell("A1").value = "Arxys VideoX Price List";
  ws.getCell("A1").font = { bold: true, size: 14 };

  ws.mergeCells("A2:D2");
  ws.getCell("A2").value =
    `Generated ${generatedAt.toISOString().replace("T", " ").slice(0, 16)} UTC`;
  ws.getCell("A2").font = { italic: true, color: { argb: "FF6B7280" } };

  // Header row at row 4
  const headerRow = ws.getRow(4);
  headerRow.values = ["SKU", "Product Name", "Product Group", "MSRP"];
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFBB040" }, // Arxys Gold
    };
  });

  // Data rows
  rows.forEach((r, i) => {
    const dataRow = ws.getRow(5 + i);
    dataRow.getCell(1).value = r.sku;
    dataRow.getCell(2).value = r.product_name;
    dataRow.getCell(3).value = r.product_group;
    if (r.price_type === "numeric" && r.msrp !== null) {
      dataRow.getCell(4).value = r.msrp;
      dataRow.getCell(4).numFmt = '"$"#,##0.00';
    } else if (r.price_type === "market") {
      dataRow.getCell(4).value = "Market Price";
    } else if (r.price_type === "call_for_quote") {
      dataRow.getCell(4).value = "Call for Quote";
    }
  });

  // Column widths
  ws.getColumn(1).width = 18;
  ws.getColumn(2).width = 60;
  ws.getColumn(3).width = 14;
  ws.getColumn(4).width = 14;

  // exceljs returns Uint8Array in newer versions; ensure Buffer for Next.
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}

export function priceBookFilename(generatedAt: Date): string {
  const yyyy = generatedAt.getFullYear();
  const mm = String(generatedAt.getMonth() + 1).padStart(2, "0");
  const dd = String(generatedAt.getDate()).padStart(2, "0");
  return `Arxys-Price-List-${yyyy}-${mm}-${dd}.xlsx`;
}
```

### 3. New: `src/app/api/price-book/xlsx/route.ts` (~40 lines)

```ts
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generatePriceBookXlsx, priceBookFilename, type PriceBookRow } from "@/lib/price-book/xlsx";

// Always freshly query products; never cache the XLSX response.
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();

  // RLS gates this read: authenticated partners see active rows;
  // unauthenticated requests get nothing (and the layout proxy will
  // 302 them to /login before reaching here anyway).
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("products")
    .select("sku, product_name, product_group, msrp, price_type")
    .eq("active", true)
    .order("sort_order");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as PriceBookRow[];
  const generatedAt = new Date();
  const buffer = await generatePriceBookXlsx(rows, generatedAt);

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${priceBookFilename(generatedAt)}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
```

**Verify the route is auth-gated by either**: (a) the existing `proxy` middleware that bounces unauthenticated requests under `/api/*` to login, or (b) the explicit `user` check above. The PDF route at `src/app/api/submissions/[id]/pdf/route.ts` is the precedent — copy whichever pattern it uses.

### 4. `src/app/(app)/dashboard/page.tsx` — add the download card

Insert a new card alongside Calculator + Submission history. Same styling:

```tsx
<Link
  href="/api/price-book/xlsx"
  className="block rounded-lg border border-neutral-200 bg-white p-6 hover:border-arxys-gold hover:shadow-sm"
>
  <h2 className="text-lg font-semibold text-neutral-900">VideoX price list</h2>
  <p className="mt-2 text-sm text-neutral-600">
    Download the current VideoX MSRP price book as an Excel spreadsheet.
  </p>
  <p className="mt-3 text-sm font-medium text-arxys-gold">
    Download XLSX →
  </p>
</Link>
```

Note: a `<Link href>` to a Route Handler triggers a download on click. No JS handler needed because of the `Content-Disposition: attachment` header.

### 5. New: `src/lib/price-book/xlsx.test.ts` (~50 lines)

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { generatePriceBookXlsx, priceBookFilename, type PriceBookRow } from "./xlsx";

const FIXTURE: PriceBookRow[] = [
  { sku: "VX5-V800-720", product_name: "VideoX V800 720TB ...", product_group: "V800", msrp: 74048, price_type: "numeric" },
  { sku: "VX5-RAM-32GB", product_name: "VideoX RAM 32GB ...", product_group: "RAM", msrp: null, price_type: "market" },
  { sku: "VX5-SW30-300", product_name: "VideoX SW30 ...", product_group: "SW30", msrp: null, price_type: "call_for_quote" },
];

describe("generatePriceBookXlsx", () => {
  it("produces a valid workbook with title + header + data rows", async () => {
    const buf = await generatePriceBookXlsx(FIXTURE, new Date("2026-05-22T15:30:00Z"));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet("Price List")!;
    assert.equal(ws.getCell("A1").value, "Arxys VideoX Price List");
    assert.equal(ws.getCell("A4").value, "SKU");
    assert.equal(ws.getCell("D4").value, "MSRP");
    // Numeric row: MSRP cell holds the number, not a string.
    assert.equal(ws.getCell("D5").value, 74048);
    // MKT row.
    assert.equal(ws.getCell("D6").value, "Market Price");
    // CFQ row.
    assert.equal(ws.getCell("D7").value, "Call for Quote");
  });

  it("filename has date stamp and no spaces", () => {
    const name = priceBookFilename(new Date("2026-05-22T15:30:00Z"));
    assert.match(name, /^Arxys-Price-List-2026-05-22\.xlsx$/);
    assert.ok(!name.includes(" "));
  });
});
```

### 6. RUNBOOK update

§6 already documents the migrations. Step 7 doesn't change the schema or the happy-path setup recipe — no runbook change needed.

Optional: add a §12 line item under "Day-to-day commands" if you want to surface the new feature for new contributors: `Price list download: dashboard → "VideoX price list" card`.

### 7. ADR (optional)

If the XLSX library choice surprises future you, write `docs/decisions/0034-xlsx-library-choice.md` recording why `exceljs` (or whichever Q1 lands on). One short paragraph. Otherwise skip — the decision is captured here in the brief.

## Verification gates

1. `npm install exceljs` — clean, no warnings, lockfile updated.
2. `npm run lint` — 0 errors, only pre-existing `<img>` warnings.
3. `npm run build` — clean, **+1 route** (`/api/price-book/xlsx`).
4. `npm test` — 22+/22+ pass (the +2 new xlsx tests).
5. **Manual smoke (this gate is critical — automated tests can't catch Route Handler / Content-Disposition issues):**
   - `npm run dev`.
   - Sign in as a partner.
   - `/dashboard` shows the new "VideoX price list" card alongside the existing cards.
   - Click "Download XLSX →".
   - File downloads with name `Arxys-Price-List-YYYY-MM-DD.xlsx` (today's date).
   - Open in Excel/Numbers/LibreOffice — Arxys Gold header bar, 36 data rows, MSRP column shows currency for numeric rows + "Market Price" / "Call for Quote" for non-numeric.
   - Hit the URL `/api/price-book/xlsx` directly while signed out — expect 401 or redirect to login (depending on which path the proxy routes you through).
6. `scripts/test-rls.ts` — 10/10 pass (no RLS changes expected).
7. **Idempotent / fast**: hit `/api/price-book/xlsx` twice in quick succession; both downloads succeed; no `dynamic = "force-dynamic"` regression that breaks the route.

## Definition of done

- [ ] `exceljs` (or chosen library) installed and committed in package.json + lockfile.
- [ ] `src/lib/price-book/xlsx.ts` — generator written.
- [ ] `src/lib/price-book/xlsx.test.ts` — tests pass.
- [ ] `src/app/api/price-book/xlsx/route.ts` — Route Handler written.
- [ ] `src/app/(app)/dashboard/page.tsx` — download card added.
- [ ] All 7 verification gates green.
- [ ] Manual smoke confirms downloaded XLSX opens correctly in at least one spreadsheet app.
- [ ] JOURNAL entry written ("Phase 2 Step 7 — Partner XLSX download").
- [ ] Optional ADR 0034 if Q1 surprised anyone.
- [ ] Working tree clean; one coherent commit.
- [ ] **Don't push without Andy's nod.**

## Open questions to surface

1. **Q1–Q8 above** — confirmed answers before installing the library.
2. **Does Turbopack + exceljs need any next.config.ts tweaks?** Likely no (pure JavaScript dep), but if `npm run build` complains about the dependency, this is the first place to look.
3. **Does the Route Handler need explicit Content-Length?** Some browsers download progress bars rely on it. Setting it costs nothing.

## Lessons from prior Phase 2 steps to carry into this step

- **Manual smoke is the only catch for Route Handler / Content-Disposition issues.** `npm run build` confirms the route compiles; `npm test` confirms the XLSX generator is correct; only a live browser test confirms the download actually triggers, the filename is right, and the file opens. Don't defer the smoke.
- **When adding a new dependency, run `npm install`, commit the lockfile, and verify `npm run build` once before writing any consumer code.** A package incompatibility surfaces fastest at install + build time.
- **Server-side imports of `server-only` libraries don't work in tsx scripts.** If you want a programmatic test of the route handler (vs the generator), spin up `npm run dev` and hit the endpoint with curl rather than fighting with `server-only` in tsx.

## Out of scope reminders

- No HTML price book page (Step 8).
- No per-partner discount column.
- No CSV alternative.
- No multi-sheet workbook.
- No email-the-XLSX-on-submission.
- No image embeds or rich styling beyond Arxys Gold header.
- No partner-specific filtering. (Every authenticated partner gets the same MSRP-only file.)

## Effort estimate

**1.5–2 hours of focused Sonnet 4.6 high work.**

- npm install + verify build: 5 min.
- xlsx.ts generator: 30 min.
- xlsx.test.ts: 15 min.
- Route Handler: 20 min.
- Dashboard card: 10 min.
- Manual smoke: 15 min.
- JOURNAL + commit: 15 min.
- Buffer: 20–30 min for unexpected library quirks (the `writeBuffer()` return type drifted between exceljs major versions; cast handles it).

## When you finish

1. All 7 verification gates green.
2. JOURNAL entry written.
3. One coherent commit. Example subject: `feat(price-book): partner XLSX download from dashboard`.
4. **Don't push without Andy's nod.**
5. Summary back to Andy: row count in the XLSX, filename pattern, screenshot or description of the dashboard card placement, any surprises.
