# 0083 — Partner visibility of own Project Quotes

**Status:** Accepted (ships on migration approval)
**Date:** 2026-07-21
**Amends:** 0059 (internal-only Project Quote wall)
**Related:** 0089 (Customer Proposal + partner logo system) rides on this policy

## Context

0059 walled Project Quotes to internal staff only. Partners could not see or
download the quote revisions generated for their own deals. Partners are real,
active portal users who requested this; giving a partner access to their own
quote is low-risk because the row is already scoped to their submission.

The backend for this was built to the review gate on 2026-07-20 (see JOURNAL
entry "Portal UX pass"). This ADR records the decision to apply it.

## Decision

Widen the `project_quotes` SELECT policy to the owning partner — the submission
creator, or the on-behalf-of target partner — while keeping INSERT internal-only
and the table immutable. A partner can read and download the Project Quote(s)
attached to their own submission; they cannot create, edit, or delete one.

Access is delivered through a single partner-facing route that is double-gated:
an explicit ownership check in the route handler, plus RLS enforcement at the
database. Both must pass.

## What was built to the gate (2026-07-20)

- **Migration** `20260720000001_project_quotes_partner_select.sql` — widens the
  `project_quotes` SELECT policy to the owning partner via an `EXISTS` on
  `submissions` (creator OR on-behalf target). INSERT stays internal-only; the
  table stays immutable. **Not yet applied.**
- **Rollback** `supabase/rollback/project-quotes-partner-select-rollback.sql`.
- **Route** `/api/submissions/[id]/project-quote/pdf` (optional `?version=`),
  double-gated (handler ownership check + RLS).
- **UI** "Project quotes" download row in My Pipeline groups — renders empty
  until the policy is applied.
- **RLS tests** 20a–20d behind `RUN_0083_TESTS=1`: owner-positive,
  cross-partner negative, on-behalf-positive, insert-still-blocked.

## Gate to apply

This touches a live RLS policy on a table holding partner-priced documents.
Applying it is a stop-and-flag action. Andy applies the migration (the agent
does not hold DB DDL credentials — see the 2026-07-17 CLI 401 note). Sequence:

1. Backup taken.
2. Read-only dry run / verification plan reviewed.
3. Andy applies `20260720000001_project_quotes_partner_select.sql`.
4. RLS suite run with `RUN_0083_TESTS=1` — all four cases pass.
5. My Pipeline download row confirmed live for a partner-owned submission and
   confirmed blocked for a cross-partner submission.

Rollback is `project-quotes-partner-select-rollback.sql` if any check fails.

## Consequences

- Partners can self-serve their own Project Quote PDFs; fewer manual sends.
- The same widened SELECT policy is the access path 0089's Customer Proposal
  rides on — no additional RLS surface is introduced by 0089.
- INSERT remains internal-only, so partners still cannot generate quotes; the
  quoting engine and Step 6 flow are unchanged.
