# 0081 — Pipeline status model reduction and forecast retirement

Status: Accepted (2026-07-17)
Deciders: Andy Newbom
Relates to: My Pipeline and dashboard pipeline summary. Portal-only; not mapped to Pipedrive.
Implemented by: migration 20260717000002_pipeline_status_model_reduction.sql (applied 2026-07-17). Decisions taken at build time: stored values are lowercase (open/won/lost); the column is NOT NULL default 'open' (the old NULL "No status" state was folded into open and retired).

## Context

The pipeline carries six statuses (Draft, Sent, Won, Lost, On Hold, No Status). They were aspirational and nobody maintains them. The dashboard headline figures (Open Pipeline, Weighted Forecast, Sent, Drafts) and the My Pipeline totals compute off this unmaintained set, so a number computed from stale status is the first thing every user sees. Weighted Forecast in particular implies probability weighting the three-state model won't have. Confirmed this session: the statuses are not mapped to Pipedrive deal stages, so a change here is portal-only and carries no CRM desync risk.

## Decision

Reduce to three statuses:

- **Open** — default. Every record not currently Won or Lost migrates to Open (Draft, Sent, On Hold, No Status all fold in).
- **Won** — highlighted.
- **Lost** — de-emphasized (greyed).

Retire Weighted Forecast from the dashboard and the pipeline bar. Open Pipeline becomes a straight sum of Open deals. A Won total may be shown; no weighting.

## Consequences

- A one-time data migration rewrites existing status values. Record-touching, so it runs under the no-push-without-review rule with a stop-and-flag gate before execution, and a backup/dry-run diff first.
- The My Pipeline filter pills reduce to All / Open / Won / Lost; the per-row status dropdown offers the three states.
- Dashboard tiles change: Sent and Drafts tiles and Weighted Forecast go; Open Pipeline is recomputed.
- The reduced set is deliberately simple and leaves room to drive a real pipeline stage off it later if wanted; that would be a separate ADR.

## Gates

- Stop-and-flag before the migration. Backup and dry-run diff required. No `supabase db push` without manual review.
