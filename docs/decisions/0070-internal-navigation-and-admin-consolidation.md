# 0070 — Internal navigation and admin landing consolidation

Status: Accepted
Date: 2026-06-22

## Context

The internal (Arxys-side) project-management surface has three overlapping
entry points that admins and internal users have to bounce between to manage a
single deal:

1. `/submissions` — the user's own weighted-forecast pipeline ("Pipeline" in the
   header). For an internal user this is scoped to their own rows.
2. `/admin/submissions?groupBy=partner` — the partner-grouped, all-partner
   weighted forecast.
3. `/admin/submissions` — the flat, all-partner submissions list.

Views 2 and 3 are the same page distinguished by the `groupBy` query param, so
the flat list is a view of the grouped page, not a separate destination.

The header nav currently carries both **Pipeline** and **Submissions** two slots
apart with near-synonymous labels, plus **Partners** (a partner-management
destination, not a pipeline view) wedged alongside them. A 2026-06-05 change
shortened the labels purely to fit the bar on one line ("My Pipeline" →
"Pipeline", "All Submissions" → "Submissions"), which is how "Submissions" came
to read like a random list. The crowding (seven nav items + two buttons) and the
label collision are the root of the "which one do I use?" confusion.

Gating is already correct and is NOT in question here: internal users
(`is_internal = true`) and admins see all partners' submissions; regular
partners see only their own (RLS-enforced, Phase 8 Step C). Partner-facing views
already omit internal-only controls (Generate Project Quote, Pipedrive link),
gated twice server-side.

## Options considered

1. **Rename the views in place, leave them all in the header.** Rejected: does
   not fix the crowding; three pipeline-ish items still compete for attention.
2. **Merge `/submissions` and `/admin/submissions` into one page that switches
   scope by role.** Rejected for this pass: larger refactor, touches the
   own-rows vs all-rows data paths and the dashboard summary source; higher risk
   than the problem warrants right now.
3. **Pull the two admin-management items out of the header and surface them as
   cards on `/admin`; keep the personal Pipeline in the header; rename the
   grouped view; collapse the flat list into an in-page toggle.** Chosen.
   Smallest change that removes the collision and the crowding.

## Decision

- **Header nav** drops **Submissions** and **Partners**. Survivors: Dashboard,
  Calculator, Pipeline, QuickCompare, Price Book. "Pipeline" keeps its label and
  remains the user's own forecast at `/submissions`. The dropped items are
  reached through the **Admin** button, which stays and is now visible to
  `isAdminOrInternal` (previously admin-only).
- **`/admin/submissions`** is retitled **Partner Pipeline** on the page heading
  and on its `/admin` card. Partner-grouped is the default (no param); flat list
  is `?groupBy=flat`. One `/admin` card, not two.
- **`/admin` landing** gains cards for **Partner Pipeline** and **Partners**.
  For internal-non-admin users the page is **truncated**: only the cards they are
  entitled to render (Partner Pipeline, Partners). Admin-only cards (XLSX export)
  are not rendered at all, not shown disabled.
- **Submission detail (internal view)**: Generate Project Quote is promoted to
  the top action row as the primary action, styled distinctly (Download PDF and
  the other utility buttons demote to secondary when it is present). The fuller
  quote panel (version identifier, dates, download) stays anchored below as
  display-only. Gating is unchanged (`is_internal`).
- **Dashboard** summary card "My Pipeline Summary" is relabeled **Pipeline
  Summary** so it reads honestly for internal users, whose figure spans all
  partners.
- **All `/admin` card titles and blurbs** are rewritten to match the new naming.
  No leftover "Submissions" copy pointing at what is now "Partner Pipeline".

## Consequences

- The header is shorter and the personal-vs-all-partner distinction stops
  hinging on two similar labels in the same bar.
- Admin/internal users get a single, well-labeled admin home instead of scanning
  the header for scattered management destinations.
- No schema, RLS, or data-path changes. This is nav, routing, page-title, button
  placement, and copy work. The own-rows vs all-rows split and the dashboard
  summary source are untouched, so the deferred full merge (Option 2) remains
  available later.
- Any deep links or bookmarks to `/admin/submissions` continue to work; only the
  on-page title and the way users reach it change. `?groupBy=partner` still
  resolves to the grouped view (it matches `groupBy !== "flat"`).
- The flat list stops being a top-level destination; anyone who relied on it
  lands on Partner Pipeline and toggles to flat.
