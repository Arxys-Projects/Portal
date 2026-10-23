# 0177 - A project's quote names the project's company and contact, and emails that contact once

- **Status**: Accepted (email behind `PROJECT_QUOTE_EMAIL`, default off; Step 6 Phase B of [the brief](../Portal-Project%20revamp/claude-code-brief-project-portal-backend.md); live test passed 2026-10-23; "Prepared for" is live, the email flag is off)
- **Date**: 2026-10-23
- **Related**: 0018 (partner emails BCC the SMTP mailbox), 0152 (how a contact's login sees project quotes), 0169 (the save-time sales email), 0174 (quote pin), 0175 (send log), 0176 (pricing gate)

## Context

A project calc is prepared for a company and a contact (Pipedrive org and person), but the Project
Quote's "Prepared for" came from the 2026-10-15 resolver, which names the rep's company on a project
calc (Step 4 note A-5). Step 6 also adds the partner-facing "Quote ready" email to the project's
primary contact, with the PDF and a portal or access-request link.

An internal session can still insert a `project_quotes` row with any snapshot over REST (ADR 0174
accepted that). Once the email reads its recipient and its gate proof from the snapshot, that matters
(review gate S-1, High).

## Options considered

- **Recipient read live at send time.** The quote would go to whoever is the contact now, not who it
  was made for. The prompt fixes the snapshot as the source.
- **Trust the snapshot as stored.** A forged row could email forged pricing to any address.
- **Move the quote INSERT to service role.** Closes it at the source, but needs a stop-and-flag
  migration; deferred.
- **Snapshot as the source, checked against live rows before sending** (chosen, as the interim).

## Decision

- **Prepared for:** a calc linked in `project_submissions` takes the project's company and primary
  contact, read by id as service role and frozen as `snapshot.preparedFor` (ids, names, email,
  active-and-still-at-the-company). The PDF names the company, plus the contact only while active.
  Every other calc keeps the resolver unchanged. A failed project read refuses the generate. This is
  not behind a flag; every generate now makes one more service-role read. The company also reaches
  the PDF's file name and so the Pipedrive deal title, which `generate.ts` sets from it.
- **`sendQuoteReadyEmail(deps, projectQuoteId, actor)`**, internal or admin, an explicit action only.
  It refuses unless the quote is its calc's newest version and still valid; the snapshot names a
  project contact with an email who was active; that contact is, read live by id, the primary
  contact of the quoted calc's own project, still active at its company, with the same email; and,
  for a portal-built deal, the snapshot's confirmation exists for this deal and calc, carries lines,
  is the deal's latest, and matches both the snapshot's fingerprint and its printed lines. It sends
  to the snapshot's address, lowercased.
- **Link:** the portal link (`/submissions/<id>`) only when ADR 0152's rule (`loadProjectForCalc`)
  gives a login and the calc's row carries that login as its grant; otherwise the sign-in page,
  where access is requested.
- **Headers:** From `SMTP_FROM`, To the contact, no CC, BCC `SMTP_USER` (ADR 0018) unless it is the
  To address, Reply-To `INTERNAL_NOTIFICATION_EMAIL` so a reply reaches sales. The transport adds
  nothing of its own.
- **Send log** (ADR 0175): a `sending` row before SMTP, then `sent` or `failed`; nothing retries.
  Andy clears a failed or stuck row with `scripts/resolve-quote-email-send.mts`, after checking the
  BCC copy, since a failure can still have been delivered.
- **Test override:** `deps.recipientOverride`, built only in `scripts/`; the log records the address
  used. A unit test fails if any app file mentions it.
- **Copy:** short, to a peer: what is attached, valid through when, where to find it. The project
  name is folded to one line and capped at 120 characters.
- **Step 4 A-5 (recorded here):** the save-time sales email and its PDF stay as they are (internal,
  recorders only, ADR 0169). The Quote ready email is the partner-facing one.
- Also accepted: the raw snapshot the owning partner can read now holds the project's ids and the
  contact's email (review gate S-5); usually that partner login is the contact.

## Consequences

**Positive:** project quotes name the right company and contact. One quote reaches one address once,
from what was frozen, and a forged or stale snapshot is refused for portal-built deals.

**Negative:** for a deal the portal did not build, a forged snapshot with that project's real contact
still passes these checks, and on any deal the snapshot's other parts (the total, the terms, the
sizing) are not checked; only a service-role INSERT closes that (review gate S-1, open). A failed
send needs Andy. The clear script deletes the row; it prints it first.

**When to revisit:** before `PROJECT_QUOTE_EMAIL` is turned on or a send button ships: move the
`project_quotes` INSERT to service role (ADR 0174's revisit condition), with a test-rls case.
