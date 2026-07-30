# 0105 — The server datasheet renders at three pages

- **Status**: Accepted
- **Date**: 2026-07-30

## Context

The Phase 2 design handoff (`datasheets/design_handoff_videox_datasheet/`) delivers a
high-fidelity two-page server sheet, and reports it as over-subscribed in its own
"Known constraints" §1: both pages measure exactly 1056px with zero slack, the only
flexible child on each sits at its content minimum, and "adding any fixed-height
content pushes the footer off the page."

Two symptoms were paid for by that constraint. Spec values sit at ~6.8pt — the
tightest part of the design, and smaller than the shipping Illustrator sheets read
comfortably at. And the rear-I/O photo slot was squeezed to 84px tall, roughly 4.4:1
for a 4U chassis that is about 2.5:1, so a real rear-panel photo would letterbox into
a strip. The handoff carried a standing, unresolved recommendation for a third page,
naming exactly what should move: specs and rear-panel photography off page 2, leaving
page 2 the VSR and ordering tables.

Every SKU in scope renders from this one template, so the page count is a template-wide
decision, not a per-sheet one.

## Options considered

- **Ship the handoff's two pages as drawn.** Fewest pages, matches the current
  Illustrator sheets' extent — but locks in 6.8pt specs and a rear slot no real photo
  fits, and leaves zero headroom for any SKU whose spec rows run longer than the V800's.
- **Two pages with the rear slot dropped when no photo exists.** Reclaims the space, but
  breaks the handoff's central missing-asset decision (held space, never reflow), which
  is what makes one template safe to render for twelve SKUs.
- **Three pages, splitting on the handoff's own recommendation.** Costs a page; buys
  ~8pt spec values, a rear slot at 2.25:1, and real slack for longer SKUs.

## Decision

Three pages for the server template. Workstations stay single-page ("Rail"), unchanged.

- **p1** identity and the pitch — hero, headline strip, usage + attributes, **product photo at
  720 × 240**, warranty band, features, VMS row
- **p2** positioning and ordering — **model ladder**, VSR table + parameter strip, orderable
  configs, **rear I/O at 720 × 200**, general information
- **p3** technical specifications — the spec grid at ~8pt, on its own, with row padding
  roughly doubled from the handoff's 5px

Two departures from the handoff's own suggestion, both from reviewing renders:

**The model ladder moves off page 1 to the top of page 2.** It answers "where does this SKU
sit in the line", which is an ordering question, and it sat between the headline strip and
the usage copy interrupting the pitch. Moving it is what frees page 1 to give the product
photo 240px instead of 158px — enough for a real front-3/4 shot rather than a letterbox.

**The rear-panel frame is deliberately shallower than the product photo**, not deeper. The
handoff's constraint was that the rear slot was too *shallow* at 84px; the first three-page
draft over-corrected to 320px, which made the rear panel the largest image on the sheet —
twice the product shot, for the less interesting photo. 200px against the hero's 240px puts
the emphasis back the right way round. `objectFit: contain` means a rear photo of any aspect
still fits inside the frame without distortion.

An intermediate draft made the rear slot `flex: 1` so it would absorb page 2's slack
automatically. It worked, and was wrong: the slot grew to ~370px and dominated the page. A
slot sized by leftover space optimises for the wrong thing.

## Consequences

**Positive:** spec values return to ~8pt, which was the handoff's stated precondition for
the third page. The rear-panel slot gets 720 × 320 (2.25:1), close to a real 4U rear
panel, so photography can land without redesign. Both pages carry slack, so a SKU with
longer spec rows than the V800 no longer risks pushing a footer off.

**Negative:** one more page per server sheet to print and to scroll. Page 3 runs roughly a
fifth short of its footer — the spec grid does not quite fill a page on its own. The
`security_features` list is the obvious candidate to absorb it: it is already a column on
both spec tables and appears nowhere on the sheet, but adding it is new design content the
handoff did not draw, so it stays out until someone decides it belongs.

**When to revisit:** if product and rear-panel photography lands at aspect ratios that
change the block heights materially, or if a SKU's spec grid grows past what page 3
holds. Also revisit if the on-screen portal view (same tokens, different layout) makes a
paginated three-page PDF feel long next to it.
