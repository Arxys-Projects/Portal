# Claude Code brief — `/projects` schema and query layer (backend only)

Paste this whole file as the opening prompt for a new session. Model: Opus 5, high effort.

---

## What this session is and is not

This is **phase 1 of 2** for a new internal sales page at `/projects`. Phase 1 (this
session) is schema + query/service layer only — no route, no React, no page. Phase 2
(a later session, likely Sonnet) builds the actual page against whatever this session
returns. Do not build UI. If you find yourself writing a `.tsx` page component, stop —
that's out of scope here.

The full design spec, with six reference screenshots, is at
[`docs/design/projects-page-handoff/handoff/claude-code-prompt-projects.md`](../design/projects-page-handoff/handoff/claude-code-prompt-projects.md).
Read it in full before starting — it defines the data contract this session must satisfy
(the `## Data contract` section) and the row-state logic (the `### Row states to
implement` table and `### The three action slots` section) that this session's query
layer must compute. You are building the data these states render from; you don't
render them.

## Why this split

`/projects` is a big feature — full spec review put it at 8-14 hours of agent time
end to end. The schema/query-layer half carries the actual risk: this app has a
documented history of Pipedrive-link bugs (three distinct root causes behind one
symptom, per `docs/JOURNAL.md`), and the row-state logic here (drift detection, expiry,
archive semantics, "current quote" derivation) is exactly the kind of thing that's cheap
to get subtly wrong and expensive to debug once a UI is built on top of it. Get this
layer right and well-tested first; the page build is comparatively mechanical.

## What already exists — reuse it, don't reinvent it

Before writing anything, read these:

- **`src/lib/pipeline/forecast.ts`** — `groupIntoDeals()` already does company/project
  bucketing, on-behalf-of resolution, revision-lineage merging (via
  `parent_submission_id`), representative-row selection, and `supersededIds()`. This is
  most of the grouping logic the spec's queue and By-partner view need. It's currently
  used by the partner-facing "My Pipeline" view (`src/app/(app)/submissions/pipeline.tsx`),
  which is RLS-scoped to one partner's own rows — `/projects` needs the same grouping
  logic but fed an **admin/cross-partner** result set instead. Extend or wrap, don't
  duplicate the bucketing algorithm.
- **`src/lib/pipedrive/client.ts`** (`getDeal()`, `getDealProducts()`) and
  **`src/lib/pipedrive/quote.ts`** (`getDealForQuote()`) — live Pipedrive reads: deal
  status, org/person, line items, pricing. Reuse these; do not write a second Pipedrive
  client.
- **`src/lib/project-quote/*`** — the Project Proposal generation and versioning system
  already exists (`generate.ts`, `snapshot.ts`, `expiry.ts`, `assemble.ts`). Versioning is
  **derived, not stored**: `project_quotes` has no `is_current` flag by design (ADR 0061 —
  no demote step, no concurrency race). "Current version" is `max(version)` per
  `submission_id`, read live. Follow this pattern for anything this session adds — do not
  introduce a stored "current" flag anywhere new either.
- **`src/lib/project-quote/expiry.ts`** (`projectQuoteExpiryIso`) — expiry is
  `generated_at + validity_days`, computed at read time, never stored. Reuse this for
  `current_quote_expires_at` / `is_expired` in the data contract.
- **`submissions.status`** (ADR 0081) is already `open | won | lost`, portal-only, not
  synced to Pipedrive. This **is** the spec's `portal_status` field — no new column
  needed. Do not confuse it with `pipedrive_deal_status`, which is a live read from
  Pipedrive and must be modeled separately.
- **`parent_submission_id`** (ADR 0093 step 2) and `supersededIds()` already give you
  `is_superseded` and lineage. `project_key` is already computed in `forecast.ts` as
  `trim(lower(project_name))` — it's a derived value in code, not a DB column; keep it
  that way.
- **`partners.company_name` / `contact_name`** already give you `partner_company_name`
  and a contact — resolved the same way `effectiveCompany()` in `forecast.ts` does it
  (on-behalf-of aware). Don't denormalize a new column for this; join.

Net effect: most of the ~20 fields in the spec's data contract are **derivable from
existing tables via joins and the existing helpers above**, not new columns. Confirm
this for yourself against the data contract field-by-field before writing any migration
— don't add a column for something that's already computable.

## What's actually new (no existing precedent — these need real design decisions)

1. **`internal_archived_at` / `internal_archived_by`.** No archive/soft-delete pattern
   exists anywhere in this schema today (the closest thing, products' `active` flag, is a
   different concept — retirement from a catalog, not a personal per-user hide). Spec
   requirements: internal-only, invisible to partners, reversible ("Undo" on the row),
   does not block archiving an open deal, does not touch Pipedrive or the quote/version
   history. Decide: whose archive is it — could two different internal users
   archive/unarchive the same project differently, or is it a single global flag? Read
   the spec's Band D filter chip (`Show archived`, dashed border, off by default) and the
   archive dialog copy before deciding. Write an ADR for this.

