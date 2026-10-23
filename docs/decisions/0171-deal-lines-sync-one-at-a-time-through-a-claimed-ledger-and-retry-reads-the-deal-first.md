# 0171 - Deal lines sync one at a time through a claimed ledger, and a retry reads the deal first

- **Status**: Accepted
- **Date**: 2026-10-23
- **Related**: 0150 (Pipedrive products, duplicate codes), 0155 (deal-line ledger), 0161 (one BOM line per SKU and role), 0170 (the deal claim)

## Context

After the deal exists, Step 5 adds one line per BOM line with `POST /api/v2/deals/{id}/products`.
The ADR 0155 ledger (`deal_line_syncs`, unique on deal, SKU and role) records each line as pending,
added or failed. Two problems remained. A `pending` row can mean the process died after the POST
reached Pipedrive (function timeout, deploy, crash), so a retry that trusts the ledger can post the
line twice. And two retries started together both see the same `failed` rows. A lock per deal does
not survive across PostgREST requests.

The v2 reference (checked 2026-10-23) marks `item_price` as required with no default, so the product's
own price is not filled in when it is left out. `comments` is a free-text field on each line.

## Options considered

- **Trust the ledger on retry.** Simple; posts a line twice after a crash between POST and update.
- **Lock per deal (advisory lock).** Does not hold across separate PostgREST calls.
- **Claim each row with a conditional update to a new `sending` status, and always read the deal
  before posting** (chosen). Needs a CHECK change on the ledger.
- **Bulk endpoint (100 lines per call).** One call is all or nothing for Pipedrive but gives no
  per-line attachment id mapping if the answer is lost.

## Decision

- The ledger's status gains `sending` (same migration as the claim table, `20261023000001`).
- The ledger becomes server-written only: the migration drops Step 1's internal INSERT and UPDATE
  policies and grants, and internal sessions keep SELECT (review gate S-1). A retry posts each row's
  product and quantity, so a row edited over REST would otherwise put a product or a quantity on a
  deal outside the preview and confirm flow. As a second guard, a row is posted only when its product
  and quantity agree with the confirmed lines and the banked BOM; otherwise it is marked `failed`.
- Create inserts every line as `pending` before any line POST. Every call (create and retry) then
  works in one order: claim each open row (`pending` or `failed` to `sending`, a conditional update
  that returns the row's new `updated_at` as a fence), then read the deal's current lines, then go
  through its claimed rows. A row whose line is already on the deal (same product id, same role in
  the comment, an attachment id no other row holds) is marked `added` with that id and never posted.
  Otherwise the fence is renewed right before the POST, and the row ends `added` with the attachment
  id or `failed` with the error text (no token in it). Every write is conditional on the fence, so a
  call whose row was taken over neither posts it nor writes to it. A failed line does not stop the
  others, and the deal is never deleted automatically.
- A `sending` row older than 8 minutes is a stopped call and is taken over, matched on its exact
  `updated_at`. Because the fence is renewed before each POST, the window has to outlast one line
  post (six 30 s attempts and five 429 waits of at most 30 s: 5.5 minutes), not a whole run.
- The line's role goes in `comments` as `Arxys role: <role>`, so retry and the diff can tell two
  roles of one SKU apart; the diff reads it case-insensitively.
- `item_price` is the Pipedrive product's USD price exactly as `GET /api/v2/products` returned it.
  Nothing is multiplied, rounded or read from `current_products`. The preview fingerprint uses the
  existing `DealLineFingerprint[]` shape with `line_amount` left null (computing it would be price
  math) and is compared only with a fresh preview through `sameLineItems`.
- A retry sends the price the rep confirmed (stored on the claim) and warns when Pipedrive has
  changed since. When the ledger is missing rows (the create stopped before writing them), a retry
  seeds them only if a fresh preview still matches the confirmed fingerprint.
- Every create and retry reads the deal back and runs `diffBomAgainstDeal` (by SKU and role:
  missing, extra, quantity, and a line under another role). `diffDealLines` is the read-only form,
  for revisions, which never rewrite lines.
- 429s wait for `x-ratelimit-reset` and retry (`postJsonV2` beside the Step 2 client, and the shared
  product read in `product-api.ts`). Any other failure is not retried inside the call. A POST with
  no answer, a timeout or a 5xx is recorded as possibly sent.

## Consequences

**Positive:** no path posts a line the deal already carries, two retries never post one line twice,
and every write ends with a diff that shows what the deal actually holds.

**Negative:** internal sessions can no longer write the ledger, so any future screen action
writes it through server code. Lines a stopped call left in `sending` wait 8 minutes before a retry
takes them. One GET of the deal's lines per call, and a full product read per preview, create,
retry and diff. A rep who edits a line's comment in Pipedrive can make the diff report it as extra.
A retry after a price change sends the confirmed, older price; the warning says so.

**When to revisit:** if Pipedrive adds an idempotency key for deal products, or the product list grows
enough that a full read per call costs too much.
