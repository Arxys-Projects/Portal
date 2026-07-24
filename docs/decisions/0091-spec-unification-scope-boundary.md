# 0091 — Product spec unification: scope boundary and editability bar

- **Status**: Accepted
- **Date**: 2026-07-24

## Context

Scoping a data-driven product datasheet surfaced that Arxys product spec data is spread across
several partially-overlapping sources with at least one confirmed live disagreement. That turned
into its own initiative, briefed in
[`datasheets/single-source-of-truth-seed.md`](../../datasheets/single-source-of-truth-seed.md), and
the datasheet project was paused pending its direction.

Before the Phase 0 audit ran, four scope questions needed stakeholder answers, because each one
changes the size of the audit surface and the cost of whatever gets built. The architecture question
— extend `product_specs`/`appliance_specs` or build something new — was deliberately left open for
the audit to inform, and is **not** decided here.

This ADR records the four boundary decisions so they don't have to be re-litigated when the
architecture ADR is written.

## Options considered

**What counts as in-scope spec data**
- Arxys product specs only — smallest surface; leaves camera and competitor data on their own paths.
- Add `camera_specs` — third-party camera models; has the same no-form-to-edit problem.
- Add `competitor_products` too — full sweep; but competitor data has genuinely different provenance
  and a different refresh cadence.

**Editability bar for the canonical source**
- Portal admin form — no deploy, no script run. Largest build (CRUD UI, RLS write policies,
  validation).
- Repo file + script run is acceptable — matches `product_specs` today; cheapest, but editing still
  requires an engineer.
- Google Sheet → Supabase, mirroring the pricing pipeline — live editing without building UI, but a
  second sync pipeline to own, and ~50 spec columns across archetypes is awkward in a sheet.

**Consumer boundary**
- This repo only — fastest, matches the brief's wording.
- Include the public website — would require the canonical source to expose an external read path.
- Include Pipedrive/other downstream integrations.

**Audit deliverable**
- Audit, then stop for review — evidence signed off before any architecture work.
- Audit + architecture + ADR in one pass.
- Audit + architecture + full phased plan.

## Decision

- **In scope:** Arxys product spec data only. `camera_specs` and `competitor_products` are
  catalogued in the audit as adjacent sources but excluded from consolidation.
- **Editability bar:** the canonical source must be editable in a portal admin form — no deploy, no
  script run. This is a requirement on the end state, not a commitment to a particular schema, and
  may be phased (canonical table first, UI second).
- **Consumer boundary:** this repo only. The public website and Pipedrive are out of scope.
- **Deliverable sequencing:** Phase 0 audit is read-only and stops for review. Architecture and the
  phased plan follow sign-off.

Unchanged from the brief and restated here: pricing and the Master Sheet → Supabase → Pipedrive
pipeline are out of scope, as are the Calculator's computational logic, bitrate tables, RAID math,
and the recommendation algorithm.

## Consequences

**Positive:** the audit surface stayed tractable and finished in one pass
([`datasheets/spec-source-audit-phase0.md`](../../datasheets/spec-source-audit-phase0.md)). The
admin-form bar turned out to be the sharpest analytical tool in the audit — measured against it,
*zero* current sources qualify, including `product_specs`, which reframes the problem from "get data
out of `families.ts`" to "no spec source has a real write path." It also surfaced that 26 of
`product_specs`' 43 columns can only be changed by authoring a migration, two of which feed the
Calculator's storage math.

**Negative:** excluding `camera_specs` means a second reference table keeps its
JSON-plus-script-only write path, and it will likely need the same admin-form treatment later —
possibly duplicating whatever UI gets built. Excluding the public website means the canonical source
may need an external read path retrofitted if website unification is ever wanted. Deferring
architecture to a second session costs a context reload.

**When to revisit:** if the website becomes a consumer of canonical spec data; if `camera_specs`
editing becomes a bottleneck; or if the admin-form bar proves disproportionate to the edit frequency
actually observed, in which case the Google-Sheet option is the cheaper fallback.
