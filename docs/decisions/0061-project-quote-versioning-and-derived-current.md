# 0061 — Project Quote versioning, derived-current, and snapshot completeness

- **Status**: Accepted
- **Date**: 2026-06-15

## Context

A deal may be revised over time, requiring multiple quote versions for the same submission. A stored `is_current` flag becomes a concurrency and update-ordering hazard: two concurrent operations can leave zero or two "current" rows. The generation identifier must also encode enough context (deal, version, date) to be self-describing when referenced in email or print. Validity expiry should be configurable without requiring a data migration when the window changes. And because a Project Quote re-renders from its stored snapshot alone (ADR 0060), that snapshot has to carry everything the document needs.

## Options considered

- **Stored `is_current` boolean with a demote step.** Familiar, but every new version must flip the prior row, and concurrent generations race to zero-or-two current rows.
- **Derived current as `max(version)` per submission (chosen).** No stored flag, no demote step, no race; the unique `(submission_id, version)` index already backs the read.
- **Validity stored as an absolute expiry timestamp or an "expired" flag.** Either freezes the window or needs a migration / sweep when the policy changes. Rejected in favor of computing expiry from `generated_at` plus a frozen `validity_days`.

## Decision

Each generation inserts a new `project_quotes` row with a monotonically increasing version number scoped per submission, enforced by a unique `(submission_id, version)` constraint; the assembly computes `version = max(version) + 1` for that submission. "Current" is derived at query time as the row with `max(version)` (`order by version desc limit 1`) and is never stored as a mutable flag, so there is no demote step and no concurrency race. Identifier format: `${dealId}-V${version}-${YYYY-MM-DD}`, the date being the UTC date of `generated_at`, composed once and frozen. Validity is computed at render as `generated_at` plus `validity_days`; the `validity_days` value in force at generation (`PROJECT_QUOTE_VALIDITY_DAYS`, currently 7, may shorten) is frozen onto the row, so changing the constant affects only future quotes and never requires a data migration, and no "expired" flag is stored.

**Snapshot completeness is the integrity premise.** Because re-render reads the snapshot alone, the frozen shape must contain every value the four-page document needs: the verbatim commercial data, the resolved sizing (resolved labels and the Phase 10 camera fields, never indices), the resolved showcase, the full terms, and the generation meta. A `snapshotVersion` envelope field lets the renderer branch if the frozen shape changes in a backward-incompatible way later (the same role `INPUT_STATE_VERSION` plays for submissions). Immutability is enforced at the table: only SELECT and INSERT are granted, so a revision is a new version row, never an edit.

## Consequences

**Positive:** no concurrency hazard around "current"; a self-describing identifier for email and print; expiry policy changes need no migration; the immutable, complete snapshot reproduces any historical quote deterministically.

**Negative:** every generation writes a full new snapshot row (more storage than diffing, accepted for auditability and simplicity); the completeness premise means any field 5b later needs but that was not frozen is unavailable for already-issued quotes, so the shape must be reviewed against the renderer before go-live.

**When to revisit:** if storage growth from full per-version snapshots becomes a concern, or if the snapshot shape needs a breaking change (bump `snapshotVersion` and branch in the renderer).
