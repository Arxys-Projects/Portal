# 0169 - Project calc saves make no Pipedrive call and email sales only

- **Status**: Accepted
- **Date**: 2026-10-22
- **Related**: 0020 (Pipedrive failure never fails a save), 0040 (revisions update the deal in place), 0018 (the partner copy of the report), 0015 (the sales BCC), 0152 (the contact login's visibility grant), 0165 (the banked design)

## Context

`submitCalculation` creates a Pipedrive deal on every fresh save, finding the org and person by
name (`upsertOrganization`, `upsertPerson`), and updates the source's deal in place on a revision.
Step 0 found that name-based upsert has already created duplicate orgs next to the labeled ones.
Project calcs are prepared for a company and contact keyed by Pipedrive id, and Step 5 creates
their deal by id, with product lines, behind `PROJECT_DEAL_PRODUCTS`.

The same action emails two messages on a fresh save: the sales notification to
`INTERNAL_NOTIFICATION_EMAIL` (sales@arxys.com) with the PDF and the ADR 0015 BCC, and a "Your
Arxys Video Storage Report" copy to the caller. On a project calc the caller is the Arxys rep, and
the customer's "Quote ready" email belongs to Step 6.

## Options considered

- **Run today's deal sync for project calcs until Step 5.** Every project calc would get a deal by
  name, which Step 5 would then have to find, re-link or close.
- **Create the deal by id now.** That is Step 5's work, and it needs Andy's go-ahead before any
  live Pipedrive write.
- **No Pipedrive call for a project calc, fresh or revised** (chosen). The row, its project link and
  its banked design are saved; `pipedrive_deal_id` stays null until Step 5.

## Decision

- `submitCalculation` returns before the Pipedrive block when the save is a project calc. The
  name-based upsert, the deal create, the in-place revise and the deal link never run for one.
- A non-internal caller revising a project calc is refused with a plain message before anything is
  written. The primary contact's login can see the calc through `on_behalf_of_partner_id` (ADR
  0152), and the partner revise path would otherwise create a deal by name for a source with no deal.
- A fresh project calc renders the PDF and sends the sales notification exactly as today, with no
  `partnerEmail`, so the second message is skipped (Andy, 2026-10-22). The address stays in the env
  var. A revision sends no email, as today. The `email_sent_at` stamp is written as service role, as
  ADR 0167 set.
- Staff "Retry Pipedrive link" (`adminRelinkPipedriveDeal`, also behind the `/projects` row action)
  shows on every row with no deal, so every project calc. It now refuses a calc linked to a project,
  or a row whose parent is one, with a plain message before any Pipedrive call (review gate findings
  A-3 and S-5). The button still shows; hiding it needs the page to read the link, which is screen
  work.
- The save is cleanly separable: the project check is made before any Pipedrive state is built, so
  nothing on the shared path had to be worked around.

## Consequences

**Positive:** no project calc can reach the old name-based deal path from the calculator, and Step 5
starts from rows with no deal attached. The rep is not sent a copy of their own report.

**Negative:** until Step 5 ships, a project calc is not in Pipedrive at all, so sales sees it only in
the portal and the sales email. The sales email and its PDF name the rep's own company as the
"partner", because the caller is the rep; the project's company and contact appear only through the
calc name. The PDF and email also list the recorders only, with no failover, management or
workstation lines (review finding A-5, for Step 6).

**When to revisit:** Step 5, when project calcs get their deal by id; Step 6, when the contact gets
the "Quote ready" email.