2. **Pipedrive read staleness / "last known value" fallback.** The spec requires: when a
   live Pipedrive read fails, render the **last known values** with a stale marker
   (`Pipedrive unreachable · read 00 Mon`) — never blank, never zero (acceptance check 9).
   Nothing in this codebase currently caches a Pipedrive read for later fallback use — the
   existing reads (`getDeal`, `getDealForQuote`) are point-in-time, used inline during
   quote generation, and simply fail if Pipedrive is down. Decide where "last known"
   lives: a small cache table keyed by `pipedrive_deal_id`, or columns on `submissions`.
   Consider write frequency (every page load doing N live Pipedrive reads is probably
   wrong at any real scale) versus staleness tolerance the spec implies (the mockup shows
   a `Read today at 9:42 AM` / `↻ Refresh` control, implying reads are on-demand and
   cached, not per-request-live). Write an ADR for this — it affects both the open-pipeline
   dollar figure (Band C) and every row's deal status/value/line-item-count.

3. **Line-item drift detection.** Spec: "a timestamp of the deal's last line-item change,
   compared against `current_quote_generated_at`, plus a count of differing lines." The
   frozen line items at generation time are already in `project_quotes.snapshot` (jsonb) —
   diff live `getDealProducts()` output against the current version's frozen snapshot
   rather than trying to get a "last changed" timestamp out of Pipedrive's API (check
   whether Pipedrive's deal/product API actually exposes a reliable per-line change
   timestamp before assuming it does — if it doesn't, the diff-against-snapshot approach
   is the only reliable signal anyway, so lead with that). Decide whether this is computed
   live per page load or as part of the same caching decision as #2.

4. **Cross-partner admin query.** No existing query fetches submissions across all
   partners for an internal user — `submissions/page.tsx` is RLS-scoped per viewer. You
   need either a service-role/admin-client read path (check how `src/app/(app)/admin/`
   routes already do this — there's precedent there for internal-only cross-partner
   reads) or a permissive RLS policy gated on `is_internal()`/`is_admin()` following the
   exact pattern in `project_quotes`'s own RLS policies (`project_quotes_select_internal`).
   Prefer matching that existing pattern over introducing a new access-control shape.

## Deliverables

1. **Migration(s)** in `supabase/migrations/` for `internal_archived_at` /
   `internal_archived_by` (+ index, RLS policy exclusions/permissions) and whatever the
   caching decision in #2 needs. Follow this repo's migration conventions exactly — see
   `20260724000001_submission_revision_lineage.sql` and `20260616000002_phase10_project_quotes.sql`
   for the header-comment-explains-the-why style, `on delete` semantics reasoning, and RLS
   policy structure this codebase expects. If a migration is record-touching, follow the
   dry-run/backup convention from `20260717000002_pipeline_status_model_reduction.sql`.
2. **A query/service module** (suggest `src/lib/projects/queue.ts`, but use your judgment
   on placement/naming against the existing `src/lib/pipeline/` and `src/lib/project-quote/`
   precedent) that returns data shaped **exactly** to the spec's data contract — every
   field listed, nothing extra rendered-but-not-specified. This is the contract phase 2
   consumes; get the field names and types right since a follow-up session builds the
   page directly against whatever you return.
3. **`available_actions`** computed server-side per the spec's "three action slots"
   section — the three-state Task slot, the Download split-button vs single-button
   distinction (`Recommended` rows have no proposal yet), and the disabled/enabled
   Pipedrive slot. This logic belongs here, not in the UI.
4. **Unit tests** co-located next to the new modules, following this repo's convention
   (`forecast.test.ts`, `generate.test.ts`, `snapshot.test.ts` sit beside their modules).
   Cover at minimum: each of the 9 row states from the spec's state table, the on-behalf-of
   and revision-lineage edge cases `forecast.test.ts` already covers (don't regress them —
   your extension wraps `groupIntoDeals`, it shouldn't fork it), and a Pipedrive-read-failure
   case that proves last-known values survive rather than going blank.
5. **Docs**: an ADR each for the archive pattern and the Pipedrive caching/staleness
   strategy (numbered starting at **0112** — 0111 is the last one used), a `docs/JOURNAL.md`
   entry (newest entry at top, this repo's existing format — see recent entries for the
   voice), and no `docs/RUNBOOK.md` change is expected unless you introduce a new local
   setup step (e.g. a new env var).

## Explicitly out of scope for this session

Route/page component, header internal-strip nav, any React, the By-partner view's XLSX
export, the two confirm dialogs, filter chips, URL query-string state, keyboard nav,
search-highlighting, type-scale/visual work. All of that is phase 2. If a design decision
here has a direct consequence for phase 2 (e.g., "available_actions is an enum of exactly
these six string values, phase 2 must switch on it"), say so explicitly in your final
summary so the next session's brief can carry it forward — but don't build it.
