# 0030 — Portal Phase 2 scope locks and PQ resolutions

- **Status**: Accepted
- **Date**: 2026-05-20

## Context

Portal Phase 2 (= Pricing Pipeline project per ADR [0019](./0019-defer-real-pricing-to-phase-2.md)) was scoped in a single session on 2026-05-20, immediately after the Step 11 close-out. Six "PQ" questions were left open at the close of Step 11, all needing locked answers before any individual Phase 2 Step could be scoped in detail. This ADR captures those six resolutions plus two scope cuts vs the original proposal at [`docs/proposals/phase-2-pricing-pipeline.md`](../proposals/phase-2-pricing-pipeline.md).

Andy supplied five concrete goals to scope against:

1. Minimal portal branding (logo + Arxys Gold on primary buttons).
2. Real MSRP pricing on calculator results.
3. Automatable Sheet → Supabase + Pipedrive sync. **No Google Slides involvement.**
4. Partner-facing XLSX download of the full price list.
5. HTML price book page inside the portal, replacing the Slides.

This ADR is a single consolidated record so future readers can find every Phase 2 scope decision in one place rather than reconstructing from JOURNAL detours. If any one of these resolutions needs revisiting later, it gets its own follow-up ADR superseding the specific section.

## Options considered & decisions

### Scope cut #1 — Google Slides removed from Phase 2 entirely

