# 0106 — Datasheet fonts are committed TTFs, not Google-hosted

- **Status**: Accepted
- **Date**: 2026-07-30

## Context

The datasheet design specifies two families — Poppins 600 for numerals, feature titles
and headline values, Montserrat 400/500/600/700 for everything else — both from Google
Fonts. Every existing PDF in the portal (System Estimate, Project Quote, Customer
Proposal, Comparison) uses the PDF built-in Helvetica and registers no fonts at all, so
there was no precedent to follow.

`@react-pdf/renderer`'s `Font.register()` accepts a URL as `src`, which is the path of
least resistance and the one most examples show.

## Options considered

- **Register from `https://fonts.gstatic.com` URLs.** Zero repo weight, always current —
  but every render then depends on a third party being reachable, and a cold serverless
  invocation with no egress fails the whole PDF rather than degrading.
- **Keep Helvetica, matching the other PDFs.** No new assets, consistent with the
  existing pipeline — but abandons the design's type system entirely, and Helvetica's
  metrics differ enough from Montserrat's that the handoff's verified page fit stops
  meaning anything.
- **Commit the TTFs under `public/fonts/` and register from disk.** ~870KB in the repo;
  renders are hermetic.

## Decision

Commit the five TTFs (Montserrat 400/500/600/700, Poppins 600) to `public/fonts/` and
register them by absolute path in `src/lib/datasheet/tokens.ts`.

`Font.registerHyphenationCallback` is set to the identity function at the same time —
without it, react-pdf breaks long unhyphenated tokens mid-word, which mangles part
numbers (`VX5-V800-576`) and VMS names.

## Consequences

**Positive:** renders are deterministic and offline-safe; the design's type system is
reproduced rather than approximated. Registration is idempotent and centralised, so the
route handler and the render script share one code path.

**Negative:** ~870KB of binary in the repo, and font updates become a manual re-download.
The route that renders datasheets will need an `outputFileTracingIncludes` entry in
`next.config.ts` — the same treatment `src/lib/pdf/assets.ts` already documents for
runtime-computed asset paths — or Vercel's trace step will not ship the TTFs.

**When to revisit:** if the portal adopts a font-loading strategy for other surfaces, or
if a licensing review objects to redistributing the files (both are SIL Open Font
License, which permits it).
