# 0032 — Price book brand scope and font loading strategy

- **Status**: Accepted
- **Date**: 2026-05-22

## Context

The price book (`/price-book/*`) uses Arxys navy (`#054A91`) as primary and Poppins as the heading font — matching arxys.com's Elementor theme. The rest of the portal uses the existing gold-primary Montserrat-only styling. Mixing the two in global CSS risks leaking the navy/Poppins surface into non-price-book pages.

Additionally, the CSS `@import url()` approach for loading Google Fonts fails with Tailwind 4's PostCSS plugin: the plugin expands `@import "tailwindcss"` into inline CSS, leaving any subsequent `@import url()` rules invalid (CSS requires `@import` to precede all other rules).

## Options considered

- **Option A: Add brand tokens globally, no scope.** Simple, but navy primary would change the appearance of calculator / submissions / admin pages.
- **Option B: Scope via a wrapper class in the route layout.** `.price-book-route` on the price book layout div; CSS rules prefixed with that class. Isolates the change. Chosen.
- **Option C: Parallel Tailwind config with separate CSS layer.** Cleanest isolation but requires build changes; overkill for a single route family.

For font loading:
- **Option 1: `@import url()` in globals.css.** Fails with Tailwind 4 PostCSS (see Context).
- **Option 2: `<link>` tags in the price book layout Server Component.** Next.js App Router hoists these to `<head>` automatically. Correct and idiomatic.
- **Option 3: `next/font/google`.** Type-safe, zero-FOIT, self-hosted. Would require font CSS variables threaded through the layout hierarchy. Viable future upgrade.

## Decision

Option B (`.price-book-route` wrapper class) + Option 2 (`<link>` in layout Server Component).

Brand tokens are added to `globals.css @theme inline` so Tailwind utilities like `bg-[#054A91]` work everywhere, but the font-family rules are scoped behind `.price-book-route`. Google Fonts are loaded lazily only on price book pages via route-level `<link>` tags.

## Consequences

**Positive:**
- No visual change to calculator, submissions, admin, or login pages.
- Google Fonts are only fetched when the user visits a price book page (no global perf hit).
- Easy to expand: adding a new price book page automatically inherits the scope.

**Negative:**
- Using raw hex literals (`text-[#054A91]`) instead of Tailwind token names (`text-arxys-navy`) in price book JSX. This is because Tailwind 4's arbitrary-value syntax works fine but doesn't show up in IDE autocomplete. Acceptable for a contained route.
- `next/font/google` (self-hosted, zero-FOIT) would be better long-term. Can migrate later without breaking changes.

**When to revisit:** If a second route family adopts the navy brand, extract tokens into a shared Tailwind plugin or switch to `next/font/google` with a font variable.
