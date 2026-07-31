# 0110 — Datasheets generate in the portal: on demand, admin-and-internal, copy in a module

- **Status**: Accepted
- **Date**: 2026-07-31
- **Related**: 0096 (`product_specs` canonical and admin-form-editable), 0097 (the joined
  spec surfaces), 0105 (Ledger renders at three pages), 0106 (fonts committed locally),
  0107 (photos are public paths, `usage_paragraph` is a column), 0108 (photo intake and
  naming), 0109 (Rail is a second template), 0060 (the Project Quote freezes a snapshot)

## Context

Both datasheet templates existed and rendered correctly, and neither was reachable from the
running app. The only way to produce a sheet was a local script against a dev machine. Rail
had a working DB adapter — `buildContent()` inside `scripts/render-rail-mockup.ts` — in the
wrong place, with no unit test. Ledger had no adapter at all: it had only ever been fed
`V800_PLACEHOLDER`, a hand-typed object.

Closing that gap forced four decisions that are not implementation details.

Three were known going in: who may download a sheet, whether a sheet is rendered live or
frozen, and where the authored copy lives. A fourth surfaced while reading the design
handoff's own reference renders: the V250/V255 management sheet is fully designed
(screenshots 03 and 04) but is **not a differently-populated Ledger**. It replaces the VSR
table with a Management Capacity table of Role / Cameras / Recording / Notes and no
parameter strip, uses an ordering table of Part Number / Model / Configuration / Cameras
Managed, and merges two SKUs into single spec values. Its two headline figures — 1,000
Mbit/s throughput and "250 / 250+" cameras managed — are in no `appliance_specs` column.

## Options considered

**Who may download.** Admin-only, matching the two spec-editing surfaces · admin and
internal, matching the `/admin` layout gate · any signed-in partner, since datasheets are
marketing collateral whose natural home is the Price Book.

**Live or frozen.** On demand from current specs, so a sheet always states today's figures ·
a frozen snapshot per render, mirroring ADR 0060, so a given download is reproducible.

**Where the copy lives.** New spec columns surfaced on both admin forms, following ADR
0096's established write path · a checked-in module keyed by model · leave it
template-generic with no per-model authoring.

**Management scope.** Build the management variant now · defer it and say so.

## Decision

**Admin and internal, widening later.** The gate is one function,
`requireDatasheetAccess()` in `src/lib/datasheet/guard.ts`, used by both the route and the
picker, so widening it to all signed-in partners is a single edit rather than a hunt. The
restriction is not a security boundary — these documents are meant to be public — it is a
hold until the authored copy has had a marketing pass.

**Rendered on demand, never frozen.** The deliberate opposite of the Project Quote. Pricing
must not drift under a customer; a spec sheet should always state today's specs. No table, no
migration, no retention question. The cost is that a PDF downloaded last quarter can
silently disagree with today's, which is acceptable for a spec sheet in a way it is not for
a quote.

**Authored copy in `src/lib/datasheet/copy.ts`**, keyed by model with shared defaults. It is
the same tradeoff ADR 0107 already accepted for photo paths: a marketing edit costs a
deploy, acceptable while the copy changes in batches. What this buys over spec columns is
that the copy is reviewable in a pull request and unit tested, and that this session stayed
read-only. **Numbers do not go in this file** — anything measurable is read from the spec
row, and a string needing a figure takes it as an argument.

**Management deferred, and visibly.** V250/V255 and the three ACM rows appear in the picker
stating, in a full sentence each, why they have no sheet — and the two reasons are kept
distinct rather than collapsed. ACM has **no template designed** (the handoff puts the line
out of scope; no ACM field is drawn anywhere). Management has a template **designed but not
built**. Omitting either from the picker would read as "these products do not exist".

Two things this ADR fixes rather than leaving to the next editor:

1. **The canonical row, plus a prefix extension.** The three SKUs of a model disagree on a
   few columns where one fact was transcribed twice. The sheet takes the
   highest-capacity SKU, because the headline storage figure and the page-2 ceiling line are
   both the model's maximum. But that row is not always the fullest: `sfp_addon` runs the
   other way in all six models that have it, with the lowest SKU carrying "Optional - 2x
   10Gb SFP+ ... available" and the higher two truncated to a bare "Optional". So a value
   that is a strict *prefix* of a sibling's is extended to the longer one. That can only add
   more of the same sentence; it can never substitute a contradicting fact, which a plain
   "longest wins" rule would risk.

2. **No warranty term means no warranty band.** `DatasheetContent.warranty` is now nullable
   and the V100 renders without the band, because its `warranty_years` is null. A term is
   never inferred — not from the legacy free-text `warranty` column, which reads "5yr NBD,
   Advanced Replacement" on exactly those rows, and not from a sibling model. The seal
   graphic is chosen by term, the two files are adjacent under near-identical names, and the
   wrong seal is a false warranty claim on a customer-facing document.

## Consequences

**Positive:** every renderable model reaches a PDF through one path, and the mockup script is
now the same adapter the route uses, so a review render cannot disagree with a download. The
adapters carry 97 unit tests where `src/lib/datasheet/` had none, tested against two models
because the RAID level is a template variable. `V800_PLACEHOLDER` and its render script are
deleted, as their own headers asked once an adapter existed. Spec gaps are named in words in
the picker instead of appearing as blank regions.

**Negative:** marketing copy needs a deploy. Five of fourteen models still have no sheet. The
V100 renders a thin sheet — one environmental row, no band, no pills — which is honest but
not yet sendable.

**Two things measured rather than assumed, both of which would otherwise have shipped broken:**

*Page fit.* The V700 rendered a **fourth page**. Its `usage_paragraph` was 369 characters
against the V800's 272, and page 1's only flexible child is the feature grid sitting at its
content minimum, so a taller usage column pushes the footer off — the handoff's "Known
constraints" §2, exactly as written. The spill point was binary-searched to **324
characters** with the photo at ADR 0105's 240px. Two fixes were possible: shrink the photo
(210px fits every model with ~80 characters of headroom) or shorten the copy. **The copy was
shortened** — the V700 paragraph is now 256 characters and the photo stays at 240px. Because
the V600 sits at 310 with only 14 characters of room, this is a live constraint, so
`ledgerWarnings()` measures it and the picker reports an over-long paragraph in red as a
defect rather than amber as a gap.

*Asset tracing.* This is the first route to register local TTFs (ADR 0106). Every datasheet
asset is read through `join(process.cwd(), "public", ...)`, so `@vercel/nft` can trace none
of them — not even the two logos whose public paths are string literals. Without an
`outputFileTracingIncludes` entry the fonts would be absent from the serverless bundle, and
the PNGs would fail *silently*: `loadPng()` catches and returns null, so an untraced photo
renders a held frame indistinguishable from "not shot yet" and an untraced seal renders the
dashed circle on a sheet that should carry the real mark. The entry is added and the emitted
trace manifest verified to contain all five fonts, both seals and all 14 datasheet PNGs.

**When to revisit:** when the copy has had a marketing pass — at which point the gate widens
to all signed-in partners and the picker moves next to the Price Book, and the argument for
moving copy into spec columns gets stronger. Also when the management template is built, at
which point the two deferral reasons in `catalogue.ts` reduce to one.
