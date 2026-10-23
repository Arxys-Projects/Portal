# 0152 — A project contact's login sees its quotes through `on_behalf_of_partner_id`

- **Status**: Accepted (decided by Andy 2026-10-16, at the Project Portal backend Step 0 gate). Built in Step 4 of [the brief](../Portal-Project%20revamp/claude-code-brief-project-portal-backend.md).
- **Date**: 2026-10-16
- **Related**: 0045 / 0054 (the on-behalf columns and the per-user grant), 0083 (partner download of own Project Quotes), 0099 (company grouping), 0055 (the consolidated SELECT policy), [0177](./0177-project-quotes-name-the-project-contact-and-email-them-once.md) (a project calc's quote names the project's company and contact, not the on-behalf partner; the Quote ready email uses this ADR's rule for its portal link)

## Context

The Project Portal backend adds internal projects, prepared for a company (Pipedrive org) and a
contact (Pipedrive person). A contact may have a linked portal login (`partner_contact_links`);
most don't. The brief locked two rules that turned out to conflict:

- "A contact with a linked login sees their quotes through the existing per-person path."
- "Project calcs ... the on-behalf columns remain for old rows" (do not write them).

The existing per-person path *is* `submissions.on_behalf_of_partner_id`. It is the term in
`submissions_select_authorized` that lets a partner read a row they didn't create (ADR 0054). It
also drives their Project Quote download (`project_quotes` SELECT, ADR 0083), their My Pipeline
"Prepared by Arxys" rows, and the company bucket in `groupIntoDeals` (ADR 0099). Leave it unset
and the contact's login sees nothing; set it and the "don't write on-behalf" rule breaks.

## Options considered

- **(a) Write the FK as the visibility grant.** On a project calc, set `on_behalf_of_partner_id`
  to the primary contact's linked login when there is exactly one. Never write
  `on_behalf_of_company_name`. No RLS change; every existing reader works as it does today.
- **(b) New read policies.** Add SELECT on `submissions` and `project_quotes` through a
  security-definer helper over `project_submissions` → `projects` → `partner_contact_links`.
  A cleaner data model, but a stop-and-flag RLS change on the two most sensitive tables, and
  every reader that keys on the FK (My Pipeline labels, grouping) needs teaching.
- **(c) No partner visibility for project calcs.** Email only. Contradicts the locked
  visibility decision.

## Decision

Option (a). On a project calc, `submitCalculation` sets `on_behalf_of_partner_id` to the
primary contact's linked login only when exactly one exists. It verifies that login server-side
the way today's picker does (active, non-internal). With no login, or more than one, the column
stays null, and the contact gets the quote by email (brief Step 6).
`on_behalf_of_company_name` is never written on project calcs. The project, company and contact
live in `project_submissions` and the project tables, which partners can't read. The FK is the
only thing that grants the partner a read.

`partner_contact_links` stays internal-only: the partner never reads the link, only the rows
the FK exposes.

## Consequences

**Positive:** no RLS change. The partner-facing pipeline, the Project Quote download and company
grouping work for project calcs exactly as for today's on-behalf calcs. The existing CHECK (at
most one on-behalf column set) still holds.

**Negative:** the FK now carries two meanings: "prepared on behalf of" on legacy rows, and
"visible to this contact's login" on project calcs. Readers that must tell them apart join
`project_submissions`. A contact with two logins gets no portal visibility until one is chosen
as theirs. If a link changes after the calc is saved, the row keeps the old FK. A revision
re-resolves it, but nothing back-fills.

**When to revisit:** if contacts commonly have several logins, if company-wide visibility is
wanted (that needs real policies, option b), or if the two meanings of the FK start producing
wrong labels in partner-facing views.
