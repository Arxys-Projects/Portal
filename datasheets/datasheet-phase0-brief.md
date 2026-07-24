# Claude Code Brief — Datasheet Automation, Phase 0 (Audit)

**Model:** Opus 4.8
**Effort:** xhigh
**Mode:** Read-only investigation. No schema changes, no migrations, no file edits except a new
JOURNAL.md entry recording findings, per the repo's standard practice. Do not proceed to schema or
design work. Report back for review before anything else starts.

## Context

We're scoping a data-driven two-page datasheet (PDF + on-screen portal view) to replace the current
Illustrator-to-PDF workflow, for the ~10 SKUs in the Price Book. Reference:
`docs/datasheetplan.md` in this repo root (copy it in if it isn't there yet) covers the full plan.
This brief covers only the audit step the plan calls Phase 0.

## Tasks

1. **Check `product_specs` for V250, V255, V260.**
   Query the live table (or the seed data if that's faster) for rows matching those families,
   alongside the confirmed 7 (V100/V200/V400/V500/V600/V700/V800, 21 rows). Report whether they
   exist, and if so, whether their columns cover what the V250 factsheet needs: dual CPU variant on
   one sheet, optional DC power input, "NA" storage capacity. If they don't exist, note what a new
   row (or new archetype) would require versus the existing 44-column shape.

2. **Confirm hero/rear product photography for every target SKU.**
   Check `public/price-book/` for image assets matching each family (V100, V200, V250/255, V260,
   V400, V500, V600, V700, V800, SW10, SW20, and any other SW tiers in the Price Book). Report which
   exist, which are missing, and cross-reference against the `heroImage` mapping in `families.ts`.

3. **Trace the source of the Price Book page's copy blocks.**
   On `/price-book/[sku]`, find where the "Great For" paragraph, "Key Features" list, "Technical
   Specs" list, and the compliance strip (Multi-VMS Validated / NDAA Compliant / American Made) are
   defined — hardcoded per page component, pulled from `product_specs`, pulled from `families.ts`,
   or somewhere else. Report the exact file(s) and whether that source could be shared by a new
   datasheet template without duplicating the copy.

4. **List any other family-level content already in the repo that overlaps with the datasheet's
   page-1 feature blocks** (Flexible Storage, Lower Deployment Costs / H.265, High Data
   Availability, Strengthen Cybersecurity, Advanced Support) — even partial matches are useful,
   since these appear templated with per-family variable substitution across the sample PDFs.

## Report format

Append a JOURNAL.md entry with a `### Work done` section covering the four tasks above, structured
as findings, not as a proposal for what to build next. Flag anything ambiguous or contradictory
rather than resolving it — Phase 1 (schema) and Phase 2 (design) depend on these findings and
haven't been briefed yet.
