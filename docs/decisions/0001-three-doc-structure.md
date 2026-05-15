# 0001 — Three-document documentation structure

- **Status**: Accepted
- **Date**: 2026-05-15

## Context

Mid-Phase-1, the conversation history accumulated a lot of valuable context — dead ends, fixes, decisions, surprising failures — that would be lost when the session was compacted. We needed a way to capture this so future-us (and future AI agents) can reconstruct the project without re-deriving every choice.

Two failure modes to avoid:
1. **One monolithic doc** grows long and contradictory. Setup steps get diluted by history; history gets pruned to keep setup clean.
2. **No docs, rely on commit messages** — commits answer *what changed*, not *why we considered other options* or *what we tried and abandoned*.

## Options considered

- **One doc** (`PROJECT.md`). Simple but rots fast.
- **Two docs**: `JOURNAL.md` (narrative) + `RUNBOOK.md` (clean recipe). Better, but ad-hoc decision rationale ends up buried in JOURNAL where it can't be cited.
- **Three docs**: JOURNAL + RUNBOOK + per-decision ADRs. Each doc has exactly one job.
- **External tool** (Notion, Confluence). Better for non-engineer audience, but high friction to update, and AI agents can't read or write it without a connector.

## Decision

**Three docs, in-repo, markdown.**

- `docs/JOURNAL.md` — chronological narrative. Newest entry on top. Each entry has *Work done* and *Detours & fixes* subsections. Append after every meaningful work session.
- `docs/RUNBOOK.md` — clean recipe to recreate the project from a blank Mac. Updated immediately when the happy path changes. Linear and copy-pasteable.
- `docs/decisions/NNNN-title.md` — one short ADR per non-obvious choice. Numbered, never reused. Superseded ADRs stay in place with a `Status: Superseded by #NNNN` note.

## Consequences

**Positive:**
- Each doc is short and focused, easy to scan.
- ADRs are searchable and citeable (`see decisions/0004`).
- Survives session compaction — context lives in git, not chat history.
- AI agents instructed to maintain these can do so automatically.

**Negative:**
- More files to keep in sync. Mitigated by baking the discipline into `CLAUDE.md` so updates are automatic.
- Slightly higher friction than "just write a commit message." Mitigated by only writing ADRs for non-obvious choices.

## Audience

Optimized for the project owner, future-self, and AI agents. Not non-technical stakeholders — they should get a curated summary rather than reading the JOURNAL.
