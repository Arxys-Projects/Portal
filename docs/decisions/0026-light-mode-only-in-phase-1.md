# 0026 — Light mode only in Phase 1

- **Status**: Accepted
- **Date**: 2026-05-20

## Context

Next.js's `create-next-app` template ships `src/app/globals.css` with a `prefers-color-scheme: dark` media query that swaps `--background` and `--foreground` to dark values when the visitor's OS is in dark mode. The portal UI as of Phase B has zero dark-mode styles — cards, inputs, buttons, borders, the side-nav, the dashboard widgets all assume a white background with dark text.

The result: any visitor on macOS / iOS / Windows with system dark mode enabled saw text inheriting `--foreground: #ededed` (near-white) on unstyled-background elements. Most components in the portal pin their text color explicitly with Tailwind classes (`text-neutral-700`, `text-neutral-900`), so the bug was masked — but native form elements (`<input>`, `<textarea>`, `<select>`) didn't pin a text color and rendered near-white on the white card.

Surfaced when Andy (macOS dark mode) ran the Step 9 follow-up smoke test, opened the invite form at `/admin/partners/new`, and saw white-on-white text in every field. Exactly the kind of "works on my machine until it doesn't" bug the dark-mode auto-switch was always going to produce.

## Options considered

- **Implement full dark-mode support across every component.** Correct end-state but huge surface area — every card, button, border, badge, table, focus ring, hover state. Out of scope for Phase 1 (MVP).
- **Patch only the form elements** with explicit text/background colors. Fixes the visible bug but leaves the `prefers-color-scheme: dark` ticking — the next unstyled component added in Phase 2 onward re-introduces the same class of bug.
- **Remove the `prefers-color-scheme: dark` block entirely.** Portal renders identically regardless of OS preference. Smaller test surface; predictable for every user. Re-add dark mode as a deliberate Phase 2+ project with an actual design.

## Decision

**Remove the `prefers-color-scheme: dark` block from `src/app/globals.css`. Portal is light-mode only in Phase 1.**

Also add explicit form-element CSS in the same file:

- `input, textarea, select` get explicit `color: #171717` and `background-color: #ffffff` so they never inherit anything pale.
- `::placeholder` gets `#6b7280` (Tailwind gray-500, ~4.7:1 contrast on white — passes WCAG AA) and `opacity: 1` (Firefox defaults to 0.54, which reduces effective contrast below AA).
- `-webkit-autofill` is overridden so Chrome/Safari's pale yellow autofill paint doesn't recreate the same low-contrast bug.

## Consequences

**Positive:**

- Form elements render identically for all users regardless of OS preference.
- Placeholder color is intentional and accessible.
- Chrome autofill no longer ghost-renders pale text.
- Smaller test/design surface for Phase 1.

**Negative:**

- Users with dark-mode OS preferences don't get a dark portal. The portal is a B2B tool, not a consumer app — acceptable.
- Adding dark mode later requires re-introducing the media query AND building dark variants for every existing component. Tracked as a Phase 2 candidate.

## When to revisit

Phase 2 or later, if partner feedback specifically asks for dark mode, or if marketing wants a dark-themed marketing page the portal should match. At that point, treat dark mode as a proper design project, not an OS-preference auto-switch.
