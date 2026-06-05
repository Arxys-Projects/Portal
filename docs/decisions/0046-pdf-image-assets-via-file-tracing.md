# 0046 — PDF image assets via fs read + output file tracing

- **Status**: Accepted
- **Date**: 2026-06-05

## Context

The Phase 9 System Estimate PDF is the first PDF in the project to embed raster
images: the Arxys logo and the VideoX product hero shots. The earlier
comparison PDF (`comparison-template.tsx`) sidestepped this by rendering the
word "ARXYS" as bold text. `@react-pdf/renderer` runs in the Node runtime
(the route already pins `runtime = "nodejs"`), and its `<Image>` accepts a
base64 data URI, a remote URL, or a local path.

The assets live under `public/`. Vercel does not ship `public/` into a
serverless function's filesystem by default, and the hero path is chosen at
request time from the recommended product group, so `@vercel/nft` cannot trace
it from a static string.

## Options considered

- **Remote URL fetch** (`<Image src="https://portal.arxys.com/...">`) — no
  build config, but adds a network round-trip per render and fails the whole
  PDF if that fetch errors. Render is no longer deterministic.
- **fs read + base64 data URI, bundled via `outputFileTracingIncludes`** —
  deterministic (no network at render time), but needs one next.config entry
  because the hero path is dynamic.
- **Import the PNG as a module** — Next turns a PNG import into a
  `StaticImageData` URL object, not bytes react-pdf can embed in Node. Doesn't
  work without extra loader plumbing.

## Decision

Read the PNGs off disk in `src/lib/pdf/assets.ts` (cached per process) and hand
the template base64 data URIs. Add an `outputFileTracingIncludes` entry keyed
to `/api/submissions/*/pdf` so the logo and `public/price-book/**/*.png` ship
with the serverless function. The loader returns `null` on a missing file and
the template falls back to text/placeholder, so a tracing miss degrades rather
than crashes.

## Consequences

**Positive:** Renders are self-contained and deterministic — no network
dependency, works identically in dev and on Vercel. The hero image reuses the
canonical `productGroupToFamilySlug` → `families.ts heroImage` mapping, so it
stays in sync with the Price Book.

**Negative:** A new public image used by the PDF must be covered by the
tracing glob (the `price-book/**` glob already covers the heroes). The logo is
listed explicitly, so moving it requires updating next.config.

**When to revisit:** If a future PDF needs images from outside `public/`, or if
Vercel changes how `public/` is bundled, reassess the remote-URL option.
