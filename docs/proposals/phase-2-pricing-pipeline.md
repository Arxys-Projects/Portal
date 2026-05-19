# Phase 2 — Arxys VideoX Pricing Pipeline

**Status**: Proposed (Phase 2, after Portal Phase 1 ships)
**Source**: Andy's planning doc, captured 2026-05-19. Original: https://docs.google.com/document/d/1kZ7_TcBOwkgSLN1YqiJAmr0zwP48tvMPDXRxpFOovwQ/edit

This file is a verbatim copy of the planning doc, preserved in the repo so future sessions can reference it without re-fetching from Drive. The doc is the authoritative spec for Phase 2; if the Google Doc diverges from this file, update this file.

---

## Pricing Automation: Google Sheet → Pipedrive → Supabase → Portal

## What We're Building

A pricing pipeline that takes the finalized VideoX MSRP price list — maintained as a Google Sheet — and distributes it to all downstream destinations in a single, human-triggered operation. The pipeline eliminates the manual re-entry of SKU, product name, and MSRP data into Pipedrive Products, the Supabase pricing table, and the partner portal price book page.

This is not a replacement for the pricing decision process. The human judgment call — which BOM configurations to offer and at what price — remains entirely manual. The pipeline activates after that decision is made and the Google Sheet is finalized.

## Current State

The VideoX MSRP price list currently exists in three synchronized but manually maintained locations: a local Excel file, a Google Slides price book, and Pipedrive Products. Each update cycle requires the same SKU, product name, and MSRP data to be manually entered into each destination independently. The Excel and Google Slides are currently in sync. Pipedrive is updated manually, one product at a time.

The master BOM (VideoX_v5_AMD_BOM_NVR_V21_Exp.xlsx) is a 26-tab internal workbook containing component costs, markup calculations, and raw MSRP outputs across all possible server configurations. The BOM's internal calculated prices are not the same as the published MSRP prices — the published list is a curated subset with prices set by deliberate judgment. The BOM is an input to a human decision, not a direct data source for automation.

## How It Works

### Data Architecture

| Layer | Description |
| ----- | ----------- |
| Source of Truth | Master Google Sheet — curated SKUs, product names, MSRPs, price types |
| Internal Reference | BOM Excel (local) — COGS, markup, raw calculated prices across all configurations |
| Push Script | Claude Code script — reads the Google Sheet, validates, previews, and pushes to all targets |
| Target 1 | Pipedrive Products — live product catalog used in deal creation |
| Target 2 | Supabase pricing table — feeds the partner portal calculator and price book page |
| Target 3 | Portal price book page — web-native, Supabase-driven, replaces the Google Slides price book |

### Trigger and Cadence

The pipeline runs manually, triggered by Andy, approximately quarterly or whenever a price list revision is finalized. The sequence is:

1. BOM is updated with new component costs and configurations.
2. Andy reviews the BOM output and makes pricing decisions: which configurations are offered, and at what final MSRP.
3. Andy updates the Master Google Sheet with finalized SKUs, product names, and MSRPs.
4. Andy runs the Claude Code push script.
5. Script reads the Google Sheet, performs validation, and outputs a change preview (new products, updated prices, removed products).
6. Andy reviews the preview and confirms.
7. Script pushes to Pipedrive, then Supabase. Portal updates automatically via Supabase.

### Master Google Sheet Schema

The Excel price list is converted to a Google Sheet in the same Drive folder as this document. It becomes the permanent master going forward. The sheet contains one header row and one row per product.

| Column | Field | Type | Notes |
| ------ | ----- | ---- | ----- |
| A | Product Group | Text | GPU, NIC, RAM, V100, V150, V200, V250, V260, V400, V500, V600, V700, V800, SW, Warranty |
| B | SKU | Text | Primary key. Format: VX5-XXXX. Must be unique. |
| C | Product Name | Text | Full product description as it appears on the price list |
| D | MSRP | Number | Numeric USD value. Null for MKT and CFQ rows. |
| E | Price Type | Text | NUMERIC, MKT, or CFQ |
| F | Notes | Text | Optional. Internal notes only. Not pushed downstream. |

Price Type definitions:
- NUMERIC: standard priced product. MSRP field required.
- MKT: market price at time of purchase. MSRP field empty. Displays as "Market Price" in all destinations.
- CFQ: call for quote. MSRP field empty. Displays as "Call for Quote" in all destinations.

Sort order within the sheet determines display order in the portal price book page.

### Initial Product List

The following products are included at launch. This list reconciles the current Excel price list with the Google Slides price book to ensure all active products are captured.

Products to add to the Excel before Google Sheet conversion (currently in Slides but missing from Excel):
- VX5-V500-192 — VideoX V500 192TB 2U 12Bay Rack - V5 Video & Analytics Server — $32,978
- VX5-V260-ACM — VideoX V5 V260 ACM Access Control Manager Server - Mid Tier — $14,029
- VX5-V270-ACM — VideoX V5 V270 ACM Access Control Manager Server - Enterprise Tier — $17,890
- VX5-PP5-V100 — 5 Year Protection Plan - Extends SW workstation 3 year warranty to 5 years — $1,995

