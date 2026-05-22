# Step 8a — Price Book mockup (variant A: datasheet card)

> Static HTML mockup. No backend. No build step. Open the files in any browser.

## What's here

| File | Purpose |
|---|---|
| `index.html` | Price Book landing page. Grid of family cards (4-up at desktop). |
| `v400-detail.html` | Representative family detail page. Click the "DETAIL EXAMPLE →" V400 card on the index to navigate. |
| `assets/` | Hero images extracted from the V5 MSRP Price Book PPTX. |

## How to view

Either:

```bash
# Quick: open the file directly
open docs/phase-2/mockups/step-8a/index.html
```

…or serve via a one-line static server (handles the linked CSS + image paths cleanly):

```bash
cd docs/phase-2/mockups/step-8a
python3 -m http.server 8088
# then visit http://localhost:8088
```

## What you're looking at

**Variant A — Datasheet Card.** Matches the visual rhythm of the V5 MSRP Price Book PPTX + arxys.com `/videox-appliances/` page:

- Hero with chassis photo left, family name + tagline + "Great For" callout right
- 3-tile quick-stats row (Max VSR / Throughput / Warranty)
- Two-column Key Features + Technical Specs with gold-star bullets (matches Slides' `★` bullet style)
- SKU configurations table with **navy header row** + alternating zebra stripes for scannability
- Upgrade options as a secondary, lighter-styled table below
- Fine-print panel at the bottom (VSR definition, SQL caveat, NDAA, etc.)

## Brand surface

Pulled from `arxys.com` Elementor global CSS:

| Token | Value | Where used |
|---|---|---|
| Primary | `#054A91` Arxys navy | Headings, table headers, prices, CTAs |
| Accent | `#fbb040` Arxys Gold | Logo, family-name eyebrow, star bullets, left-border on "Great For" |
| Heading font | Poppins 500/600/700 | h1–h3, table headers, KPI numbers |
| Body font | Montserrat 400/500/600 | Paragraphs, table cells, UI |
| Text | `#333333` | Body copy |
| Soft navy bg | `#f0f5fa` | Quick-stats tiles (subtle navy tint) |

Note: this mockup is **scoped to the price book pages only** — the rest of the portal (calculator, submissions, admin) continues to use the current Gold-primary Montserrat-only styling. The navy primary + Poppins are introduced behind a `/price-book/*` route boundary in the eventual 8b implementation. See `docs/phase-2/step-7-partner-xlsx-download.md` for the prior step's brand context.

## Specifically react to

1. **Overall feel** — does this read as "arxys.com section embedded in the portal" or "portal page with arxys colors stuck on"? The former is the goal.
2. **Hero layout** — left chassis photo + right copy. Slides do this top-vs-bottom; I switched to side-by-side because the chassis is wide and the screen is wider than a slide. Acceptable?
3. **Quick-stats row** — Max VSR / Throughput / Warranty. Useful summary at a glance, or noisy? The Slides don't have this; it's a portal-specific affordance.
4. **Gold-star bullets** — the `★` mirrors the PPTX exactly. Looks intentional, or kitschy?
5. **SKU table** — navy header is bold. Want subtler (e.g., gold accent line + light bg) or keep this confident?
6. **Index page card density** — 4-up at desktop, 2-up at tablet, 1-up at mobile. Comfortable, or want denser?
7. **Family grouping on index** — currently three sections: "NVR/Mgmt/ACM 5yr" / "Video & Analytics 5yr" / "High-Density 5yr". Matches PPTX product-group table on page 3. Right?
8. **What's missing** that the PPTX has and I dropped? (Compliance badges? AMD Zen5 marketing block? VSR explanation page?)

## Known shortcuts in this mockup (NOT real implementation)

- **Tailwind CDN, not the portal's Tailwind 4 build.** Final implementation reuses the portal's existing Tailwind config + adds the new tokens via `globals.css`.
- **Family cards all link to v400-detail.html.** Final implementation routes each card to `/price-book/[slug]`.
- **Prices and content are hardcoded.** Final implementation joins `families.ts` content data with live Supabase prices.
- **`v700-v800-hero-LOWRES.png` is 20KB / low resolution.** That chassis image needs a replacement before going live. Flag if you have a better one; otherwise we use a generic 4U-chassis stock photo or render.
- **Workstation hero is a text placeholder.** Real implementation lifts one of the 5 workstation images from the PPTX (image14/15/16/17/20).
- **No accessibility audit yet** — semantic structure looks OK but no formal pass.
- **No print stylesheet.** Add if partners want to print individual family pages.

## What 8b will do with this

If you approve variant A:

1. Add brand tokens to `src/app/globals.css` (navy + Poppins import) scoped to price-book routes.
2. Move `assets/*.png` to `public/price-book/` with proper Next.js image optimization sizes.
3. Re-encode `v700-v800-hero-LOWRES.png` (or substitute) — flag for source asset.
4. Create `src/lib/price-book/families.ts` with the per-family content data, pre-seeded from the PPTX content.
5. Build `src/app/(app)/price-book/page.tsx` (index) + `src/app/(app)/price-book/[slug]/page.tsx` (detail) using the same JSX layout as these mockups.
6. Server-side join Supabase `products` rows (filtered by `product_group`) for the SKU table on each family page.
7. Add a "Price Book" card to the dashboard alongside Calculator / Submissions / XLSX Download.
8. Header nav link.
9. Tests for the families.ts data shape + a smoke test that each route renders.

Estimated 8b effort: 1.5–2 days focused.

## If you want variant B (spec-sheet) for comparison

Reply "variant B" and I'll produce one in the next turn. Variant B would be denser: top-bleed hero strip, two-column body with the SKU table side-by-side with specs, less marketing real estate.
