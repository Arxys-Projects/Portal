# 0060 — Snapshot storage for Project Quotes (scoped supersession of ADR 0017)

- **Status**: Proposed
- **Date**: 2026-06-15

## Context

ADR 0017 decided to render PDFs on demand from live submission data, storing no PDF bytes. System Estimates (the current submission PDF) remain render-on-read from the local submission row, so ADR 0017's reasoning holds for them. Project Quotes are different: they capture data from an external, mutable source (Pipedrive line items and totals). Re-fetching that data on every view would silently reflect deal edits made after the quote was issued, which would misrepresent what was presented to the customer. A quote must be able to reproduce the exact numbers and terms that were shown.

## Decision

On generation, the portal snapshots the full pulled commercial data (Pipedrive line items, totals, linked organization and person) plus the in-force T&Cs version into a `project_quotes` table row. Viewing or downloading any existing quote re-renders deterministically from the stored snapshot and never from a live pull. System Estimates are unaffected and remain render-on-read per ADR 0017. This is a scoped supersession: ADR 0017 continues to govern System Estimates; ADR 0060 governs Project Quotes. Storing rendered PDF bytes is held in reserve if exact visual fidelity of historical quotes is later required; Supabase Storage is available on the upgraded Pro tier.
