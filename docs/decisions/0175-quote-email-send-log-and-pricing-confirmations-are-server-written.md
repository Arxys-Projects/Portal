# 0175 - The Quote ready send log and pricing confirmations are written by server code only

- **Status**: Accepted (written, not yet applied; Step 6 Phase A of [the brief](../Portal-Project%20revamp/claude-code-brief-project-portal-backend.md))
- **Date**: 2026-10-23
- **Amends**: [0155](./0155-deal-lines-go-through-a-unique-keyed-ledger-pricing-confirmations-are-insert-only.md) (internal sessions lose INSERT on `quote_pricing_confirmations`)
- **Related**: 0170 (the deal claim and Andy's resolve script), 0171 (the ledger made server-written), 0152 (how a contact's login sees project quotes)

## Context

Step 6 adds a pricing gate in front of Project Quote generation and a "Quote ready" email to the
project's primary contact. Both are only as good as the rows behind them.

ADR 0155 let internal sessions INSERT a pricing confirmation as themselves. The gate compares the
deal's current lines with the latest confirmation's fingerprint, so any rep could post a fingerprint
of their choosing over REST and pass the gate without the deal ever being read. ADR 0171 closed the
same hole on the deal-line ledger.

The email must reach one address once per quote, survive a double click, and never retry a send
whose answer was lost, since a lost answer may still have delivered.

## Options considered

- **Send log keyed on the quote alone.** One email per quote. Blocks sending one quote to a second
  address later.
- **Unique on (quote, address), insert `sending` before SMTP** (chosen). A double click finds the
  row and stops. A failed or stuck row blocks only that address.
- **Retry a failed send automatically.** Out of scope, and a lost answer may have delivered.
- **Keep the confirmation INSERT policy and check the fingerprint in a trigger.** The trigger cannot
  read Pipedrive, so it cannot know the fingerprint is real.

## Decision

- `quote_email_sends` (`project_quote_id` restricting quote deletes, `to_email`, `sent_by`,
  `status`, `error`, `created_at`). CHECK `to_email = lower(to_email)` with an `@` after the first
  character; CHECK `status in ('sending','sent','failed')`; unique on (`project_quote_id`,
  `to_email`). Internal and admin SELECT. No INSERT, UPDATE or DELETE for `authenticated`;
  `service_role` holds all four, and DELETE is used only by Andy's clear script.
- A `failed` row, or a `sending` row a crash left, blocks that address until Andy clears it with
  `scripts/resolve-quote-email-send.mts` (Phase B, modeled on `resolve-project-deal-claim.mts`).
- `quote_pricing_confirmations`: the internal INSERT policy and grant are dropped. Internal and
  admin keep SELECT. `confirmDealPricing` (Phase B) writes the row as service role after its own
  actor check and a full read of the deal.
- The confirmation gains `deal_lines` (nullable jsonb array): the deal's lines as read when the
  fingerprint was computed. Rows from before Step 6 have none. Added now so Phase B needs no second
  migration.
- Simpler choices made where the prompt left two options: no `updated_at` on the send log (the
  status is the state, and `created_at` dates a stuck row); a 'sent' row is protected by the clear
  script, not by a trigger.

## Consequences

**Positive:** the gate's evidence comes from a Pipedrive read the server made. One quote reaches one
address once, whatever the rep clicks.

**Negative:** every confirmation and every send goes through server code. A failed send needs Andy
before that address can be tried again. The rollbacks reopen the gate bypass and drop the send
history.

**When to revisit:** when a resend action is wanted, or when reps should withdraw a confirmation.
