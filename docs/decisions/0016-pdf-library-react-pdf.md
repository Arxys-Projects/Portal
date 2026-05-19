# 0016 — `@react-pdf/renderer` for submission PDFs

- **Status**: Accepted
- **Date**: 2026-05-19

## Context

Every saved submission needs a partner-branded PDF — same content that the
legacy WordPress mailer produced via Dompdf
(`reference/arxys-calculator-mailer-FINAL.php`, `arxys_build_pdf_html`).
The portal runs on Vercel serverless functions, where every byte of the
function bundle counts and the Edge runtime has no Node builtins.

Three libraries are in scope.

## Options considered

- **Headless Chrome (Puppeteer / Playwright / `@sparticuz/chromium`).**
  HTML-to-PDF; the legacy mailer's CSS would port almost verbatim. But the
  binary is ~50 MB compressed, often >100 MB unpacked. Vercel function bundles
  cap at 50 MB and "chromium on serverless" is a long-tail of layer-config
  pain. Cold starts are also slow. Power tool, wrong shape for one PDF per
  submission.
- **`pdf-lib`.** Tiny (~300 KB), pure JS, but it's a low-level "draw text at
  (x, y)" API. Reproducing the multi-section legacy report would mean writing
  a mini-layout engine. The legacy PHP used Dompdf precisely to avoid that.
- **`@react-pdf/renderer`.** JSX-based, ships ~1 MB, runs in plain Node
  serverless functions, no Chrome. Layout primitives (View/Text/StyleSheet)
  map closely to the box model the legacy CSS used, so the eight sections
  port cleanly. Loses some HTML niceties (no flex `gap`, no CSS Grid, font
  registration required for non-defaults) but everything we need is in scope.

## Decision

**`@react-pdf/renderer`.** One dependency (`^4.5.1`), no native binary,
no Chrome. `SubmissionPdf.tsx` is a React component; `renderToBuffer` turns
it into a PDF the same code path uses for both the Download button and the
email attachment.

## Consequences

**Positive:**
- Vercel-friendly: small bundle, plain Node runtime, no chromium layer.
- One render entry point (`renderSubmissionPdfBuffer`) for both the route
  handler and the Server Action.
- JSX maintainability — easy to add or reshape sections without re-learning
  a low-level draw API.

**Negative:**
- Lower visual ceiling than HTML-to-PDF. Some legacy CSS (float layouts,
  fancy CSS) doesn't port; we approximate with View/StyleSheet primitives.
- Default fonts only (Helvetica / Times / Courier). Custom typography would
  require registering and bundling font files. Not needed today.
- Renderer is bundled into the Node serverless function — adds ~1 MB plus
  React-PDF's parser/font deps. Acceptable; well under the Vercel limit.

**When to revisit:**
- The PDF design needs a layout primitive React-PDF doesn't support (e.g.,
  variable-height multi-column flow, charts, embedded fonts at scale).
- Cold-start latency on `/api/submissions/[id]/pdf` becomes a UX problem.
