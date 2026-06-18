# 0064 — Project Quote delivery via Pipedrive deal file attachment

- **Status**: Accepted
- **Date**: 2026-06-18

## Context

ADR 0059 established that a generated Project Quote is "emailed back" to the linked Pipedrive deal, but left the mechanism open. Step 6 has to actually deliver the rendered PDF somewhere the sales rep can retrieve it. The portal already writes deals, fields, and notes to Pipedrive but has no file-attach path, so delivery is a net-new external write surface. Two things had to be decided: where the PDF lands, and what happens when delivery fails after the quote is already persisted.

The quote row is persisted first and is fully re-renderable from its snapshot (ADR 0060), so delivery does not need to be transactional with persistence — the bytes can always be regenerated.

## Options considered

- **Send an email with the PDF attached** (to the rep, the customer, or both). Matches the loose "email-back" wording, but it raises immediate questions the feature is not ready to answer (who is the recipient, what is the body copy, is it customer-facing) and couples generation to the SMTP path. The portal's SMTP is for transactional auth/notification mail, not customer document delivery.
- **Attach the PDF to the Pipedrive deal via the Files API (chosen).** The rep already works the deal in Pipedrive; the quote lands where the commercial data already lives, with no recipient decision and no customer-facing send. `POST /v1/files` (multipart, `deal_id`) links the file to the deal.
- **Store the PDF in Supabase Storage and surface a portal link.** Held in reserve; it needs the Pro-tier storage bucket (ADR 0060 already parks stored bytes there) and a separate retrieval surface. The deal attachment is the lower-friction first delivery.

## Decision

A generated Project Quote PDF is delivered by attaching it to the linked Pipedrive deal through the Files API (`pipedriveClient.addDealFile(dealId, filename, buffer)`), reusing the existing token-appending URL builder and `PipedriveError` surface (a multipart sibling of `request()`, since `request()` is JSON-only). No email is sent. Delivery is **best-effort and non-fatal** (ADR 0020): the `project_quotes` row is persisted first, then the PDF is rendered and attached; a render or attach failure is logged and surfaced as a non-blocking notice, leaving a stored, re-deliverable quote. Re-running generation produces the next version and re-attempts delivery. The in-portal download (internal-only Route Handler) re-renders the current quote deterministically from its snapshot and is the always-available retrieval path independent of Pipedrive delivery.

## Consequences

**Positive:** delivery lands the quote where the rep already works the deal; no recipient/body-copy decision blocks the feature; reuses one auth path and one error type; a Pipedrive outage never costs a generated quote because persistence precedes delivery and the snapshot re-renders on demand.

**Negative:** the PDF is not pushed to the customer (the rep forwards it); a silent partial state is possible (quote stored, attach failed) that the operator must notice from the non-blocking notice and retry; the Files API is a new external write dependency to keep healthy.

**When to revisit:** if quotes must be emailed to a defined recipient, if a customer-facing delivery is required, or if attachments need to live in portal storage rather than (or in addition to) the deal.
