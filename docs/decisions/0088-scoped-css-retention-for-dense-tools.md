# 0088 — Scoped-CSS retention for dense tool surfaces

- **Status**: Accepted
- **Date**: 2026-07-20

## Context

The 2026-07-16 design handoff's workstream D says to migrate the Calculator,
VMS Server Comparison, and VideoX Quick Compare off their bespoke scoped
stylesheets (`calculator.css`, `comparison.css`, `videox-compare.css`) onto the
shared `ui/` components. During implementation the three surfaces turned out to
be very different animals: the comparison page is ordinary cards and tables;
Quick Compare is a dense spec matrix whose value lives in machinery Tailwind
utilities express poorly (sticky first column whose opaque background tracks
striping/hover/diff row states, CSS-only keyboard-accessible tooltips); the
full calculator is a 1,700-line form ported verbatim from the public arxys.com
calculator, already repaletted to navy in ADR 0075, whose stylesheet doubles as
a cross-reference to the public reference file.

## Options considered

- Full migration of all three — highest fidelity to the handoff text; highest
  regression risk on the portal's core tool (the calculator) for zero visible
  change, and a Tailwind rewrite of the sticky-matrix machinery that would be
  longer and less legible than the CSS it replaces.
- Retain all three sheets untouched — no risk, but leaves the comparison page's
  off-system bright-gold header and `ac-*` chrome contradicting the reskin.
- Migrate by surface economics (chosen) — comparison fully migrated and its CSS
  deleted; Quick Compare's page chrome/controls migrated with a slimmed
  table-machinery-only sheet kept (retokenized to the shared palette); the
  calculator keeps its sheet with the handoff's two named fixes applied
  directly (standard page header added, off-palette metric numerals → navy).

## Decision

Migrate to shared components where the surface is ordinary chrome; keep a
scoped stylesheet only where it encodes table machinery the utility system
can't express cleanly, and retokenize what stays to the ADR 0075 palette. The
acceptance criterion is the handoff's *visible* consistency (one header
pattern, one table chrome, navy figures, shared buttons/selects), not zero CSS
files.

## Consequences

**Positive:** the visible D-pass consistency landed everywhere; the
calculator — the portal's core revenue tool — carried no restyle regression
risk; Quick Compare kept its best interaction (sticky compare matrix) intact.
**Negative:** two scoped stylesheets remain (`calculator.css`,
`videox-compare.css`), so token changes must touch them as well as `ui/`.
**When to revisit:** if the calculator gets a functional rework (e.g. the
Constant-default realignment flagged in ADR 0082), migrate its chrome to
`ui/` as part of that work rather than as a standalone restyle.
