# 0067 — Portal UI design system and shared component layer

- **Status**: Proposed
- **Date**: 2026-06-19

## Context

The portal worked but was visually unsystematic. Across the dashboard, My Pipeline,
Admin Submissions (partner + table + expanded views), submission detail, and the
calculator there were at least five button/action styles, three table treatments,
native unstyled `<select>` controls, several chip/badge styles, and a pervasive
low-contrast problem: grey text on light-grey fill on a white page with hairline
grey borders. Inline coloured text (View / Revise / PDF / Delete) was doing a
button's job and did not read as a control.

We want one design language and a shared component set, built **before** any page is
migrated, so nothing gets restyled twice.

There were **two** "Arxys navy" hexes in the codebase: `#054A91` (the web token in
`globals.css @theme` as `--color-arxys-navy`, with deep `#03396f` / soft companions,
used by Price Book + Comparison) and `#1a365d` (PDF-only, `src/lib/pdf/colors.ts`).
The accent had to be picked, not invented.

## Options considered

- **Accent = `#054A91`** vs `#1a365d` — chose `#054A91`: already a first-class Tailwind
  token with deep/soft companions, already live in the web UI; `#1a365d` is darker and
  PDF-only. *Confirmed with Andy.*
- **Tailwind config vs CSS-var `@theme`** — extend the existing `@theme inline` block in
  `globals.css` (no `tailwind.config` exists; Tailwind v4). No fork.
- **Component home** — a shared `ui/` dir vs per-route `_components/`. Chose
  `src/app/(app)/_components/ui/`, beside the existing shared `footer.tsx`.
- **Look** — calm + flat (proposed dashboard cards) vs the calculator's gradient /
  multicolour-number result cards. Chose calm + flat but **HIGH CONTRAST**; gradients
  retired from the product (calculator reconciled later).
- **Buttons** — thin-outline/text buttons vs a filled two-tier scale. Chose all-filled
  (they failed the "does it read as a button" test).

## Decision

A token layer plus six shared components, then the dashboard migrated onto them.

- **Look:** near-black content text (`--color-ink #14181f`); grey (`--color-ink-soft
  #5a6573`) reserved for subtitles/labels only; true-white cards (`--color-surface`) on
  a tinted page (`--color-page #f3f5f9`); borders firmed to `#cdd5e0` (cards 2px) and
  `#c4cdda` (NavCards 3px, per Andy's request for clearer card edges + a slightly darker
  shadow). One accent: **navy `#054A91`**. Gold retired from buttons/actions (survives
  only as a potential future warning colour).
- **Buttons:** filled two-tier scale — `primary` (solid navy), `secondary` (filled
  `#e7eaef` + navy text + hairline border), `destructive` (quiet → red on confirm), plus
  a consistent `IconButton` (disabled-when-NA, never absent, so rows don't jump).
- **One styled `Select`**, **one `Table`** chrome, **one `StatusBadge`** with three
  semantic variants (source / status / on-behalf — gold "on behalf of" retired), and a
  `MetricTile` for non-destination data panels.
- **Clickable `NavCard`:** the whole card navigates (navy icon chip, near-black title,
  one secondary subtitle, corner arrow — or a download glyph for the XLSX variant). No
  inner buttons on navigation cards.
- **Tokens** extend the existing `@theme` and reuse `--color-arxys-navy*`; `StatusBadge`'s
  status variant reuses `STATUS_META` so the status enum stays the single colour source.

Component inventory (in `src/app/(app)/_components/ui/`): `Button` + `IconButton`,
`Select`, `Card` + `NavCard`, `Table` (+ `THead/TBody/TR/TH/TD`), `StatusBadge`,
`MetricTile`, and a pure `styles.ts` class-builder layer (unit-tested under the existing
`tsx --test` harness, since the repo has no jsdom/RTL render-test setup).

## Consequences

**Positive:** one higher-contrast, calmer portal; every action reads as a control; status
looks the same everywhere; pages migrate by composing existing components.
**Negative:** up-front cost — the component layer exists before most pages use it; the
calculator reconciliation remains a non-trivial unknown (it does not block the layer).
**When to revisit:** if a future page needs a control the inventory can't express, or if
the calculator reconciliation forces a token change.

## Sequencing

1. This ADR (Proposed → Accepted on review).
2. Token layer + shared components + **dashboard** migration (this step).
3. Remaining migrations, one prompt each: submission detail → My Pipeline → Admin →
   calculator reconciliation. Capture the five un-audited pages (VMS Comparison, VideoX
   Quick Compare, Price Book, Register a Deal, Support) before migrating them.
