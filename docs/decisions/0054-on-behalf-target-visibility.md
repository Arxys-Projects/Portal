# 0054 — Per-user on-behalf target visibility

- **Status**: Accepted
- **Date**: 2026-06-12

## Context

ADR 0045 let internal users run a calculation on behalf of a partner, but keyed visibility on the creator (`submissions.partner_id` = the internal rep). The partner the work was prepared *for* could not see it — 0045's own "When to revisit" flagged this as the follow-up. We want the named partner to view and revise on-behalf calculations from their own account, without widening the grant beyond what that needs.

Two facts shape the grant. First, `submissions.on_behalf_of_partner_id` is already an FK to a single `partners` row (a single portal user), and `partners.id IS auth.uid()` — so a per-user predicate is a direct mirror of the existing `submissions_select_own_or_admin` policy. Second, submissions are immutable in practice (ADR 0017); a partner "edits" by revising — reading the source row and saving a fresh row they already own (Phase 4 Step 3). So read access on the source is the whole requirement; no new write path is needed.

## Options considered

- **Company-wide visibility (every user at the target company).** Rejected — broader than asked; `on_behalf_of_partner_id` names one user, and company-level grants would need a company join that doesn't exist.
- **Grant SELECT + a new UPDATE/DELETE policy so the partner edits in place.** Rejected — redundant with the revise flow and a larger attack surface on an immutable table.
- **Per-user, additive SELECT-only policy mirroring the own-row predicate.** Chosen.

## Decision

- One additive RLS policy: `submissions_select_on_behalf_target` — `for select using (on_behalf_of_partner_id = auth.uid())`. Permissive, so it OR's with `submissions_select_own_or_admin` and `submissions_select_internal`; neither is touched. No insert/update/delete policy changes, no new columns.
- The on-behalf input becomes a **partner-user picker** (company → that company's active, non-internal users), replacing the free-text company-name `ilike` match. The chosen `on_behalf_of_partner_id` is sent directly and the server re-verifies it is an active, non-internal partner before binding the FK. This also removes the prior ambiguity where several users shared one company name.
- The **free-text company entry is retained** as a clearly separate secondary path for a company not yet onboarded. It sets `on_behalf_of_company_name` only — no FK, no visibility, because there is no portal user to grant it to. The "at most one of the two columns" CHECK from 0045 still holds.
- Partner-side surfacing: on-behalf rows appear in the target's `/submissions` pipeline with a **"Prepared by Arxys · {rep}"** marker. The page distinguishes "prepared for me" rows (FK = viewer, creator ≠ viewer) from "I prepared for someone" rows and suppresses the nonsensical self-company "on behalf of" label on the former.

## Consequences

**Positive:** the named partner sees and revises on-behalf work from their own account; the grant is exactly read access on exactly the named user's rows; self-serve isolation is unchanged and proven by the suite (8i + the unchanged 8g); the picker removes company-name ambiguity.

**Negative:** the picker needs the partner-user list (active, non-internal) plus emails joined from `auth.users` via the admin client in the calculator page loader — a scoped service-role read, like the dashboard's existing name resolution. A company with no portal user still gets no visibility (by design).

**When to revisit:** if company-wide (all users at a partner) visibility is ever wanted, or if a true collaborator/sharing model supersedes the per-user grant.
