# 0024 — Partner submission history at `/submissions`, RLS-only scoping

- **Status**: Accepted
- **Date**: 2026-05-20

## Context

Phase A added a "Submission history" card on the dashboard that links to `/submissions` (route didn't exist yet). Phase B has to actually serve that route and the per-submission detail page. The question is where partner-facing submission routes live, how they're scoped to the calling partner's rows, and how much they share with the admin-facing equivalents.

The `submissions` RLS policies (`supabase/migrations/20260515193702_initial_schema.sql:212-220`) already restrict SELECT to `partner_id = auth.uid() OR is_admin(auth.uid())` and INSERT to `partner_id = auth.uid()`. So a partner-facing page that simply runs a user-scoped SELECT inherits the scoping for free.

## Options considered

- **Embed the history inside `/dashboard`.** Single URL to remember, but the dashboard grows unbounded as feature cards land. Detail views still need their own route, so we'd be inventing one anyway.
- **Dedicated `/submissions` + `/submissions/[id]` route group with application-level partner_id filter.** Clean URLs, but the application filter adds a layer that can drift from RLS — if we ever forget the `.eq('partner_id', user.id)`, RLS catches it, but the duplicate is dead weight at best and a source of bugs at worst.
- **Dedicated `/submissions` + `/submissions/[id]` route group, RLS-only scoping.** Clean URLs and the policy lives in one place — RLS. The page code reads "give me submissions" and the database returns the ones this user can see.
- **PDF-only retrieval (no in-portal detail view).** Cheapest to build but loses the ability to link a partner to a specific submission from email or to share state between the calculator UI and the saved version.

## Decision

**Dedicated `/submissions` and `/submissions/[id]` routes under `src/app/(app)/`, scoped only by RLS.** The detail page reuses the same `<SubmissionDetail />` component as `/admin/submissions/[id]`; a `mode: 'admin' | 'partner'` prop toggles the partner-info header line and the Pipedrive link.

## Consequences

**Positive:**
- One place defines who can see what: the RLS policy. Page code can't accidentally widen the scope.
- Shareable per-submission URLs work as expected — sending a colleague a link gets them a 404 unless they're an admin or the row owner.
- Shared detail renderer means a future change to the layout updates both admin and partner views at once.

**Negative:**
- Partners cannot share a submission with each other inside the portal. If two partners legitimately need to collaborate on the same submission, they'll need to forward the PDF — acceptable for v1; a sharing model would be its own ADR.
- The shared component has to gracefully handle the admin-only fields (Pipedrive link, partner price) being absent in partner mode. Mild conditional complexity inside one component; preferable to a duplicate file.

**When to revisit:**
- If we need cross-partner submission sharing (token-scoped read access).
- If the partner submission detail grows substantially different from the admin one (e.g. dedicated re-run / clone affordance) — at that point splitting into two distinct components may read more cleanly than threading a mode flag.
