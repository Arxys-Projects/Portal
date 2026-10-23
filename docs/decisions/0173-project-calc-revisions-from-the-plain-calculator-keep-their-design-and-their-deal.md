# 0173 - Project calc revisions from the plain calculator keep their design and their deal

- **Status**: Accepted
- **Date**: 2026-10-23
- **Related**: 0040 (revisions stay on their deal), 0165 (banked design), 0167 (server-only deal link), 0169 (project calcs make no Pipedrive call), 0170 (one deal per project)

## Context

The first live project calc (Escambia, `b13830ef`, deal #5589) was edited by Andy on
`/calculator?revise=…`, the only screen that opens it, and he needed to save it and generate a
Project Quote at once. Two Step 4 rules stopped him:

- `submitCalculation` refuses a project calc sent with no system design, so a revision from the plain
  calculator page (which sends none) cannot silently drop the add-ons. The project screens that would
  send one do not exist yet.
- A project calc, fresh or revised, keeps `pipedrive_deal_id` null (ADR 0169). Generate Project
  Quote reads that column, so a revision could not be quoted even if saved.

## Options considered

- **Wait for the project screens.** Correct, and blocks a live quote for weeks.
- **Save the revision from a script.** The edits live only in Andy's browser tab.
- **Send the design from the plain calculator page.** A form change ahead of the design pass.
- **On the server, carry the source's banked design and deal link to the revision** (chosen). No UI
  change; the refusal still applies when there is nothing banked to carry.

## Decision

- A revision of a project calc that arrives with no system design reuses the source calc's banked
  design (`submission_system_designs.resolved_design`, mapped back to a request by
  `requestFromResolvedDesign`). Failover days and ratio that came from the rules go back unset, so
  they default again from the revised groups (a missing flag, from an older banked shape, counts as
  defaulted); values the rep set carry over. It goes through the same zod bounds as a sent design,
  then is resolved and sized again like any request, so a SKU no longer in the catalog still refuses. With no readable
  banked design the save is refused as before.
- A revision of a project calc whose source has a Pipedrive deal takes the same `pipedrive_deal_id`,
  written as service role on the row just inserted (ADR 0167), with no Pipedrive call. The deal's
  lines are not rewritten (revisions never rewrite lines); `diffDealLines` and the Phase B script's
  `diff` step show what to change by hand. Every linked revision's save result warns that the deal
  still has the lines of the calc it was built from; a failed link is a warning on a saved calc.
- Generate Project Quote then works on the revision as on any calc with a deal: it reads the deal's
  current lines and prices from Pipedrive.

## Consequences

**Positive:** project calcs can be revised and quoted from the existing pages now, without a screen
change, and every revision of a project stays on the project's one deal.

**Negative:** the revision's BOM and the deal's lines can differ until a rep edits the deal; the
quote shows the deal's lines. The Step 6 pricing gate (not built yet) is what will require a
confirmation that they agree.

**When to revisit:** when the project screens send a design on every save; the carry-over then only
covers stale tabs.
