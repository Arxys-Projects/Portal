# 0059 — Project Quote: portal-rendered unified proposal and quote document

- **Status**: Proposed
- **Date**: 2026-06-15

## Context

Sales currently rely on a Google Docs template that must be manually field-synced, duplicated per user, and shared per deal. This creates version-skew risk between the portal's sizing data and the quote's commercial data, and it requires per-user template administration. The portal already holds the authoritative sizing output (from the submission) and creates the Pipedrive deal at submission time, making it the natural place to generate a unified document that combines sizing and commercial data in a single rendered view.

## Decision

A single internal-only "Project Quote" document generated from the portal for a linked submission. The sizing half (parameters block, camera schedule, capacity bars, primary-server hero) comes from the portal submission; the commercial half (line-item products, prices, discounts, totals, terms) is read live from the linked Pipedrive deal at generation time and displayed verbatim. Prices flow Pipedrive to portal only; the portal never computes or modifies a price. Generation is gated on a stored `pipedrive_deal_id`; manually-created Pipedrive deals have no portal submission to generate from, which enforces the portal as the single authoring path. Generation refuses when the deal has zero product line items (empty-deal guard). The sizing source is the portal submission exclusively; the deal's custom sizing fields are not read.

**Authorization (confirmed 2026-06-15):** Project Quote generation is available to *all internal users*, not restricted to admins. The `project_quotes` write/generate path is gated on `public.is_internal((select auth.uid()))` (covering admins, who are a subset where flagged, plus `or public.is_admin(...)` to be safe if an admin is not separately flagged internal) — distinct from `camera_specs`, whose admin-only write gate governs library seeding, not quote creation. This is the future Phase 10 Step 5/6 surface, not the camera_specs migration in ADR 0057.
