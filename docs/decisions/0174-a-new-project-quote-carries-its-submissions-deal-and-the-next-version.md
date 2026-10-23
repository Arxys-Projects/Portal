# 0174 - A new Project Quote carries its submission's deal and the next version

- **Status**: Accepted (Step 6 Phase A of [the brief](../Portal-Project%20revamp/claude-code-brief-project-portal-backend.md); applied by Andy 2026-10-23, live RLS suite passes including 19i, and a real generate works on it)
- **Date**: 2026-10-23
- **Related**: 0059 / 0061 (Project Quote snapshot and per-submission versioning), 0083 (the partner downloads the latest version), 0040 and 0173 (revisions share their source's deal), 0167 (only server code sets a submission's deal)

## Context

Baseline row B1-S-4: `project_quotes` RLS lets an internal session INSERT a row with any deal id or
version, as long as `generated_by` is itself. A quote is immutable and the owning partner downloads
the latest version, so a forged high version would shadow the real quote for good.

Versioning is per submission. The only key is `unique (submission_id, version)`, `assemble.ts`
computes `max(version)+1` per submission, and `generate.ts` re-assembles once when its insert hits
23505. Revisions share their source's deal, so one deal can have several version 1s.
`pipedrive_deal_id` is `not null`.

## Options considered

- **Move the INSERT to service role.** Closes the whole row (snapshot included). It changes the
  generate path and was left for later in the backlog row.
- **Trigger that sets the deal id and version itself.** Nothing to refuse, but a caller's values
  would be silently replaced, and `generate.ts` would report a version it did not store.
- **Trigger that refuses a wrong deal id or version** (chosen). The legitimate path already sends
  the right values, so it passes unchanged.
- **Version per deal.** What the first draft of the Step 6 prompt said. It would refuse every
  revision's first quote.

## Decision

`public.project_quotes_pin()`, a BEFORE INSERT trigger for every caller, `SECURITY DEFINER` with
`search_path = ''`, so the caller's RLS cannot hide a row from it:

- A session that is neither internal nor admin is refused first (42501). It learns nothing about a
  submission from the checks below. Service role and the dashboard carry no `auth.uid()` and skip
  this.
- `pipedrive_deal_id` must equal the submission's `pipedrive_deal_id`. A submission with no deal,
  or no submission, is refused (23514).
- `version` must be `max(version)+1` for the submission. A version at or below the max answers
  **23505**, so a generate that lost a race gets the code `generate.ts` already retries on. A
  version above max+1 is a skipped version (23514).

Two generates at once both compute N. If the first has not committed, the second passes the trigger
and the unique key refuses it. If it has, the trigger sees the new max and refuses it. Both answer
23505. Existing rows are not touched or re-checked.

## Consequences

**Positive:** B1-S-4 is closed for the deal id and version. Legacy, partner-deal and project-deal
generates insert exactly what they did before. The race behaves as it did.

**Negative:** the snapshot itself is still whatever the internal caller sends; only moving the
INSERT to service role closes that. One more read of `submissions` and one `max()` per generate.
`getDealForQuote` stores the id Pipedrive returns (`deal.id`). If Pipedrive ever answered with
another deal (a merged deal, for example), the generate now fails with "could not be saved" instead
of storing a quote under the other deal.

**When to revisit:** when the generate INSERT moves to service role, or when options and phases put
several quotes of one calc on different deals.
