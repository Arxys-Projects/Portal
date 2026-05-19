# 0017 — PDFs are rendered on-demand, never persisted

- **Status**: Accepted
- **Date**: 2026-05-19

## Context

Step 6 adds a per-submission PDF report. Two natural shapes exist for the
artifact:

- **Persist**: render once at submission time, write to Supabase Storage,
  add a `pdf_path` column to `submissions`, hand out signed URLs.
- **Regenerate**: render on every download click and on every email send,
  never store the bytes.

Submission rows are immutable in practice (partners can re-submit, but the
existing row is never edited). PDF content is a pure function of the row +
its joins, so any persisted copy and any regenerated copy are identical
unless the PDF template itself changes.

## Options considered

- **Supabase Storage + signed URLs.** One-time render cost; cheap CDN
  delivery. Costs: a new column, signed-URL expiry handling, storage cleanup
  on submission delete, divergence risk if the template changes (old stored
  PDFs no longer match the template a new download produces). Adds a third
  state (no-storage / storage-and-row-agree / storage-and-row-drift) to
  reason about.
- **On-demand regenerate.** Every download click and every email attachment
  goes through `renderSubmissionPdfBuffer`. ~200ms per render in tests; no
  storage, no signed URLs, no drift.
- **Hybrid cache.** Persist the most-recent render, regenerate on cache
  miss. Combines the worst of both — still needs the column, still has
  drift, but now also a cache key invalidation story.

## Decision

**Render on every read.** No `submissions.pdf_path` column. No Supabase
Storage usage. The Server Action renders the PDF in-memory and attaches it
to the two notification emails; the Route Handler re-renders from the
persisted row on each Download click.

## Consequences

**Positive:**
- The PDF always reflects the current row state and the current template —
  there is no stale-PDF case.
- Zero storage costs and zero signed-URL plumbing.
- Schema stays narrow: no new column, no new lifecycle to track.
- Migrating the template (re-skinning, adding sections) takes effect
  immediately on all historical submissions, without a backfill job.

**Negative:**
- Per-request CPU on every download. Today this is ~200ms on warm functions;
  cold starts add another few hundred ms. Trivial at expected volumes
  (single-digit downloads per submission, dozens of submissions per month).
- The exact byte sequence of a PDF is not stable across `@react-pdf/renderer`
  upgrades — a partner who saved a file in March will see a slightly
  different file if they re-download in June. The visible content is the
  same; the bytes are not.

**When to revisit:**
- A "share this submission" or public-link feature lands and the bytes need
  to be addressable from outside the auth boundary.
- Render time grows past ~1s (template gets much heavier) — a one-time
  persist becomes worth the extra surface area.
