# 0082 — Quick Project Calculation & Quote

Status: Accepted (2026-07-20 — implemented; layout per the 2026-07-16 design handoff)
Deciders: Andy Newbom
Relates to: the full calculator, `src/lib/calculator/tables.ts` (VSR standard, VMS options), the submission and Pipedrive deal flow, the System Estimate PDF.

## Context

Sales and partners often need a quote before full camera specs exist. Today that means the full eight-field calculator or a longer discovery call just to get numbers into a quote doc. The eight-field camera-group card suits a Technical Differentiator and overloads a Box Mover, who wants a size and a number.

## Decision

Add a separate **Quick Project Calculation & Quote** page. The user sets six things: partner block (company, partner user, project name), VMS, number of camera streams, retention days, and add-ons (Failover Recorder, Management Server). Everything else is fixed to the Arxys VSR standard, shown read-only so the basis is visible but not editable: 4MP, 15 FPS, H.265, medium complexity / low motion, record on motion 75%, 24 hours, single stream per camera, 20% storage overhead.

It feeds the exact same pipeline as the full calculator: a saved submission, a Pipedrive deal, and the same System Estimate PDF. Nothing forks. Home: repurpose the existing "Calculator" card in the dashboard TOOLS row into this page; the large hero stays the entry to the full calculator, removing the current two-entries-one-tool redundancy.

## Consequences

- No new output path, no PDF change. The System Estimate already prints the camera schedule, so the fixed VSR values appear on the doc and show how the numbers were reached.
- The full calculator's default camera group records Constant while Quick Calc uses motion 75%, so the two disagree on defaults for the same camera count. Accepted this session as-is; motion 75% is the confirmed VSR standard, so the full-calc Constant default is the outlier, and aligning it is out of scope here.
- Design owns the page layout (wireframe then screen); Code owns the build.

## Gates

- None beyond normal review. No schema, RLS, or CRM write-path change; it reuses the existing submission and deal paths.
