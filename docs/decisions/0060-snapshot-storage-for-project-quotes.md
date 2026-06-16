# 0060 — Snapshot storage for Project Quotes (scoped supersession of ADR 0017)

- **Status**: Accepted
- **Date**: 2026-06-15

## Context

ADR 0017 decided to render PDFs on demand from live submission data, storing no PDF bytes. System Estimates (the current submission PDF) remain render-on-read from the local submission row, so ADR 0017's reasoning holds for them. Project Quotes are different: they capture data from an external, mutable source (Pipedrive line items and totals) plus legal terms that change over time. Re-fetching that data on every view would silently reflect deal edits, catalog changes, or terms revisions made after the quote was issued, which would misrepresent what was presented to the customer. A quote must be able to reproduce the exact numbers and terms that were shown.

## Options considered

- **Render-on-read from live sources (ADR 0017 as-is).** Correct for System Estimates, wrong for quotes: an old quote would change whenever the deal, the catalog, or the terms changed.
- **Store rendered PDF bytes.** Maximum visual fidelity, but heavier storage, and it freezes layout bugs and cannot re-flow if the template improves. Held in reserve (Supabase Storage is available on the Pro tier) if exact historical visual fidelity is later required.
- **Store the snapshot data as JSON and re-render on demand (chosen).** Freezes the numbers, terms, and resolved sizing while letting a later template change re-render an old snapshot with the new layout but identical content.

## Decision

On generation, the portal snapshots into a `project_quotes` row's `snapshot` (jsonb) column: the verbatim successful `DealQuote` (commercial half, stored raw, line items in Pipedrive's returned order with `orderNr` preserved for render-time sorting); the resolved sizing half (parameters, camera schedule with resolved labels and Phase 10 camera fields, capacity figures, primary-server spec) frozen as resolved display values rather than lookup-table indices; the resolved showcase (page-2 product cards) with frozen image paths and spec highlights; and the in-force terms. Viewing or downloading any existing quote re-renders deterministically from the stored snapshot and never from a live pull. System Estimates are unaffected and remain render-on-read per ADR 0017. This is a scoped supersession: ADR 0017 continues to govern System Estimates; ADR 0060 governs Project Quotes.

**Terms are frozen in full, not by version stamp alone.** The snapshot stores the version, the full terms text, and a sha256 of that text; the `terms_version` is also mirrored to a queryable column for auditing. A version stamp alone would make an old quote depend on an external versioned-terms archive still holding that exact version at re-render time, a fragile dependency that breaks the self-contained-reproduction premise. Freezing the legal text in the row keeps each quote self-contained, the same reasoning that drives freezing the commercial data.

**Image bytes are not frozen; the resolved /public path is.** Hero images are version-controlled repo assets, not external mutating state, so the snapshot stores the resolved `/public` path and 5b re-loads the bytes at render. This keeps the row small without weakening reproduction.

## Consequences

**Positive:** an issued quote reproduces its exact numbers and terms indefinitely; a later PDF-template change re-renders old quotes with the new layout but identical content; the row stays compact (no base64 image or PDF bytes); the queryable `terms_version` supports audit.

**Negative:** the snapshot must be complete enough to render all four pages with no live lookups, so a missing field is a correctness bug for old quotes (the completeness premise, ADR 0061); a terms text or image-path change does not retroactively update issued quotes (intended, but means historical quotes can differ from current copy).

**When to revisit:** if exact historical visual fidelity is required (switch to stored PDF bytes), or if the snapshot shape needs a breaking change (handled via the `snapshotVersion` envelope field).
