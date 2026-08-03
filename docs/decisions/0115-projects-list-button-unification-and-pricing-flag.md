# 0115 — `/projects` list: unified buttons and a pricing-based staleness flag

- **Status**: Accepted
- **Date**: 2026-08-03
- **Related**: supersedes part of [0114](./0114-projects-page-ui-decisions.md) (the download split-menu
  and the `lg` action-slot layout); the expiry flag it replaces was `PROJECT_QUOTE_VALIDITY_DAYS`
  (unrelated ADR 0061, still governing the PDF's own "valid until" language)

## Context

User feedback on the shipped phase-2 page: the row was too tall (fewer projects visible per screen),
and the four button treatments per row (filled navy, light-navy "secondary", filled navy again for
Pipedrive, two bare icon buttons) had no visible logic tying color to importance. Separately, the
7-day expiry flag was flagging quotes that were merely old, not quotes whose pricing had actually
changed — the two are different facts, and only the second one requires action.

## Decisions

**Every row now renders exactly 3 navy buttons in a fixed order — task, "View Project", Pipedrive —
plus a small "···" overflow menu for Archive.** This applies uniformly across all eight `row_state`
values, not just the three everyday ones (quoted-current, needs-price-update, not-yet-quoted). The
four rarer states (archived, no deal link, drifted, zero line items) keep their distinguishing
border/strip/dot colors — those are real signals, not decoration — but their task button is now navy
like everything else, so "this is a button" reads the same way everywhere on the page.

**The standalone "Download" slot (the split-menu button offering the Project Proposal PDF vs. the
calculator submission PDF) is removed from the row entirely.** For an ordinary current quote, the
task slot itself now directly downloads the proposal (`download_proposal`, unchanged action type,
new label without the trailing "⌄" it no longer needs). The calculator-submission PDF is still
reachable from the project detail page (`/admin/submissions/[id]`), which already has its own
download control — nothing was actually removed, only relocated off the list row.

**The "Open project" icon-arrow is replaced by a "View Project" button**, at the same destination
(`/admin/submissions/[id]`). Naming it explicitly matches every other button on the row now being a
labeled action rather than a mix of labeled buttons and bare icons.

**An ordinary `quote_current` row's primary action changed from "New Project Proposal vN" (offer to
re-quote) to "Download Proposal vN" (offer to send what already exists).** Previously only a proposal
generated *that day* got the download-primary treatment; a quote from three days ago, still valid,
still offered to make ANOTHER version as its primary action. That distinction no longer earns a
different button: from the sales rep's perspective, "quoted and current" means "the thing to do is
send it," whether it was made this morning or last week. Making a deliberate extra version is still
possible from the project detail page.

**The 7-day fixed expiry (`is_expired` / `quote_expired`) is replaced by a pricing-staleness flag
(`needs_price_update` / `quote_needs_price_update`).** A quote is now flagged only when it was
generated before the portal's most recently pushed price update — not on a fixed calendar window.
Mechanically: `scripts/push-prices.ts` is the only writer of the `products` table, and every SKU
changed in one invocation is stamped with the *same* `effective_date` — so "the last price update"
is one global date (`max(effective_date)` across `current_products`, scoped to rows already in effect
so a future-dated price change doesn't flag anything before it takes effect), computed once per queue
load in `queue.ts` and compared against each quote's `generated_at` in `rows.ts`. No schema change was
needed — the append-only price-versioning table (ADR-adjacent migration
`20260702000001_price_versioning_append_only.sql`) already carried what this needs.

**`PROJECT_QUOTE_VALIDITY_DAYS` and `projectQuoteExpiryIso` are untouched.** They still back the
7-day "valid until" language printed on the generated PDF and the admin submission detail page — a
real, separate fact (how long the customer-facing document claims to be valid) from "has pricing
actually changed since." Conflating the two was the bug; keeping the PDF's own validity window
unrelated to the list's staleness flag is deliberate, not an oversight.

**The archived row's duplicate "Undo" control is removed.** The row previously offered two ways to
restore an archived project: a small "Undo" inside the grey strip, and a separate "Restore to my
queue" button in the action row. Collapsed to the one navy button in the action row; the strip is now
purely informational ("Archived … by … · nothing was deleted").

## Consequences

**Positive:** one button color means one thing ("this does something") everywhere on the page, which
was the actual complaint. The staleness flag now only fires when something a rep would actually need
to redo (pricing moved) happened, instead of firing on every quote that simply aged past a week.
Row height dropped roughly 25–30% (padding, name, and state-zone type sizes all reduced one step),
so more projects are visible without scrolling.

**Negative:** a sales rep can no longer download the raw calculator-submission PDF directly from the
list row — that control now lives one click further, on the project detail page. Quietly regenerating
a proposal on an otherwise-current quote (with no drift, no stale pricing) is no longer a one-click
list action; it requires opening the project.

**When to revisit:** if reps report missing the quick calculator-submission download from the list, or
if the portal ever gains a genuine "price list version" concept distinct from per-SKU
`effective_date` (e.g. an annual rate-card refresh where every SKU is meant to move together) — the
current flag is correct for the append-only-per-SKU model that exists today, but would need
re-deriving against a dedicated version table if that model changes.
