# 0119 — Pipedrive deal links reuse one browser tab

- **Status**: Accepted
- **Date**: 2026-08-10

## Context

Every Pipedrive deal link in the portal (`partner-group-view.tsx` ×2, `submission-detail.tsx`
×1, `project-row.tsx` ×2 — the `/projects` row's "Add line items"/"Open deal" action button and
its "Open deal" task variant) opens with `target="_blank" rel="noopener noreferrer"`. Clicking
through several deals in a row — the common admin/rep workflow when working a partner's whole
pipeline — piles up one new browser tab per click, none of which get reused or focused, so the
tab bar fills up fast and the rep has to hunt for the right one.

`docs/sales-dashboard-definition.md` §6 proposed the fix and named two risks to verify before
committing to it in a build prompt: (1) whether Pipedrive's `Cross-Origin-Opener-Policy` header
isolates its browsing context and breaks tab reuse, and (2) the general browsing-context-name
scoping rule (see Consequences). Neither had been tested against real Pipedrive before this ADR.

## How the mechanism works

`window.open(url, name)` — and the equivalent `<a target={name}>` — resolves `name` against the
*opening* browsing context's own registry of named targets. A second navigation with the same
name reuses and refocuses the tab from the first, instead of opening a new one. This only works
if the name is a plain string shared across every call site; a typo or an inconsistent literal
at even one site silently opens its own extra tab instead of joining the rest.

`rel="noopener"` breaks this on purpose (it's a security control that prevents the new tab from
resolving *back* to the opener) — so all five render sites already used `noopener` specifically
to prevent the reuse this ADR wants. `rel="noreferrer"` alone keeps the same referrer-stripping
privacy property without severing the name binding, so it replaces `noopener noreferrer`
everywhere the change applies.

## Verification performed

Tested directly against production Pipedrive via Claude in Chrome (not simulated, not read from
headers alone — `read_network_requests` proved unreliable for top-level navigation headers, so
the test was behavioral): opened two different real deals (#5246, then #5122) from the same
originating tab using `window.open(url, 'arxysPipedrive')`. Result: one tab, reused and refocused
on the second open — no COOP interference observed. Confirmed separately that opening from a
second, independently-opened portal tab produces its own second Pipedrive tab (see Consequences)
— each originating browsing context tracks its own target-name registry; there is no cross-tab
signal that would let two unrelated portal tabs discover and reuse each other's Pipedrive tab.
Incidentally cross-verified Richard Kershaw's Pipedrive user id (3464106, from ADR 0118) against
his live deal-owner header during this same test.

## Options considered

- **Leave it as-is.** Rejected — the tab pile-up is a real, named complaint about actual daily
  use, and the fix is small and already de-risked.
- **A shared helper component wrapping every Pipedrive `<a>`.** Rejected for now — the five
  render sites have different markup, classes, and conditional wrapping (a badge vs. a button vs.
  a table-cell link); a wrapper would need enough props to fit all five that it wouldn't save
  much over each site importing one constant. `url.ts`'s own header comment already made this
  call once for the URL string itself ("those \[render] sites are left alone deliberately —
  retrofitting them is a tidy-up, not part of this work"); the same reasoning applies here.
  Revisit if a sixth site or a real behavioral difference between sites appears.
- **One exported `target` constant (`PIPEDRIVE_WINDOW_TARGET`) in `src/lib/pipedrive/url.ts`,
  imported at each render site; `rel` changes from `"noopener noreferrer"` to `"noreferrer"`
  alongside it.** Chosen — matches `pipedriveDealUrl`'s existing role as the one place Pipedrive
  link mechanics live, and a single exported string makes "all five sites use the exact same
  name" enforceable by import rather than by five people remembering to copy a literal correctly.

## Decision

- `PIPEDRIVE_WINDOW_TARGET = "arxysPipedrive"`, exported from `src/lib/pipedrive/url.ts` next to
  `pipedriveDealUrl`.
- All five render sites (`partner-group-view.tsx` ×2, `submission-detail.tsx` ×1,
  `project-row.tsx` ×2) changed from `target="_blank" rel="noopener noreferrer"` to
  `target={PIPEDRIVE_WINDOW_TARGET} rel="noreferrer"`. No other markup, styling, or behavior at
  any site changes.
- New `src/lib/pipedrive/url.test.ts` (this module had no test file before): asserts
  `pipedriveDealUrl`'s existing behavior and that `PIPEDRIVE_WINDOW_TARGET` is the exact stable
  string every site imports. No render-test infrastructure (RTL/jsdom) exists in this repo for
  any `.tsx` component — `partner-group-view.tsx`, `submission-detail.tsx`, and `project-row.tsx`
  join their sibling logic modules (`filter.ts`, `format.ts`, `row-copy.ts`, etc., which do have
  `.test.ts` files) in being untested at the render layer while their pure-logic dependencies are
  covered. Introducing a new test framework for a five-line attribute swap wasn't judged worth
  the added dependency; `tsc --noEmit` and `npm run build` catch a broken import, and the shared
  constant means there's exactly one string to get right instead of five.

## Consequences

**Positive:** clicking through several deals from one portal tab now reuses one Pipedrive tab
instead of piling up a new one per click — the actual complaint this fixes. The fix is
mechanical (an attribute swap, not new logic) and was verified against real production Pipedrive
before being committed to code, not just proposed in the design doc.

**Negative / known limitation:** the browsing-context-name registry is scoped per *originating*
tab. A rep working from two separately-opened portal tabs (e.g. one pinned tab plus one opened
from a bookmark) still gets two independent Pipedrive tabs — one per portal tab, not one total.
This is a platform constraint, not a bug in this implementation; there is no browser API that
unifies target-name registries across independently-opened tabs.

**When to revisit:** if a sixth Pipedrive-link render site is added, or if any of the five sites
needs materially different markup/behavior around the link (not just styling), reconsider the
shared-component option above.