- **Options:** (i) automate Sheet → Slides push as part of the pipeline (contradicts the proposal); (ii) keep Slides manual until retirement (proposal's stance); (iii) remove Slides from the project entirely — no automation, no retirement step.
- **Decision: (iii).** The portal's HTML price book (Phase 2 Step 8) replaces Slides functionally. Slides becomes a non-thing — not maintained, not distributed, not referenced. The "Retire Google Slides" step from the proposal's Phase 3 is deleted.
- **Why:** Slides automation is non-trivial (text-frame IDs, layout drift). Phase 2 already builds the HTML price book that replaces it. Carrying Slides as a parallel surface during Phase 2 adds maintenance for a thing that's about to die anyway.

### Scope cut #2 — Internal testing only during Phase 2

- **Options:** (i) ship Phase 1 to a canary partner with a price-suppression patch before Phase 2 starts; (ii) no external partners until end of Phase 2.
- **Decision: (ii).** External partners onboard at end of Phase 2 ("MVP final" = Phase 2 Step 10). Phase 2 progress is exercised by internal testers only (Andy + admins + internal staff).
- **Why:** Internal testers see whatever placeholder state is currently broken without it being a real-customer problem. The price-suppression patch from PQ1 becomes unnecessary work. MVP launch becomes a coherent single event at end of Phase 2.

### PQ1 — Launch-blocker treatment

- **Effectively resolved by scope cut #2.** The launch blocker (`/submissions` showing `$1.00..$57.00` placeholder prices) doesn't reach an external partner because no external partner is invited during Phase 2. Step 6 (partner-price display fix) lands real numbers before Step 10 (cohort invite).

### PQ2 — Master Sheet reconciliation

The Sheet's actual shape (4 columns: `Product code, Product Name, MSRP Price (USD), Partner Discount Price`; 35 rows; inline MKT/CFQ) diverges from the proposal's spec (6 columns: `Product Group, SKU, Product Name, MSRP, Price Type, Notes`; 41 rows; separate Price Type column).

- **Options:** (i) Andy updates the Sheet to match the proposal — adds `Product Group` + `Price Type` columns, adds the missing `VX5-PP5-V100`, ~15–20 min of data entry; (ii) the push script adapts to the Sheet's actual shape; (iii) hybrid — Andy adds just the Product Group column.
- **Decision: (ii).** Push script derives Product Group from the SKU prefix (`VX5-<GROUP>-<TIER>` regex). Parses inline MKT/CFQ in the MSRP cell. Drops the Notes column (was always doc-internal). Validation pass refuses to push any row whose SKU breaks the prefix convention — explicit error, requires manual Sheet fix or escalation to an explicit Product Group column.
- **Why:** Andy's working master Sheet stays his working master. ~10 lines of script complexity added vs ~15–20 min of his data-entry burden — and that burden recurs every time new products are added.
- **Risk:** SKU-prefix taxonomy could drift. Today: VX5-GPU, VX5-NIC, VX5-RAM, VX5-SW10..35, VX5-V100..V800. If a future product breaks the pattern, the script's prefix-validation pass surfaces it as a hard error — at which point we either rename the SKU or escalate to an explicit Product Group column.

### PQ3 — Discount mechanic

- **Options:** (a) Sheet's `Partner Discount Price` column (one discount % per Sheet refresh); (b) proposal's per-user `partners.discount_tier` (runtime computation); (c) some hybrid.
- **Decision: partial.** Partner XLSX download (Phase 2 Step 7) ships MSRP-only — no discount logic in that surface. HTML price book (Step 8) defers the per-user discount question to its own scoping brief; likely displays "Contact Arxys" in the Partner Price column until tier data exists, per the proposal's fallback.
- **Why:** the XLSX download is small and useful in MSRP-only form; tier mechanics shouldn't block it. The Price Book page is a richer surface where the discount design matters more, and the question can be revisited when Step 8 reaches scoping.

### PQ4 — Schema appetite

- **Options:** (a) full SKU-PK migration (proposal Phase 1's schema — `sku TEXT PRIMARY KEY`, `msrp NUMERIC nullable`, `price_type`, `product_group`, `sort_order`, `active`); (b) values-only update of the existing 6-row family `products` table; (c) hybrid.
- **Decision: (a) full SKU-PK migration.** Implied by Goal 4 (partner XLSX download of the *full* price list) which needs the full ~35-row SKU list in Supabase. The 6-row family table is replaced.
- **Why:** any path that ends with "partner downloads the price list" forces the full SKU table to live in Supabase. Values-only update of 6 family rows produces a useless 6-row XLSX. Once the migration is forced, all downstream steps (recommendation rewrite, push script, Price Book page) build on the new schema.
- **Cascade impact:** `submissions.recommended_product_id` (currently FK to `products.id UUID`) needs to migrate to FK on `products.sku TEXT`. `server_specs.product_id` likewise. Existing rows on `submissions` keep their UUID references as historical fact — likely needs a data migration that maps each existing UUID to the new SKU PK of the same family, or accepts that historical submissions point to a now-different row shape.

### PQ5 — Push script location

- **Options:** (a) in this repo at `scripts/push-prices.ts`; (b) separate repo.
- **Decision: (a) in this repo.** Sits alongside `bootstrap-admin.ts` and `test-rls.ts`. Reuses existing Supabase client, Pipedrive client, env.ts, type definitions.
- **Why:** Phase 1 already established `scripts/` as the home for CLI tools. Pulling the push script out would require either duplication of the Pipedrive types and option-ID maps from `src/lib/pipedrive/` or extracting them to a shared package — both heavier than keeping everything together. The `googleapis` dep this adds to `package.json` is scripts-only and isn't bundled into the portal app build.

### PQ6 — Sub-phase sequencing

- **Options:** (a) scope all of Phase 2 up front, execute in one long arc; (b) per-step scoping briefs in the Step 11 shape, scoped on demand.
- **Decision: (b).** Each Phase 2 Step gets its own scoping brief at `docs/phase-2/step-N-<short-title>.md` when reached. Same shape as the Step 11 brief — Andy prereqs separated from code work, definition of done, open questions to lock first.
- **Why:** the Step 11 brief shape worked well in practice. Pre-scoping everything would force premature commitments before downstream context is available.

## Consequences

**Positive:**

- Single source of truth for "why Phase 2 looks the way it does." The plan doc lists *what*; this ADR lists *why*.
- Scope is now small enough to execute. Slides removal alone cuts a non-trivial design effort.
- The Sheet stays as Andy's working master; the push script adapts. Lower friction over the life of the pipeline.
- Internal-only-during-Phase-2 means partner-facing failure modes are exercised by internal testers before external partners ever arrive.

**Negative:**

- The full SKU-PK migration is the largest single piece of Phase 2 — the deep change ADR 0019 deferred precisely because it's heavy. Now we own it.
- SKU-prefix derivation for Product Group is brittle by design; surfaces as a hard error in the push script if a new product breaks the pattern. Acceptable trade vs the proposal's six-column Sheet.
- The HTML price book (Step 8) is now the only durable partner-facing price surface — Slides won't be there as a fallback if Step 8 takes longer than expected.

## When to revisit

- A future Sheet addition breaks the SKU prefix convention → escalate to an explicit Product Group column; this ADR's PQ2 resolution gets a follow-up ADR.
- HTML price book (Step 8) turns out to need a discount column → revisit PQ3 with a new ADR documenting the chosen tier-data mechanic.
- Phase 2 itself ships → at that point, post-MVP work either lives in a new "Portal Phase 3" with its own ADR seeding, or in incremental enhancements to the Phase 2 footprint.
