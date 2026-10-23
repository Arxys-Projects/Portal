# 0167 - A guard trigger on submissions lets partners change only status and is_preferred

- **Status**: Accepted (applied by Andy 2026-10-22 after the deploy; live RLS suite passes in full, 26a to 26g; see the [apply note](../apply-notes/0167-submissions-guard-writes.md))
- **Date**: 2026-10-22
- **Related**: 0151 (the pattern), 0152 (on-behalf FK as the Project Portal grant), 0037 / 0081 (status and the delete guard), 0093 (revision lineage), 0164 (`is_internal()` requires active), 0166 (snapshot re-baseline)

## Context

`authenticated` holds table-wide INSERT, UPDATE and DELETE on `submissions`, and the policies
check only `partner_id = auth.uid()`. Any signed-in partner can therefore write any column of
their own rows over REST (baseline audit B1-S-2 / B1-A-1, confirmed live 2026-10-19). Writing
`pipedrive_deal_id` and then revising makes the server overwrite any Pipedrive deal. Writing
`on_behalf_of_partner_id` shares the row, labeled "Prepared by Arxys", into another partner's
pipeline (B1-S-13), and ADR 0152 makes that column the Project Portal visibility grant. Six
service-role name lookups trust the same column (B2-S-10 / B2-A-12). A partner can also move a
won row back to open and then delete it.

The calculator wrote two of these columns itself with the partner's session: the
`email_sent_at` stamp and the `pipedrive_deal_id` link. The staff relink and resend actions
wrote the same two through the caller's session. There is no SQL-only fix while those writes
stay on the session client.

## Options considered

- **Column grants** (revoke table UPDATE, grant `update (status, is_preferred)`). They bind
  admins too, and a later table-wide grant reopens the hole silently. They cannot express the
  INSERT rules either.
- **"Set once" rule on `pipedrive_deal_id`** (writable while null). Rejected by the security
  review: a partner sets it once on a fresh row.
- **Move the partner INSERT to the service-role client as well.** It also stops forged sizing
  figures, but it is a larger change to the one action Step 4 rewrites next.
- **Allow-list guard trigger, plus server-side stamps** (chosen).

## Decision

`trg_submissions_guard_writes` runs `public.submissions_guard_writes()` BEFORE INSERT OR
UPDATE on each row. SECURITY INVOKER, `search_path` pinned empty, EXECUTE revoked from client
roles, as in ADR 0151.

- `service_role` and direct SQL pass. The FK's ON DELETE SET NULL runs as the table owner and
  passes too. An active admin (`is_admin(auth.uid())`) may write anything.
- UPDATE by anyone else may change only `status` and `is_preferred`. Moving `status` away from
  `won` or `lost` also needs an active internal user (Andy's decision of 2026-10-19).
- INSERT by anyone else may not set `pipedrive_deal_id`, `email_sent_at`, `pdf_url`,
  `total_partner_price_usd` or a non-default `created_at`. The on-behalf columns need an
  active internal user. `parent_submission_id` must point at a row the caller's own SELECT
  policy shows them.
- A refusal raises `42501` and names the columns.

In the app, `submitCalculation`'s two stamps, the relink link and the resend stamp move to the
service-role client, scoped to a row the caller just inserted or was gated for. My Pipeline
shows "Prepared by Arxys" only when the creator is staff, and drops a row shared in by anyone
else. For a partner, My Pipeline asks for confirmation before setting Won or Lost, then shows
that row's status as locked with "Ask your Arxys rep to change". Rows the viewer can see but not
change (prepared for them, or another partner's row seen by staff) show the status locked too. A refused reopen that still
reaches the server says the same.

## Consequences

**Positive:** the deal-overwrite, the planted share and the reopen-then-delete paths are closed
in the database, whatever client calls it. Any column added later is protected on UPDATE until it
is allow-listed. Won and lost are now final for partners, which ADR 0037 had left reversible (Andy's decision of 2026-10-19). Step 4 Phase B
can write `on_behalf_of_partner_id` knowing only staff can.

**Negative:**

- A partner's direct REST INSERT can still bank sizing and price figures the server did not
  compute, and can insert a row as `won` or `lost`. Those figures reach Pipedrive if staff press
  Retry Pipedrive link on the row: relink sets the deal value from the banked
  `total_list_price_usd`, and on a revision it updates the parent's real deal. Closing that
  means moving the INSERT to service role (or recomputing the value in relink).
- The INSERT rules are a list of named columns. A column added later is partner-writable on
  INSERT until it is added to the guard's INSERT list.
- Internal non-admin users lose session writes to anything but status and preference on their
  own rows. Staff tools, and any Phase B in-place UPDATE of `submissions`, must write as service
  role.
- The code must deploy before the migration is applied, or a fresh submit creates a Pipedrive
  deal it cannot link. For the same reason the app must never be rolled back past this change
  while the trigger exists.
- The UPDATE check compares every column. A BEFORE UPDATE trigger added later that sets a column
  (an `updated_at` stamp, say) must sort after `trg_submissions_guard_writes`, or every partner
  toggle is refused. A stored generated column would need excluding from the comparison.
- My Pipeline decides "Prepared by Arxys" from the creator's current flags. If a rep's internal
  flag is later cleared, the quotes they prepared drop out of their partners' pipelines.
- A SECURITY DEFINER function that updates `submissions` later bypasses the guard and must check
  for itself. The on-behalf target's eligibility (active, non-internal) is still checked only in
  the app.

**When to revisit:** when `submitCalculation`'s INSERT moves to service role (then the INSERT
rules can tighten to "service role only"), when a column is added to `submissions`, when
partners get an editable field on a submission, or when the no-argument role helpers of B1-A-6
replace `is_admin(uuid)` / `is_internal(uuid)`. That migration must update this guard too.
