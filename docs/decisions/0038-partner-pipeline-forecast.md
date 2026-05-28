# 0038 — Partner pipeline forecast (deal definition, weights, draft exclusion, Pipedrive as SoR)

- **Status**: Accepted
- **Date**: 2026-05-28

## Context

Phase 4 Step 1 adds a weighted pipeline forecast to the admin submissions view and a personal funnel
card to the partner dashboard. The key design questions were: how to collapse multiple submissions
per opportunity into a single "deal" value, what probability weights to use, how to handle draft
submissions, and how to relate portal data to Pipedrive.

All decisions below were locked by Andy on 2026-05-28 before implementation.

## Options considered

**Deal definition:**
- Sum all submissions per (partner, project): inflates pipeline if a partner submits multiple quotes
  for the same opportunity.
- One value per submission: makes the forecast noisy; a revised quote counts twice.
- One representative submission per (partner, trimmed-lower project_name): avoids double-counting
  and is resilient to minor name variations. Chosen.

**Representative selection:**
- Always the most-recent submission: ignores the partner's explicit "this is my best number" signal.
- Always the `is_preferred` submission: ignores recency when no submission is starred.
- Preferred if starred, else most-recent: respects the partner's signal while falling back gracefully.
  Chosen.

**Forecast weights:**
- Skip weighting entirely (raw dollar totals only): loses the "expected value" insight that makes a
  pipeline report actionable.
- Derive weights from historical win rates: no history yet; would require ongoing calibration.
- Fixed constants matching the Pipedrive stage conventions Arxys already uses: immediately useful,
  revisable when data exists. Chosen: on-hold 20%, sent 40%, won 100%, lost 0%.

**Draft / null-status handling:**
- Treat drafts at some probability (e.g. 5%): assigns dollar value to quotes that may never be sent.
- Include drafts as $0 in the pipeline: inflates deal count without adding signal.
- Exclude drafts from dollar totals entirely, surface as a count only: honest about what's in-flight.
  Chosen.

**Pipedrive relationship:**
- Merge portal and Pipedrive data (look up deal stage): too coupled; stage may have been changed by
  sales; requires a live Pipedrive API call on every admin page load.
- Display `pipedrive_deal_id` as a badge/link only; label the portal data as "pre-CRM partner
  activity": keeps concerns separate, no extra latency. Chosen.

**Schema changes:**
- Add a `weighted_value` denormalised column: unnecessary; the computation is trivial JS.
- Use existing columns (`status`, `is_preferred`, `total_list_price_usd`, `pipedrive_deal_id`,
  `project_name`, `partner_id`, `created_at`): queries-only. Chosen (Phase 4 constraint: no
  migrations).

## Decision

- A **deal** = one (partner_id, case-insensitive trimmed project_name) pair. One representative
  submission per deal: the `is_preferred` row if starred, else the most recent by `created_at`.
  Never sum multiple submissions for the same deal.
- **Probability weights** live in `STAGE_PROBABILITY` in `src/lib/pipeline/forecast.ts`:
  `{ "on-hold": 0.2, sent: 0.4, won: 1.0, lost: 0.0 }`. Draft is excluded upstream.
- **Drafts and null-status** submissions are excluded from pipeline dollars and the weighted
  forecast. They may appear as a count for visibility.
- **Pipedrive is the system of record** for deal stage. The portal forecast is pre-CRM partner
  activity and is labelled as such. Each deal row links to its Pipedrive deal when
  `pipedrive_deal_id` is set; no live Pipedrive API call is made from the forecast views.
- **No database migration.** All columns needed (`status`, `is_preferred`, `total_list_price_usd`,
  `pipedrive_deal_id`, `project_name`, `partner_id`, `created_at`) exist on `submissions` since
  Phase 1/2. Grouping and weighting happen in JS in the Server Component.
- **Read-only.** Partners own their pipeline (ADR 0037). Admin views have no edit or delete.

## Consequences

**Positive:**
- No schema migration: zero migration risk, ships in one PR alongside the UI.
- Pure functions in `src/lib/pipeline/forecast.ts` are independently testable and importable by
  both the page Server Component and the XLSX export route.
- The "preferred-or-latest" representative rule reuses the same semantic as the Step 5 pipeline
  grouping, keeping the mental model consistent across partner and admin views.
- Drafts-as-count-only is honest: the forecast reflects only committed activity.

**Negative:**
- Fixed weights won't match Arxys's actual win rates until enough history accumulates. A won/lost
  event in Pipedrive doesn't automatically update `status` in the portal — the portal status is
  partner-reported.
- The deal grouping is project-name-based (no parent_submission_id lineage), so a partner who
  renames a project mid-flight creates a new deal bucket. Accepted for v1 (ADR defers lineage to
  Step 3's (partner, project) grouping).

**When to revisit:**
- If the Arxys team wants probability weights calibrated to historical win rates — this becomes an
  admin-editable constant or a column on `partners`/`deals`.
- If the portal gains deal-stage sync with Pipedrive (webhook or polling) — the portal forecast
  could then use the live stage rather than partner-reported status.
- If `parent_submission_id` lineage is added (Phase 4 Step 3 deferred item) — the grouping key
  could switch to lineage-based rather than name-based.
