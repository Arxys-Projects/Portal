# 0075 — Portal UI reskin (new palette, gold reinstated)

- **Status**: Accepted
- **Date**: 2026-07-01

## Context

A new design pass — authored in Claude Design as `.dc.html` mockups plus a written
handoff — refreshes the portal's visual language. It keeps the ADR 0067 architecture
(one token layer in `globals.css @theme`, the shared `_components/ui/` primitives, the
"every action reads as a control" rule) but changes the surface look:

- **Navy shifts** from `#054A91` to `#14346b` (deeper, cooler), with hover `#0d244a` and
  soft tint `#eef2f8`/`#e7edf7`.
- **Gold is reinstated** as a brand accent — ADR 0067 had retired it from the UI. It
  returns *sparingly*: favourites/stars, feature dots, compare diff rules, price-book
  eyebrows, and a single "amber" brand button. On white, gold text uses `#c17f10` for
  legibility; `#fbb040` is kept for fills/dots/on-navy.
- **Page/border palette warms**: page `#e7eaee`, card border `#d7dce3`, ink `#111826`.
- **Screens restructure**: a full PortalHeader (7-item nav), dashboard hero + metric
  strip, three-band calculator group cards, pipeline status pills + coloured-dot status
  select, compare tick/dim/below-requirement styling, product cards + data-driven detail.

This is a **presentation-only reskin**: all logic (`lib/calculator`, `lib/recommend`,
`lib/pipeline`, `lib/price-book`, `lib/videox-compare`, `lib/comparison`, server actions,
RLS, PDF/XLSX exports) is unchanged. The reskinned UI binds to the existing functions.

## Options considered

- **Fonts** — the mockups specify Space Grotesk + IBM Plex Sans/Mono. **Andy explicitly
  ruled out changing fonts.** Keep Geist Sans/Mono (and Poppins/Montserrat on the
  price-book route); reproduce the mockups' *weight/size/letter-spacing/case/colour* with
  the existing families. This is the main deliberate divergence from the mockups.
- **Retint tokens vs rewrite primitives** — retint the ADR 0067 tokens + restyle the
  primitives *without changing their APIs*, so every consumer keeps working. No new
  component library.
- **Navy as one shared token vs per-route hexes** — keep `--color-arxys-navy` as the one
  navy so the shift cascades; hunt down the hardcoded `#054A91`/`#1E4E8C` in the
  price-book JSX and the scoped calculator/compare CSS and replace them too.

## Decision

Adopt the new palette + structure as described in the approved plan
(`.claude/plans/sunny-riding-treehouse.md`), font-frozen. Supersede ADR 0067's palette
and its "gold retired" call; retain 0067's architecture and component inventory.

## Consequences

**Positive:** refreshed, higher-contrast look matching the current brand direction; gold
returns as a controlled accent; all screens share one token shift; zero logic risk.
**Negative:** the mockups' typographic identity is only approximated (fonts frozen);
`STATUS_META` presentation strings and several scoped CSS files must be hand-retinted.
**When to revisit:** if the font freeze is lifted, or if a screen needs a colour role the
new token set doesn't express.
