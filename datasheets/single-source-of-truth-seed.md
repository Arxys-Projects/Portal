# Product Data Single Source of Truth — Pre-Build Scoping Brief

## Why this exists

Surfaced incidentally while scoping a much smaller feature, a data-driven product datasheet
(see `docs/datasheetplan.md`, now paused pending this). In three passes of light review, four
separate places turned up holding overlapping or disagreeing product spec data, with at least one
confirmed live disagreement. Treat that as a confirmed pattern already observed, not a risk to
hedge against.

This document is a starting point for a new session to scope and plan the actual unification. It
is deliberately not a full plan, that's what the new session is for.

## Confirmed scope (stakeholder decisions, 2026-07-24)

- **In scope:** descriptive/technical product spec fields, wherever they currently live, in
  Supabase tables, in code files, or hardcoded in components.
- **Out of scope:** the Calculator's computational logic, bitrate-per-resolution tables, RAID
  overhead math, the recommendation algorithm itself. That stays as-is.
- **Confirmed, not yet verified in the codebase:** the Calculator's recommendations already read
  spec data from a Supabase source. **This is the first thing the new session's audit should
  confirm**, exactly which table(s), before assuming anything needs to be built from scratch. That
  table may already be a reasonable candidate for canonical, or it may be another partially-
  overlapping source. Don't assume either way.
- **Out of scope:** pricing. The Google Master Sheet → Supabase → Pipedrive pipeline already works
  as a live, editable source for MSRP/pricing data. This initiative is about descriptive/technical
  specs, not price.
- **Deliberately left open:** whether the target architecture extends the existing
  `product_specs`/`appliance_specs` shape with consumers rewired to read from it, or whether
  something new is warranted. Don't pre-commit, let the audit inform it.

## Known disagreeing/duplicate sources (found so far, not exhaustive)

- `product_specs` — 43 columns, 21 rows, rack-video archetype only (V100/V200/V400/V500/V600/
  V700/V800).
- `appliance_specs` — drafted for the datasheet project, **not applied**. Management/workstation
  archetypes (V250/V255, SW10/SW20). Its fate depends on this session's findings; reasonable to
  fold in rather than discard, but don't build on it independently until direction is set.
- `families.ts` — a TypeScript code file, not a database table, holding per-family tagline, KPIs,
  hero image path, and feature copy, consumed by the Price Book pages. Being a code file rather
  than a database row is itself a problem for live-editability, independent of any duplication,
  editing it requires a deploy, not a form.
- A hardcoded compliance strip in `/price-book/[slug]/page.tsx` (VMS list, NDAA, American Made).
  Confirmed disagreeing with `product_specs.vms_certified` (the strip lists 7 VMSes, the column
  lists 2-3). The 7-VMS strip has been confirmed as the authoritative one; `vms_certified` is
  confirmed stale.
- Whichever table(s) the Calculator reads for its spec-based recommendations — not yet identified,
  first audit task.

## Known consumers to inventory

- The Calculator (spec source unconfirmed, audit first)
- VMS/VideoX Compare tool
- Price Book pages (`/price-book/[sku]`)
- The datasheet automation project (paused, see `docs/datasheetplan.md`)
- Project Quote, Customer Proposal, and System Estimate PDFs (the existing `@react-pdf/renderer`
  pipeline)
- Anywhere else product specs surface in the codebase — don't assume this list is complete

## What's paused because of this

The datasheet automation project. Its drafted schema (the `product_specs` additive migration, the
`appliance_specs` table) isn't wasted work, both are reasonable candidates for this session to
build on, but neither should be applied or extended independently while this is being scoped.

## Recommended first step

A Phase-0-style audit, read-only, no schema or code changes: identify every current source of
product spec data across the codebase, which consumer reads from which source, where they agree,
where they disagree, and which sources are genuinely live-editable versus stuck in a code file or a
one-time seed with no ongoing update path. Same discipline the datasheet project used for its own
Phase 0.

Model: Opus 4.8, effort xhigh. Cross-module judgment work, and this audit's scope is materially
larger than the datasheet project's own Phase 0, touching the Calculator and Compare tool in
addition to the Price Book and PDF pipeline.

## Non-goals (confirmed)

- Not touching the Calculator's computational logic or math.
- Not touching pricing or the existing Master Sheet → Supabase → Pipedrive pipeline.
- Not resuming the datasheet project until this initiative's direction is set.
