# Arxys Datasheet Automation — Project Plan

## Problem

Two-page product datasheets are built in Illustrator, saved to PDF, then uploaded by hand to the
website and the portal. Every spec change means re-typesetting in Illustrator. Goal: a data-driven
two-page datasheet that renders both as a downloadable PDF and as content inside the Partner Portal,
sourced from the same data the Price Book already uses.

## Scope — active for this project

Three archetypes:

- **Rack-video (`product_specs`, existing table):** V100, V200, V400, V500, V600, V700, V800
- **Management (`appliance_specs`, new table, `family_type = 'management'`):** V250, V255
- **Workstation (`appliance_specs`, `family_type = 'workstation'`):** SW10, SW20

SW30 ("Video Wall Workstation") is explicitly out of scope for this project.

## Deferred — ACM archetype, separate future phase

V150, V260, V265 (not V270 — see naming note below). Different enough from the rest of the project
to warrant its own phase later rather than folding into this one: a distinct feature-block template
(3 of 5 page-1 headings are ACM-specific copy, not shared with video/management), a different
certified-platforms partner list (Lenel OnGuard, Genetec, Avigilon Unity, Milestone XProtect, Keyscan
Aurora, not the 7-VMS video strip), and a door-count field instead of a camera-count field. None of
this has been added to the schema yet, and shouldn't be until this phase is picked up.

**Naming note for whenever this phase happens:** the correct, current name is V265, matching what's
already live in Supabase and Pipedrive. The source PDF still says V270 because the datasheet hasn't
been regenerated yet — that's the staleness this project exists to fix, not a discrepancy to resolve
in the schema. Use V265.

## Status

Phase 0 audit complete. Phase 1 (schema) delivered by Claude Code, migrations written and not yet
applied. One outstanding fix before applying (see below); everything else flagged in the prior pass
turned out to be either already correct or no longer in scope.

## What already exists

### Supabase — `product_specs`

43 columns, 21 rows across the 7 rack-video families. Archetype-scoped to rack-video only.

### Supabase — `appliance_specs` (new, Phase 1 delivered, unapplied)

New table for management/workstation, `family_type` discriminator, ~52 columns, mirrors the
`camera_specs` RLS pattern. Correctly scoped to V150/V250/V255/V260/V265/SW10/SW20 as delivered —
ACM rows (V150/V260/V265) exist in the `family_type` design but get no ACM-specific fields until
that phase is picked up.

### PDF pipeline — `@react-pdf/renderer`

Already installed and in production use (System Estimate PDF, Project Quote, Customer Proposal,
Comparison PDF). Reusable asset/hero-image/badge-shape patterns established.

### Price Book on-screen page (`/price-book/[sku]`)

Great For / Key Features / Technical Specs live in `families.ts`, reusable with zero duplication.
Compliance strip is hardcoded in `[slug]/page.tsx` — needs extracting before a datasheet template
reads it. Video-archetype only; doesn't need to cover ACM for this phase.

## Outstanding fix before applying Phase 1

**Add the optional DC power input field to the `product_specs` additive migration.** V100 and V200
(both rack-video, already live in `product_specs`) list the same optional DC input line the
companion table already accounts for. This is the only remaining gap — everything else raised in
the prior review (V265/V270 naming, SW30, ACM fields) turned out to need no change, either already
correct as delivered or now out of scope.

## Target architecture

Two spec tables, one shared template for video/management (identical feature-block copy), a
separate simpler workstation layout (no feature-icon block at all — SW10/SW20 sheets go straight
from hero/spec bullets to the camera count matrix), two render targets (PDF via `@react-pdf/renderer`,
on-screen via the portal). ACM gets its own template variant when that phase is picked up.

## Phased plan

**Phase 0 — Audit.** Complete.

**Phase 1 — Schema.** Delivered; one field addition (DC input on `product_specs`) before applying.
Model: Opus 4.8, effort xhigh.

**Phase 2 — Design.** Token system and layout concept for video/management and workstation (two
modes, not three — ACM deferred). Following frontend-design brainstorm-then-critique discipline.
**Open dependency:** rear-panel photography confirmed real and mostly not yet landed in `public/`.
Model: Opus 4.8, effort high.

**Data population.** Seeding the 12 in-scope SKUs into `product_specs`/`appliance_specs` from the
source PDFs happens after Phase 2 locks, not before it, since the design phase works directly off
the PDFs' real content and doesn't need the database populated to do that. Can run in parallel with
the start of Phase 3 rather than gating it.

**Phase 3 — Build.** Sonnet 5, effort medium.

**Phase 4 — Integration and QA.** Sonnet 5, effort medium, plus manual verification against the
active-scope source PDFs (rack-video, management, workstation — 12 sheets, not the 3 ACM sheets).

**Future phase — ACM.** V150/V260/V265, its own feature-block template, certified-platforms field,
`max_doors` field, and the V270→V265 rename correction on the actual datasheet output. Scoped
separately when picked up.

## Non-goals / risks

- Not pixel-matching the Illustrator hero banner.
- Not writing new marketing copy per SKU beyond filling template variables.
- `product_specs.vms_certified` known-stale, out of scope, flagged separately.
- Rear-panel photography is a real content dependency, tracked separately from code.
- ACM archetype fully deferred — nothing in Phases 1-4 should assume ACM fields exist.

## Next step

Add the DC-input field to the `product_specs` migration, then apply both migrations via the
dashboard. Phase 2 design can start once that's done.

---

## STATUS: PAUSED (2026-07-24)

Paused pending a separate initiative to unify product spec data across the whole portal
(Calculator, Compare tool, Price Book pages, datasheets, quotes), see
`single-source-of-truth-seed.md`. This project's own scoping work is what surfaced the pattern:
in three passes of light review, four separate places were found holding overlapping or disagreeing
product data (`product_specs`, `families.ts`, a hardcoded compliance strip, and the drafted
`appliance_specs`), with at least one confirmed live disagreement (the VMS list). Not treating that
as a coincidence.

Nothing further should be applied or built on this project (no Phase 1 apply, no Phase 2 design)
until the unification session's findings are in. The schema already drafted here (the `product_specs`
additive fields, the `appliance_specs` table) is a reasonable candidate for that session to fold in
rather than discard, but shouldn't move forward independently in the meantime.