After these additions the master sheet contains 41 products.

## Scope & Phasing

### Phase 0 — Prerequisites

All steps in Phase 0 are data work, not code. They must be completed before the push script is built or run.

**Step 1 — Reconcile the Excel price list**
Add the four missing products listed above to the Excel file. Verify that every SKU, product name, and MSRP in the Excel exactly matches the corresponding entry in the Google Slides price book. Resolve any discrepancies before converting.

**Step 2 — Define Product Groups for all products**
Assign a Product Group value to every product using the group taxonomy in the schema above. This field does not exist in the current Excel. It is required for the portal price book page grouping and for Pipedrive product categorization.

**Step 3 — Assign Price Types**
Mark VX5-RAM-32GB as MKT. Mark VX5-SW30-300 and VX5-SW35-300 as CFQ. All other products are NUMERIC.

**Step 4 — Convert Excel to Google Sheet**
Upload or recreate the reconciled Excel as a Google Sheet in the Arxys Drive folder (same location as this document and the Portal PRD). This sheet becomes the master going forward. The local Excel file is retained as an archive but is no longer the working copy.

**Step 5 — Confirm Pipedrive product codes**
Verify that existing Pipedrive products have their SKU stored in the product Code field. The push script uses this field to match records. Any Pipedrive products with a missing or non-standard Code field must be corrected manually before the first push.

### Phase 1 — Push Script: Pipedrive and Supabase

**Overview**
A Claude Code script reads the Master Google Sheet and pushes all product data to Pipedrive Products and the Supabase pricing table. The script is run from the terminal. It does not run automatically or on a schedule.

**Push Script: Execution Flow**

1. Authenticate to Google Sheets API using service account credentials stored in the local environment.
2. Read all rows from the Master Google Sheet. Parse Product Group, SKU, Product Name, MSRP, Price Type.
3. Validate the data:
   - Flag any rows with empty SKU or Product Name.
   - Flag any NUMERIC rows with empty or non-numeric MSRP.
   - Flag any duplicate SKUs.
   - Output the validation report. If errors exist, halt and require correction before proceeding.
4. Fetch existing products from Pipedrive via GET /v1/products. Index by product Code (SKU).
5. Fetch existing rows from Supabase products table. Index by sku.
6. Compute the change set:
   - New: products in the sheet not found in Pipedrive or Supabase.
   - Updated: products in both where name or MSRP has changed.
   - Flagged for removal: products in Pipedrive or Supabase not found in the sheet. These are listed but not deleted automatically.
7. Print the full change preview to the terminal: counts of new, updated, and flagged products, with a line-by-line list of each change.
8. Prompt: "Review the changes above. Type CONFIRM to push or CANCEL to exit."
9. On CONFIRM: execute the push to Pipedrive, then Supabase.
10. Print a completion summary with success counts and any errors.

**Pipedrive Integration**

API endpoint: POST /v1/products (create), PUT /v1/products/{id} (update).

Field mapping:

| Google Sheet | Pipedrive Field |
| ------------ | --------------- |
| SKU | code |
| Product Name | name |
| MSRP (NUMERIC) | prices[0].price (USD) |
| MKT / CFQ | prices[0].price = 0 and name prefixed with "[MKT]" or "[CFQ]" |
| Product Group | category (if Pipedrive product categories are configured) |

Deletion policy: Products present in Pipedrive but absent from the sheet are listed in the change preview as "flagged for removal" and are never deleted by the script. Removal from Pipedrive is always a manual action.

**Supabase Integration**

Table: products

Schema:
- sku: TEXT PRIMARY KEY
- product_name: TEXT NOT NULL
- msrp: NUMERIC (nullable)
- price_type: TEXT — values: 'numeric', 'market', 'call_for_quote'
- product_group: TEXT
- sort_order: INTEGER — row number from the Google Sheet, determines display order
- active: BOOLEAN DEFAULT true
- updated_at: TIMESTAMPTZ DEFAULT now()

Operation: UPSERT on sku. All rows in the sheet are upserted. Products not in the sheet are not touched — active flag is not automatically set to false. Deactivation is manual.

Row-level security: Read access is granted to authenticated portal users. Write access is restricted to the service role used by the push script.

**Environment Requirements**

The following must be present in the local environment before the script runs:
- GOOGLE_SHEETS_CREDENTIALS: path to a Google service account JSON key with read access to the Master Google Sheet.
- PIPEDRIVE_API_KEY: existing Pipedrive API key.
- SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY: from the Supabase project used by the partner portal.

**Dependencies**

Phase 1 depends on:
- Phase 0 fully complete (reconciled master sheet, correct Pipedrive product codes).
- Supabase project created (Portal Phase 1).
- Pipedrive API key confirmed and accessible.

### Phase 2 — Portal Price Book Page

**Overview**
A page within the authenticated partner portal that displays the full VideoX MSRP price book as a live, Supabase-driven web page. It replaces the Google Slides price book. It requires no manual updates — it reflects the current state of the Supabase products table at all times.

