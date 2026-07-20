# 0083 — Partner visibility of own Project Quotes

Status: Proposed (2026-07-15) — **built to the review gate 2026-07-20**: migration `20260720000001_project_quotes_partner_select.sql` + rollback + partner download route + My Pipeline UI + gated RLS tests (`RUN_0083_TESTS=1`) are written but NOT applied. Awaiting Andy's manual review of the policy and route gate, then dashboard SQL-editor apply and test run.
Deciders: Andy Newbom
Amends: 0059 (project_quotes RLS, internal-only) and the internal-only download route handler.
Relates to: My Pipeline, `project_quotes` RLS, `src/app/(app)/api/admin/submissions/[id]/project-quote/pdf/route.ts`.

## Context

A partner's final quote reaches them by email from Pipedrive but never appears in their portal. Their My Pipeline shows their calculator submissions and System Estimate, then goes quiet. Loop closure is missing.

This is not a simple view addition. ADR 0059 deliberately makes `project_quotes` internal-only at the RLS level because a row holds partner pricing and customer PII, and the PDF download route is gated to active-internal/admin by design. Showing a partner their own quote is a scoped reversal of that security decision and touches two surfaces: the RLS SELECT policy and the route gate.

## Decision

Surface a partner's **own** Project Quote revisions in their My Pipeline, under the relevant project, as downloadable documents. Constraints:

- Partner pricing appears **only inside the quote PDF**, never rendered as portal UI.
- A partner can see only their own records. No partner can reach another partner's quote.
- Access is scoped to the owning partner (the account the quote was prepared for), read-only.

## Consequences

- `project_quotes` RLS must widen from internal/admin-only to also allow the owning partner to SELECT their own rows, and the download route gate must allow that same partner. Both are security surfaces holding pricing and PII.
- Requires a reliable owner linkage on the quote (or its submission) to scope the RLS by partner. Confirm the linkage exists before implementation.
- Overlaps the Q1 loop-closure goal: once a partner can see the quote, "quote sent" state is implicit.
- The internal generation and internal-only "Make New Project Quote" controls are unchanged; only read access to the finished document widens.

## Gates

- **Stop-and-flag before any RLS or route-gate change.** This is a security-boundary change under the standing rule. Manual review of the policy and the gate required; no `supabase db push` without review.
- Verify per-partner scoping with an explicit cross-partner negative test (partner A cannot read partner B's quote) before it ships.
