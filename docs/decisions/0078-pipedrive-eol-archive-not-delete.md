# 0078 — Retire EOL/superseded SKUs in Pipedrive by archiving, not deleting

- **Status**: Superseded by #0079
- **Date**: 2026-07-06

## Context

The July price run's `--target=pipedrive` step (see JOURNAL 2026-07-06) closed the
Pipedrive price gap left open on 2026-07-02. That run surfaced a divergence: five
SKUs deactivated in the portal on 2026-07-02 — `VX5-V270-ACM` (superseded by the new
`VX5-V265-ACM`) and four EOL items (`VX5-SW25-200`, `VX5-SW30-300`, `VX5-SW35-300`,
`VX5-RAM-32GB`) — were `active=false` in the portal (hidden from partners, dropped
from the Excel export) but still `active_flag=true` and fully sellable in Pipedrive.

`push-prices.ts` cannot retire them: it only ever sends `active_flag: true` and only
writes a product when its name/price diffs. All five had matching name/price, so the
price run skipped them entirely — it can never archive a product. Their `current_products`
rows still resolve (the view has no `active` filter), so they are never "flagged for
removal" either. Retiring them is therefore necessarily a separate, deliberate step.

Left as-is, Pipedrive would offer both the superseded `VX5-V270-ACM` and the new
`VX5-V265-ACM`, plus four EOL items, in new-deal product pickers — a live sales footgun.

## Options considered

- **Archive (`PUT active_flag=false`) (chosen).** Removes the product from new-deal
  pickers; keeps it on existing deals and in reporting history; fully reversible.
- **Delete (`DELETE /products/{id}`).** Hard-removes the product. Destructive, harder
  to reverse, and can affect existing deal line items / history.
- **Leave active, defer.** Zero write now, but the sales footgun persists and the
  open item rots (it was already deferred once, on 2026-07-02).

## Decision

Archive the five in Pipedrive via a dedicated, idempotent script
(`scripts/archive-eol-pipedrive-products.ts`), run as a separate step immediately after
the confirmed price push — **not** folded into `push-prices.ts`. This mirrors the
portal's own "deactivate, don't delete — history preserved" choice for the same SKUs.

## Consequences

**Positive:** Portal and Pipedrive availability now agree. Superseded/EOL SKUs are off
the new-deal menu while their deal history and reporting stay intact. Reversible. The
archive list lives in code, documenting the EOL set.

**Negative:** Two SKU-availability sources still must be kept in sync by hand (a portal
deactivation does not propagate to Pipedrive). **Resurrection risk:** because the five
remain in `current_products`, if any is ever re-priced, the next `--target=pipedrive`
run would detect a diff and re-push it with `active_flag: true`, un-archiving it. Not a
concern for genuine EOL SKUs (their price won't change), but a latent trap.

**When to revisit:** if the resurrection risk ever bites, or the manual two-step becomes
error-prone, teach `computePipedriveChanges` to treat portal `active=false` as an archive
signal (push `active_flag=false` and/or exclude those SKUs), unifying retirement into the
one pipeline run.

> **Update 2026-07-06 — this condition was acted on the same day (see #0079).** Rather than
> wait for the trap to bite, `computePipedriveChanges` now treats portal `active=false` as an
> archive signal and `push-prices.ts` archives inline, so a single `--target=pipedrive` run
> keeps availability in sync and never resurrects a retired SKU. The dedicated
> `scripts/archive-eol-pipedrive-products.ts` and its hardcoded `EOL_SKUS` list were deleted.
> The archive-not-delete principle here is unchanged; only the "separate deliberate step"
> mechanism is superseded.
