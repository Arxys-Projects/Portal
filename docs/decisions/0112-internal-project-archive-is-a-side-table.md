# 0112 — The internal project archive is a side table, and one global flag

- **Status**: Accepted
- **Date**: 2026-08-03
- **Related**: first half of the `/projects` schema work with [0113](./0113-pipedrive-reads-are-cached-with-a-last-known-fallback.md);
  copies the internal-only RLS shape from 0059 (`project_quotes` holds pricing, so it is
  gated on `is_internal OR is_admin`); reads on 0093 step 2 (revision lineage is what defines
  a project bucket), 0099 (a project buckets by company name, not partner id), 0081
  (`submissions.status` is portal-only)

## Context

`/projects` needs a reversible "hide this from my queue" gesture. The design spec is precise
about it: internal-only, invisible to partners, undoable in one click from the row, allowed on
a deal that is still **open**, and it must not touch Pipedrive or the quote and version
history. Nothing is deleted. The archive dialog's own body copy is the specification —
*"Archiving hides it from your queue. Quotes, versions and the Pipedrive link stay exactly as
they are, partners see no change, and Undo sits on the row afterwards."*

Nothing like it exists in this schema. The closest thing, `products.active`, is a different
concept: retiring a SKU from a catalog, not one person hiding a row. So there is no pattern to
follow and three genuine questions: where the state lives, whose archive it is, and what a
"project" even means when the thing being archived has no row of its own.

That last one is not a technicality. A `/projects` row is a **project** — a bucket of
submissions keyed on (company, project name) and merged by `parent_submission_id` — and
`groupIntoDeals()` derives it in code. There is no `projects` table and, per 0099, there is
deliberately not going to be one.

## Options considered

**Where the state lives.** Two columns on `submissions` (`internal_archived_at` /
`internal_archived_by`), which is what the spec's own field names imply · a side table keyed by
submission id, gated internal-only · a `projects` table that finally makes a project a row.

**Whose archive.** One global flag with an `archived_by` attribution · one row per
(submission, internal user) so two internal users can disagree · a per-user preference blob.

**What gets stamped.** The representative submission only · every submission in the project
bucket · the project key as a string, with no FK at all.

## Decision

**A side table, `submission_internal_archives`, not columns on `submissions`.** The obvious
shape loses on a security fact rather than on taste. RLS on `submissions` is *row*-level, and
`submissions_update_own` permits a partner to UPDATE **any column** of their own row. PostgREST
accepts an arbitrary column list, and the column-scope restriction this repo relies on lives
in the Server Actions, which a direct API call does not pass through. So a flag stored there
would be partner-**writable**, and `submissions_select_own_or_admin` would make it
partner-**readable** — failing "invisible to partners" outright. A table `authenticated`
cannot reach fixes both by construction, and `project_quotes` already establishes exactly that
gate, so this introduces no new access-control shape.

The `projects` table option was never close. 0099 settled that a project is a derived bucket
because company identity is free-typed text that needs merging at read time; materialising it
to support a hide button would put the schema's hardest reconciliation problem behind a
convenience feature.

**One global archive, with `archived_by` recorded.** The primary key is the submission id
alone: a submission is archived or it is not. There is one internal sales user today, and the
spec's field list is scalar (`internal_archived_at`, singular). A per-user archive costs a
composite key and a viewer-scoped join on every queue read to buy a disagreement nobody can
currently have. `archived_by` is still stored, because the row copy reads *"Archived today at
9:51 AM by you"* and cannot render the not-you case from a boolean.

Un-archiving is a **DELETE** of the row, and it is deliberately not restricted to whoever
archived it. On a global archive, restricting undo to the original archiver would leave rows
nobody present can bring back.

**Stamp every submission in the bucket; read archived-ness off the representative.** This
pair is the actual design, and neither half works alone.

Stamping only the representative loses the state the moment representative selection moves —
a star toggled, a revision filed — and the project reappears for no reason the user did
anything to cause. Stamping the whole bucket fixes that.

Reading the state off the representative then gives the behaviour worth having for free:
representative churn *inside* an existing bucket keeps the project hidden, while a genuinely
new submission — an unstamped row that becomes the new lineage leaf — brings the project back.
**New activity resurfacing an archived project is the right default for a queue**, and it
falls out of the two rules rather than needing a third.

## Consequences

**Positive:** partners cannot see or touch the archive, enforced by the database rather than by
remembering to omit a column from a select. Undo is a delete of rows that reference nothing,
so "nothing was deleted" is literally true — the submission, its proposals, their versions and
the deal link are untouched, which is what the dialog promises. `on delete cascade` on
`submission_id` (against `project_quotes`'s `on delete restrict`) is the right asymmetry: an
archive entry is a view preference, not an audit trail of a document that went to a customer,
and blocking a submission delete because someone tidied their queue would be absurd.

**Negative:** every queue load joins one more table, and the archive action has to resolve the
project bucket before it can write — which means `groupIntoDeals()` runs inside the write path
(`src/lib/projects/archive.ts`), not just the read path. That is deliberate: deriving the
bucket any other way there would let the archive stamp a different set of rows than the page
thinks it is hiding. Re-archiving an already-archived project is an upsert, which is why the
table carries an UPDATE grant and policy for a table that otherwise has nothing to amend.

**One thing worth stating plainly:** the field names in the data contract
(`internal_archived_at`, `internal_archived_by`) survived unchanged even though they no longer
name columns. The page is right to see them as row fields; only the storage moved.

**When to revisit:** when a second internal sales user disagrees about what belongs in the
queue. The migration is mechanical — widen the primary key to (submission_id, archived_by) and
backfill one row per existing entry — and the queue read gains a viewer filter. Do it when
somebody actually complains, not in anticipation.
