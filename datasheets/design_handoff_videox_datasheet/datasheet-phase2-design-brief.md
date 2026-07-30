# Datasheet Phase 2 — Visual Design Brief

## Context

Arxys builds purpose-built video surveillance appliances (VideoX NVRs, AnalyticX AI appliances, SW
workstations). Every product datasheet today is built by hand in Illustrator, exported to PDF, and
uploaded manually to the website and partner portal. Any spec change means re-typesetting from
scratch. We're replacing that with a data-driven two-page datasheet: one token system and layout
concept that renders as both a downloadable PDF and on-screen content in the partner portal,
pulled from the same spec data the portal's Price Book already uses.

This session is design only. No code, no schema, no data population — just the token system and
the layout concept for the two page types below.

## Before you propose anything

Look at the attached datasheets first. These are the real Illustrator-built sheets Arxys ships
today, one per product line. Study how each one paces the page: what leads, how the feature
callouts sit against the spec blocks, where the compliance strip lands, how dense page 2 gets
against how open page 1 is. The new design doesn't need to match these pixel for pixel, but it
should feel like the same family of document, not a generic redesign that ignores what's already
established.

Also attached is one Project Quote PDF, already live in the portal and built with the same
`@react-pdf/renderer` pipeline the new datasheets will use. Match its type scale, spacing rhythm,
header/footer treatment, and general restraint. That document is the closest thing Arxys has to a
current PDF house style, and the datasheet should read as a sibling of it, not a different
product's document.

## Scope

Two modes, not three:

- **Video + Management** — share one template. Feature-block copy, spec grid, camera-count matrix,
  and the compliance strip all look and behave the same whether the sheet is a rack NVR (V100–V800)
  or a management appliance (V250/V255).
- **Workstation** — its own, simpler layout. No feature-icon block. Goes straight from hero and
  spec bullets to the camera-count matrix.

Out of scope for this pass: the ACM line (V150/V260/V265) and SW30. Don't design anything that
assumes ACM fields (door counts, certified-platform lists) exist — that's a separate future phase.

## What to design

- A token system: color, type, spacing, and the reusable component patterns (feature block, spec
  grid, camera-count matrix, compliance strip, badges).
- A layout concept for each of the two modes above.
- Both render targets in mind: the downloadable PDF and the on-screen portal page. They should
  share the token system even if the layouts diverge slightly for print versus screen.

## One non-negotiable: the rear-panel photo

Rear-panel photography doesn't exist yet for any product. Design the layout as if it does. Every
sheet that needs a rear-IO shot gets a real, sized, positioned image slot as part of the layout,
not something bolted on once photos land. Decide now what that slot looks like when the photo is
missing, whether that's held blank space, a placeholder treatment, or the section omitted per SKU,
and make that decision a deliberate part of the design rather than an afterthought.

## Brand tokens already established

- Gold + Grey + Montserrat is the base brand system.
- The live arxys.com CSS adds a navy `#054A91` primary and Poppins for headings. These currently
  live scoped to the portal's `/price-book/*` pages — treat them as available and correct, not as
  something to reinvent.

## Non-goals

- Not pixel-matching the Illustrator hero banner.
- Not writing new marketing copy — fill template variables with existing copy, don't originate new
  lines.
- Nothing ACM-specific, nothing SW30.

## Process

Show a few real directions before we lock one in. Once a direction is picked, it hands off to
Claude Code to build against `@react-pdf/renderer` and the existing spec data.

## What's attached

- Representative existing datasheets: at least one rack-video sheet (video), one management sheet
  (V250/V255), one workstation sheet (SW10/SW20).
- One Project Quote PDF.