**Page Structure**

The page is organized by Product Group, in the same order as the Master Google Sheet. For each group:
- Group header with product family name
- Product table with columns: SKU, Product Name, MSRP, Partner Price
- Partner Price is calculated client-side using the authenticated user's discount tier (stored in Supabase per user)
- MKT products display "Market Price" in both price columns
- CFQ products display "Call for Quote" in both price columns
- Products with active = false are excluded from the page

**Data Source**
All data is read from the Supabase products table. No additional API calls are required at page load. The page uses the same Supabase client already established in the portal.

**Access**
The price book page is accessible to all authenticated portal users. It is not accessible without login.

**Dependencies**

Phase 2 depends on:
- Phase 1 complete (products table populated in Supabase).
- Portal Phase 1 complete (authentication, Supabase connection, partner tier data).
- Partner discount tier stored per user in Supabase (required for Partner Price column; if not yet implemented, column displays "Contact Arxys" until tier data is available).

### Phase 3 — Retire Google Slides Price Book

Once the portal price book page is live and confirmed accurate, the Google Slides price book is retired from active use. The Slides file is retained in Drive as an archive but is no longer distributed to partners or updated.

The Google Slides is not automated at any point in this project. During the overlap period between Phase 1 and Phase 3, it is updated manually if a price change occurs that must be communicated before the portal page is available.

## Dependencies Summary

| Dependency | Required By | Owner |
| ---------- | ----------- | ----- |
| Phase 0 data cleanup complete | Phase 1 push script | Andy |
| Supabase project created | Phase 1 (Supabase push) | Portal Phase 1 |
| Pipedrive API key accessible locally | Phase 1 (Pipedrive push) | Andy |
| Google service account with Sheets read access | Phase 1 (script auth) | Andy / Google Workspace admin |
| Portal authentication live | Phase 2 (price book page) | Portal Phase 1 |
| Partner discount tier data per user | Phase 2 (Partner Price column) | Portal Phase 1 |
| Portal Phase 1 deployed | Phase 2 (price book page) | Portal Phase 1 |

## What This Is Not

This is not an automated pricing system. The script does not read from the BOM, does not calculate prices, and does not make any determination about which products are offered. All of those decisions remain manual.

This is not a continuous sync. The script runs when Andy runs it. It does not watch for changes to the Google Sheet or trigger on any event.

This is not a BOM automation project. The BOM remains a local Excel file used internally. Mapping the BOM's full configuration space to the published price list is a separate, future project with its own scope and complexity.

This is not a replacement for Pipedrive. Pipedrive remains the system of record for deals, contacts, and follow-up. The pipeline updates product records only.

## Summary

The pricing pipeline converts the manually maintained Excel price list into a Google Sheet, declares it the permanent source of truth, and automates distribution of finalized prices to Pipedrive, Supabase, and the partner portal. A Claude Code push script handles all downstream updates in a single confirmed operation. The portal price book page — a live, always-current web page organized by product group — replaces the Google Slides price book entirely.

Phase 0 is data work with no code: reconcile the product list, add four missing SKUs, assign product groups and price types, convert to Google Sheet, and verify Pipedrive product codes. Phase 1 is the push script: Pipedrive and Supabase targets. Phase 2 is the portal price book page. Phase 3 retires the Slides.

The BOM-to-price-list process remains human. Everything downstream of a finalized price list is automated.

---

## Outstanding clarifications recorded 2026-05-19

Before Phase 2 starts, these need resolution (captured here so they don't have to be re-discovered):

- Count mismatch: doc says 41 products after additions; the local xlsx as of 2026-05-19 contains 43 rows. Reconcile during Phase 0 Step 1.
- VX5-V500-192 listed as missing in doc but already present in local xlsx (row 26 with MSRP $25,946.888). Doc gives $32,978. Reconcile during Phase 0 Step 1.
- V255 appears in xlsx (VX5-V255-MGM) but is not in the doc's product-group enum. Decide: retire or add `V255` to groups.
- V270 appears in the additions list but not in the doc's product-group enum. Add `V270` to groups.
- Existing Portal `products` table has six placeholder rows from Step 5 with UUID primary key, `list_price_usd` 1..6. Phase 2 schema uses `sku TEXT PRIMARY KEY` — incompatible. Phase 2 must include a migration plan that either replaces the table or coexists alongside it, and must handle FK references from existing `submissions` and `server_specs`.
- `server_specs` table (capacity data: max_cameras, storage range) is calculator-recommendation-specific and is not addressed in Phase 2. Capacity stays where it is; price comes from the new `products` table.
- Portal's existing Pipedrive integration (Portal Step 8, Deal creation per submission) is a separate concern from Phase 2's Pipedrive Products push. Both can coexist; they use different endpoints and different triggers.
- `partners.discount_tier` does not exist in Portal Phase 1. Phase 2 (Portal Price Book Page) will need it, or will display "Contact Arxys" until it does.
- Push-script location: undefined in the doc. Options: in this repo at `scripts/push-prices.ts`, or in a separate repo. Decide before Phase 2 implementation.
