# 0098 — Revision updates never touch a deal's attached products

- **Status**: Accepted
- **Date**: 2026-07-28

## Context

Revising a quote is supposed to update the source submission's Pipedrive deal in place rather
than create a second one (ADR 0093). `updateDealFromRevision` does that by PUTting exactly
`buildDealFields()`'s output, which always includes `value`.

Pipedrive treats a deal's attached product line items as the authoritative source of its value.
Once any product is attached, a PUT carrying `value` is rejected with
`400 Cannot update deal value, the deal has products attached to it.` — and the rejection
discards the **entire** payload, so the revision also loses its `arxys_*` custom fields and its
portal URL, not just the price. The response carries no error `code`, only that string.

`isDealUneditableError` recognises only 404 and `ERR_DEAL_DELETED`, so this 400 fell straight
through to the callers' swallow-and-log catch. Result: the revision saved with
`pipedrive_deal_id = null` while reporting success to the submitter.

This is not an edge case. The Project Quote path *reads* a deal's line items, so every deal
that has had a quote generated is in exactly this state — meaning every quoted deal was
permanently un-revisable. Observed on City of Plainfield (2026-07-28): revisions off a
products-bearing parent failed, revisions off a parent with no deal "succeeded" by creating a
fresh deal, giving a distinctive alternating pattern across a five-row chain.

The open question was not *whether* to stop sending `value` — it was what should then happen to
the now-stale value and line items, since the new sizing genuinely differs (that chain went
from $204,796 to $151,990, with 2 × V700 still attached).

## Options considered

- **Send the update without `value` when Pipedrive refuses it, and say nothing.** Smallest
  change; revising works again. But the deal keeps showing the previous revision's price with
  nothing anywhere indicating it is stale — a silent wrong number in the CRM.
- **Send without `value`, and flag the un-written price in the pinned revision note.** Same
  mechanical fix, plus the new figure is recorded where sales already look. Staleness becomes
  visible instead of silent. Costs a manual reconciliation step.
- **Delete and re-attach the line items from the new recommendation.** Keeps value and products
  exactly correct and needs no human follow-up — but silently destroys the quantities,
  discounts, and extra SKUs sales hand-tune on a worked deal. The portal does not know which
  line items are its own.
- **Pre-check `products_count` with a GET before updating.** Deterministic, but adds a request
  to every revision's happy path to detect a condition the error response already reports.

## Decision

On `400` + a message matching *deal value* and *products*, retry the PUT with `value` removed
and everything else intact, then record in the pinned revision note that the value was **not**
written, along with the new sizing and price. Detection is `isDealValueLockedError` — a separate
predicate from `isDealUneditableError`, matching on status plus wording since there is no `code`.

The portal never creates, deletes, or edits a deal's product line items. Reconciling them is a
human step, prompted by the note and (on the admin retry path) by a `valueUpdateSkipped` flag
surfaced in the button's success message.

Critically, this must **not** route into the create-a-fresh-deal fallback: the deal is perfectly
editable, so creating another would duplicate it in the CRM — the exact failure ADR 0093 exists
to prevent.

## Consequences

**Positive:** revising a quoted deal works again, and the fields that carry the revision's
identity (`arxys_*`, portal URL) survive instead of being discarded wholesale by the 400. Sales'
hand-tuned line items are never overwritten. No duplicate deals. Unrelated 400s still propagate.

**Negative:** a revised deal's value can disagree with the revision until someone updates the
products by hand, so pipeline forecasts read low or high in the interim. The predicate matches
on message wording, which Pipedrive can reword — the tests pin the exact production string so a
reword surfaces as a failure rather than a silent regression.

**When to revisit:** if the portal ever becomes the system of record for line items (e.g. it
starts attaching products itself at deal creation, tagged so its own rows are identifiable),
then re-attaching them on revision becomes safe and the manual step should go away.
