# 0013 — Submission result rendered inline on the calculator page

- **Status**: Accepted
- **Date**: 2026-05-18

## Context

When a partner clicks Save on `/calculator`, the Server Action persists the submission and runs the recommendation algorithm. The result needs a surface — somewhere the partner sees "you'll get N × V500." Two surfaces are plausible.

## Options considered

- **Dedicated `/submissions/[id]` page.** Standard REST shape. Gives a shareable URL the partner can bookmark or forward. Requires a new route, RLS-checked fetch, layout, and back-link wiring.
- **Inline panel on `/calculator`.** Result renders below the existing form on Save. No navigation. Partner stays in the calculator and can tweak inputs without losing context.

## Decision

**Inline panel on `/calculator`.** No `/submissions/[id]` route for Phase 1. The Server Action returns the recommendation in its state payload; the client renders it directly below the form via the existing `useActionState` flow.

## Consequences

**Positive:**
- One screen, one flow: calculate → save → see recommendation → "looks good." Matches the legacy PHP calculator's behaviour, so partners already know the shape.
- No new route, no new layout, no shareable-URL semantics to design.
- Tweaking inputs and re-saving stays cheap — partner sees the new recommendation in place.

**Negative:**
- No shareable URL for a single submission. A partner who wants to forward "this is what we sized" to a colleague has to take a screenshot.
- Historical submissions are not browsable from the UI. They live in the `submissions` table and surface only via the sales notification email and admin tooling.

**When to revisit:**
- A partner asks for a shareable-quote URL or a "history" view, or sales wants the partner to be able to re-open a prior quote without re-entering the form.
