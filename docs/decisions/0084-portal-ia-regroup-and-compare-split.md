# 0084 — Portal IA regroup and Compare split

Status: Accepted (2026-07-20 — implemented; specifics resolved by the 2026-07-16 design handoff: Compare ▾ dropdown keeps one top-level nav slot; "Products & Prices" is the canonical label)
Deciders: Andy Newbom
Relates to: 0067 (UI design system), 0075 (UI reskin), 0070 (internal nav / admin landing consolidation), `src/app/(app)/_components/portal-header.tsx`, the dashboard.
Specifics to be informed by the unified Claude Design session.

## Context

The dashboard sorts tools by an internal taxonomy (Tools vs Reference) that buries the two most persuasive tools, the VMS Server Comparison and the price story, under "Reference," framing deal-winning tools as passive lookup. One nav item, "Compare," covers two tools with different jobs: Quick Compare (VideoX model-vs-model selection, a utility) and the VMS Server Comparison (Arxys vs a competitor, a persuasion tool). Naming drifts across surfaces (Compare / VMS Server Comparison / VideoX Quick Compare; Products & Prices / VideoX V5 Price Book).

## Decision

- **Regroup the dashboard by job:** size a job (full Calculator), win a job (VMS Server Comparison, elevated), look it up (Price Book, Quick Compare, Price List), track my work (My Pipeline).
- **Split the "Compare" nav** into two reachable destinations: a persuasion destination (VMS Server Comparison, first-class) and a selection tool (Quick Compare).
- **Naming consistency pass:** one label per thing across nav, cards, and page headers.

## Consequences

- Extends the nav decisions in 0070 and the visual system in 0067/0075. The Design session produces wireframes first, then screens, and a cross-page consistency pass.
- The dashboard TOOLS "Calculator" card is repurposed for Quick Calc (0082) as part of the regroup.
- Routing detail for the Compare split (two nav entries, or one with a clear chooser) is settled at Design time, not assumed here.

## Gates

- Presentational and IA only. Normal review. No data, RLS, or CRM change.
