# 0079 — Fold Pipedrive EOL archiving into the price push (retire the standalone script)

- **Status**: Accepted
- **Date**: 2026-07-06

## Context

ADR 0078 retired EOL/superseded SKUs in Pipedrive by archiving (`active_flag=false`, not
delete) via a dedicated script, `scripts/archive-eol-pipedrive-products.ts`, run as a separate
step after the price push. It deliberately did **not** fold this into `push-prices.ts`.

That left a latent "resurrection" trap, called out in 0078's own consequences: because
`current_products` has no `active` filter, portal-deactivated SKUs still resolve in the view,
and `computePipedriveChanges` always sent `active_flag: true` for any SKU with a name/price
diff. So if an archived SKU were ever re-priced, the next `--target=pipedrive` run would
re-push it as active — silently un-archiving it and undoing the standalone script. The archive
list was also hardcoded (`EOL_SKUS`), so every future retirement meant editing code.

0078's "when to revisit" named the fix: teach `computePipedriveChanges` to treat portal
`active=false` as an archive signal. This ADR does that, closing the trap proactively rather
than waiting for it to bite.

## Options considered

- **Fold archiving into `push-prices.ts`, data-driven off portal `active` (chosen).** One
  pipeline run reconciles Pipedrive with the portal; no separate step, no hardcoded SKU list.
- **Exclude `active=false` SKUs from the push but keep the standalone archive script.** Closes
  the resurrection trap (never re-pushes active) but still leaves a manual second step and the
  hardcoded list — half a fix.
- **Keep 0078 as-is.** Rejected: leaves the documented trap live and the two-step chore.

## Decision

In `computePipedriveChanges`, route any `current_products` row with `active=false` to a new
`archiveInPd` bucket instead of `newInPd`/`updatedInPd`: it is never created and never
re-pushed active. If it exists in Pipedrive and is still `active_flag=true`, `pushPipedrive`
archives it (`PUT active_flag=false`, price untouched); already-archived or absent SKUs are
skipped (idempotent). The dry-run preview lists these under `[Pipedrive ARCHIVE …]`. Archived
rows are stamped `pushed_to_pipedrive_at` alongside pushed rows. `scripts/archive-eol-pipedrive-products.ts`
is deleted as redundant. Supersedes #0078 (the archive-not-delete principle is retained; only
its "separate deliberate step" mechanism is replaced).

## Consequences

**Positive:** A single `--target=pipedrive`/`--target=all` run keeps Pipedrive availability in
sync with the portal. The resurrection trap is closed — re-pricing a portal-inactive SKU can
no longer un-archive it. Retirement is data-driven (deactivate in the portal, done); no code
edit, no hardcoded list, no second script to remember.

**Negative:** Pipedrive archiving now rides on portal `active`, so a mistaken portal
deactivation would archive the product in Pipedrive on the next run (still reversible — archive,
not delete; and surfaced in the dry-run preview first). Reactivating a SKU in the portal
re-pushes it active, which is the intended inverse.

**When to revisit:** if we ever need Pipedrive availability to diverge from portal `active`
(e.g. keep a SKU sellable in Pipedrive while hidden in the portal), this coupling would need an
explicit override.
