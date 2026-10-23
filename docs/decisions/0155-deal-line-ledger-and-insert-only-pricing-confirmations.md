# 0155 — Deal lines go through a unique-keyed ledger; pricing confirmations are insert-only

- **Status**: Accepted (written, not yet applied; Step 1 of [the brief](../Portal-Project%20revamp/claude-code-brief-project-portal-backend.md))
- **Date**: 2026-10-16
- **Amended by**: [0171](./0171-deal-lines-sync-one-at-a-time-through-a-claimed-ledger-and-retry-reads-the-deal-first.md) (2026-10-23): the ledger gains a `sending` status, and internal sessions lose INSERT and UPDATE on it; only server code writes it.
- **Amended by**: [0175](./0175-quote-email-send-log-and-pricing-confirmations-are-server-written.md) (2026-10-23): internal sessions lose INSERT on `quote_pricing_confirmations`, which gains `deal_lines`; only server code writes it.
- **Related**: 0150 (Pipedrive products, `is_linkable`), 0098 (revisions vs attached deal products), 0093 (revision lineage shares a deal)

## Context

For Arxys-started projects the portal adds BOM lines to the Pipedrive deal one at a time (Step 5), and
a partial failure must be retryable without adding a line twice. Step 6 gates Project Quote generation
on the rep confirming pricing, and must notice when the deal was edited in Pipedrive afterwards. Both
shapes were settled at the Step 0 gate; this records the integrity rules around them.

## Options considered

- **Retry safety**: rely on the retry code to skip added lines vs a database unique key on
  (`pipedrive_deal_id`, `sku`, `role`) that makes a second add impossible.
- **Ledger deletes**: allow vs no grant. Deleting a row would let a retry re-add a line that is
  already on the deal.
- **Confirmations**: one updatable row per deal vs insert-only history where the latest row counts.

## Decision

- `deal_line_syncs`: unique on (`pipedrive_deal_id`, `sku`, `role`); `status` pending / added /
  failed; `added` requires `pipedrive_deal_product_id`; `item_price_sent > 0`; internal and admin
  SELECT, INSERT (as themselves) and UPDATE; no DELETE. `submission_id` restricts submission deletes,
  like `project_quotes`.
- `quote_pricing_confirmations`: internal and admin SELECT and INSERT (as themselves) only; no UPDATE
  or DELETE. The gate reads the latest row per deal and compares `deal_lines_fingerprint` (a jsonb
  array) with the deal's current lines; a mismatch needs a new confirmation.

## Consequences

**Positive:** "never add a line twice" holds even if the retry code has a bug. A confirmation cannot
be back-dated or rewritten, and the history shows every re-confirmation.

**Negative:** a wrongly recorded ledger row can only be fixed through service_role. Deleting a
submission that has deal lines or a confirmation needs those rows removed first.

**When to revisit:** options and phases (several calcs on one deal could need the same SKU and role
twice; widen the key with `submission_id`), or if reps need to withdraw a confirmation.
