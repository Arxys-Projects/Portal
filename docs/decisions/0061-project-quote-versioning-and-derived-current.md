# 0061 — Project Quote versioning and derived-current model

- **Status**: Proposed
- **Date**: 2026-06-15

## Context

A deal may be revised over time, requiring multiple quote versions for the same submission. A stored `is_current` flag becomes a concurrency and update-ordering hazard: two concurrent operations can leave zero or two "current" rows. The generation identifier must also encode enough context (deal, version, date) to be self-describing when referenced in email or print. Validity expiry should be configurable without requiring a data migration when the window changes.

## Decision

Each generation inserts a new `project_quotes` row with a monotonically increasing version number scoped per submission. "Current" is derived at query time as `MAX(version)` and is never stored as a mutable flag, so there is no demote step and no concurrency race. Identifier format: `DealID-V{version}-{date}`. Validity is 7 days computed from `generated_at` via a single configurable constant (may shorten); validity is rendered on every PDF and never stored as a flag, so adjusting the constant takes effect on all future renders without a data migration.
