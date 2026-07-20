# Handoff: Arxys Partner Portal — UI/UX pass (A, B, C + D consistency)

## Overview
A refinement pass on the shipped Arxys Partner Portal (Next.js app, repo `Arxys-Projects/Portal`). Four workstreams:

- **A — Quick Project Calculation & Quote** — a new fast-path calculator page.
- **B — Dashboard regroup by job** — replace the Tools/Reference taxonomy with job groups (Size a job / Win a job / Look it up / Track my work).
- **C — Compare split** — separate the two tools that share one "Compare" nav item into two reachable homes; relocate the VMS validation-sheet downloads.
- **D — all-pages consistency & UX pass** — naming, component/spacing alignment, responsive.

Plus a **status-model change** the designs already reflect (see "Status model" below).

This portal already exists and partners like it — this is refinement, not a rebuild.

## About the design files
The two `.dc.html` files in this bundle are **design references** — HTML/JS prototypes showing intended look, layout, and behavior. **Do not ship them.** The task is to **recreate these designs inside the existing Portal codebase** using its established patterns: the shared primitives in `src/app/(app)/_components/ui/` and the token layer in `src/app/globals.css` (ADR 0067 architecture, ADR 0075 palette). Where a prototype re-implements something the app already has (buttons, selects, tables, cards, status badges, metric tiles), use the real component — don't fork a new one.

- **`Portal — Full Fidelity.dc.html`** — hi-fi. Working chrome that switches between Dashboard, Quick Calc, VMS Server Comparison, VideoX Quick Compare, My Pipeline, Submission detail, Products & Prices (landing + V250 detail), and Admin overview. Colors/type/spacing match ADR 0075. Open it and click through: header nav, the **Compare ▾** dropdown, and the dashboard cards all navigate.
- **`Portal UX Pass — Wireframes.dc.html`** — lo-fi. The A/B/C structure and the D findings, grayscale, for rationale/structure reference.

## Fidelity
**High-fidelity** for A, B, C and the corrected D patterns (recreate pixel-faithfully with the existing `ui/` components + tokens). The wireframes file is **low-fidelity** (structure/rationale only).

## Status model (applies across the app — confirm ownership)
The designs assume the submission status enum is being reduced to **three values: Open, Won, Lost** — no more Draft / Sent / On-Hold, and **no weighting / weighted forecast** anywhere.

- Dashboard metric strip: **Open pipeline** ($), **Open projects** (count), **Won projects** (count). Weighted Forecast tile removed.
- My Pipeline: status filter pills **All · Open · Won · Lost · No Status**; per-row status `<select>` offers Open/Won/Lost/No status; the summary bar shows **Open Pipeline** only (no weighted forecast).
- Admin overview: the XLSX card is **Export Pipeline** (not "Export Forecast"); drop "weighted-forecast" wording.

The enum, RLS, and the forecast lib are **Claude Code territory** (see Do-not-touch). This handoff documents the *design* impact; align the underlying `submissions/status.ts`, `lib/pipeline/forecast.ts`, and any `STATUS_META` consumers as a code task. Status dot/badge colors to adopt:
- **Open** — dot `#2b62c9`; badge `bg #eaf1fc / text #1f4fa8 / border #c3d8f4`
- **Won** — dot `#177a4f`; badge `bg #e7f4ec / text #136340 / border #b6ddc6`
- **Lost** — dot `#c0392b`; badge `bg #fbeceb / text #a12c20 / border #f0c6c1`
- **No status** — dot `#b7bfc9`; badge `bg #f2f4f7 / text #6b7280 / border #e0e4ea`

## Hard rails (do not violate)
- "**Validated**," never "certified."
- **No partner/discount pricing in portal UI.** Show **list price / MSRP** only; discounts live in the generated PDF.
- Plain, technically accurate voice. **No invented spec numbers, delivery times, or pricing.** Persuasive bodies (e.g., the VMS "Why partners switch" band) arrive from a separate copy pass — build the placement/component, leave the words as provided.
- Conservative sizing language.

## Do not touch (Claude Code, not design — but noted for context)
Pricing logic and partner-discount rendering; Pipedrive integration and project-to-quote flow; generated PDFs/XLSX; record-level access, roles, RLS; the recommendation/sizing engine. The status enum change above is a code task to coordinate, not a design deliverable.

---

## Surfaces

### A — Quick Project Calculation & Quote (new page)
**Purpose:** produce the same saved quote + System Estimate PDF as the full calculator, from far fewer inputs, for fast quoting when full camera specs aren't in hand. Serves the "Box Mover" integrator and internal reps.

**Route:** new page (suggest `/quick-calc`). Reached from the dashboard "Size a job" group (the repurposed card — see B). Not a mode of the full calculator; a separate, focused page. Feeds the **same** submission save → Pipedrive deal → PDF pipeline.

**Layout:** single focused column, ~760px max-width. Back-link → page title → intro → one **Project** card → read-only **Assumptions** card → **Recommended configuration** result card.

**Inputs the user sets (only these):**
- Partner block: **Company** (select), **Partner user** (select), "+ Company not onboarded? Add a new name" link, **Project name** (text). (Mirrors the full calculator's on-behalf-of block; a partner sees their own company/user prefilled, an internal user picks the target partner.)
- **Which VMS?** (select)
- **Camera streams** (single number — one lump, all treated identically)
- **Retention (days)** (number)
- **Add-ons:** Failover Recorder (checkbox), Management Server (checkbox)

**Fixed assumptions (read-only strip, `--panel` card, "read-only" lock chip):** shown as pills, not editable — 4MP (2560×1440) · 15 FPS · H.265 (HEVC) · Medium detail, low motion · Record on motion · 75% · 24 h/day · 1 stream/camera · +20% storage overhead. Copy under it: they drive sizing and print on the System Estimate; to change them, use the full Calculator.

**Result card:** white card, 3px navy top rule. Recommended model + units, one-line config description, **Total list price** (list only). Primary button **Save & request quote**; secondary link "Need per-camera detail? Open the full Calculator →".

**Acceptance:** completes in a fraction of the full calculator's fields; assumptions visible but not editable; reads as its own tool. See the authoritative Quick Calc scope doc for engine details (record-on-motion 75% is the VSR standard; the full calculator's Constant-recording default is the outlier — flagged, out of scope here).

### B — Dashboard regroup by job
**Purpose:** orient a partner at a glance; stop burying the deal-winning tools under "Reference"; remove the duplicate full-calculator entry.

**Route:** `/dashboard` (`src/app/(app)/dashboard/page.tsx`).

**Layout (top → bottom), max-width 1152px:**
1. Greeting `Welcome back, {firstName}` + subtitle (unchanged).
2. **Metric strip** — 3 stat tiles (see Status model): Open pipeline / Open projects / Won projects. `MetricTile variant="stat"`.
3. **Size a job** — the existing navy gradient **Storage & Bandwidth Calculator** hero ("Start here" → New estimate) + "Pick up where you left off" recent-quotes column (unchanged), then a full-width nav card **Quick Project Calculation & Quote** → route A. *This card is the repurposed old "Calculator" card from the Tools row; the hero remains the full calculator, removing the current two-entries-one-tool redundancy.*
4. **Win a job** — one first-class, elevated card: **VMS Server Comparison** (gold left accent, gold eyebrow, persuasion subtitle) → route C. This is the strongest convince surface; treat it like one, not a reference tile.
5. **Look it up** — 3 nav cards: **Products & Prices** → price book; **VideoX Quick Compare** → route C; **VideoX Price List** (XLSX download).
6. **Track my work** — **My Pipeline** nav card → `/submissions`.
7. Keep: **Register a Deal** card (+ inline form) and **Support** card; **Admin** full-width card for admins.

**Acceptance:** persuasion tools out of "Reference"; single full-calculator entry (the other opens Quick Calc); four job labels read at a glance.

### C — Compare split
**Purpose:** two tools with different jobs currently share one "Compare" nav item, and the persuasion tool is only reachable from a dashboard card.

**Nav:** replace the single **Compare** item with a **Compare ▾** dropdown (`src/app/(app)/_components/portal-header.tsx`) → two items: **VMS Server Comparison** and **VideoX Quick Compare**. Keeps one top-level slot (the header already fought crowding — ADR 0070). *Two top-level slots is an acceptable alternative if bar space allows — confirm with stakeholder.* Nav = card = page-header labels, everywhere.

**C1 — VMS Server Comparison** (`/comparison`) — persuasion / "win a job":
- Page header `VMS Server Comparison` + subhead (existing `MESSAGES.page_subhead`).
- **"Why partners switch" band** — 3 cards using existing message copy repositioned to the top: `lead_time_callout`, `hdd_callout`, `second_source_note` (gold left accent). *These are existing strings, repositioned; net-new persuasive copy arrives separately — leave placeholders where none exists.*
- Step 1 Vendor select → Step 2 Model select (unchanged flow + engine).
- **VMS validation sheets** row — the **Avigilon / Milestone / Genetec** download buttons **move here** from VideoX Quick Compare. Links are `VMS_OPTIONS[].sheetUrl` in `src/lib/videox-compare/vms.ts` (Avigilon/Milestone/Genetec PDFs). *This reverses the earlier "leave vendor chips as-is" hold — the client confirmed the buttons download VMS-validated PDFs and belong on this tool.*
- Spec comparison table (Specification / competitor / Arxys VideoX / Advantage), pricing comparison (competitor quote input vs Arxys MSRP → you save; `price_disclosure`), deployment multiplier slider (`multiplier_label`), CTA (`Download This Comparison (PDF)` + `Get My Partner Quote`). All existing behavior/engine; restyle to the shared `ui/` components (see D) instead of the bespoke `comparison.css` `ac-*` classes.

**C2 — VideoX Quick Compare** (`/videox-compare`) — utility / "look it up":
- Page header **VideoX Quick Compare** (rename from the current "VideoX Model Quick Compare" and its centered gold title → the standard back-link + ink H1 + subtitle pattern).
- Min-camera filter, tick-to-compare (2+ models collapse to those columns, gold diff highlight, "Show all models"), section groups (Overview/System/Storage/Networking), footnote — all unchanged.
- **Remove** the Avigilon/Milestone/Genetec pill row + validation-sheet banner (moved to C1).

**Acceptance:** persuasion tool no longer hidden inside a utility; each separately reachable; labels consistent; validation downloads live with the switch decision.

### D — Consistency & UX pass (findings → corrected patterns)
- **Naming — one label per thing.** Nav/card/page-header must match. Canonicals: **VMS Server Comparison**, **VideoX Quick Compare**, and keep **Products & Prices** (nav + card; page title may keep "VideoX V5 Price Book" qualifier). *Decision: "Products & Prices" stays — not "Price Book."*
- **Component & spacing.** Migrate the Calculator, VMS Server Comparison, and VideoX Quick Compare off their bespoke scoped CSS (`calculator.css`, `comparison.css`/`ac-*`, `videox-compare.css`/`vxc-*`) onto the shared `ui/` set: Button / Select / Table / Card / MetricTile / StatusBadge. One page-header pattern (back-link + ink H1 + subtitle). One metric tile. One table chrome. Calculator per-group summary numerals are off-palette (purple/green/orange) → navy figures; gold only as sparing accent.
- **Responsive.** Make usable on phone: dashboard, Quick Calc, My Pipeline (reflow rows→cards), Price Book landing, submission detail, VMS Server Comparison intro/CTA, Portal guide. Call out (don't force) the full Calculator's per-group inline fields and dense spec matrices (VideoX Quick Compare, per-group breakdown, admin tables) — use sticky first column + horizontal scroll and steer phone users to Quick Calc.

---

## Interactions & behavior
- **Header nav** derives active tab from `usePathname()`; active item = navy semibold with a 2px navy bottom rule. **Compare ▾** toggles a dropdown (click item to navigate/close). `<900px` collapses to the existing hamburger.
- **NavCards**: whole card navigates; hover lifts (`-translate-y-0.5`), border → navy, bg → navy-soft/60, soft shadow; corner arrow (or download glyph). No inner buttons.
- **My Pipeline** row actions: View (primary sm) · Revise (secondary sm) · PDF (secondary sm) · delete IconButton (disabled unless deletable). Status `<select>` with colored leading dot. Preferred star toggles.
- **VideoX Quick Compare**: checkbox per model column; 2+ checked → table collapses to those columns and highlights differing rows; "Show all models" clears.
- All flows, the recommendation engine, Pipedrive, and PDF/XLSX generation are **unchanged** — the UI binds to existing functions/server actions.

## State
No new global state. Screen-local only: Quick Calc form fields; compare-tool selections (vendor/model, ticked models, min-cameras, deployment slider); pipeline row status/preferred/delete-confirm (existing server actions). Data fetching unchanged.

## Design tokens (ADR 0075 — in `src/app/globals.css @theme`)
- **Navy:** `--color-arxys-navy #14346b`, deep `#0d244a`, soft `#eef2f8`. Navy is the **action** color.
- **Gold (sparing accent only, not actions):** `--color-arxys-gold #fbb040`, hover `#eaa52c`, on-white text `#c17f10`, text-on-gold `#1a1205`.
- **Surfaces:** page `#e7eaee`, surface `#ffffff`, panel `#f4f6fa`.
- **Lines:** `#d7dce3` (card, 2px), strong `#cdd5e0` (NavCard 3px), soft `#eceef2`.
- **Ink:** `#111826` (content), ink-soft `#4a5568` (labels/subtitles).
- **Secondary (outline/hover fill):** `#e7edf7` / hover `#dbe4f2`. **Danger:** `#c0392b` / deep `#9f2b22` / soft `#fbeceb`.
- **Status colors:** see "Status model" above.
- **Radii:** cards `14px`, controls/buttons `8px` (`rounded-lg`), tiles `10px`, badges pill.
- **Type:** **Geist Sans / Geist Mono** (font-frozen per ADR 0075 — do NOT switch to Space Grotesk/IBM Plex the old mockups showed). Price-book route also uses Poppins/Montserrat today. Metric numbers use `tabular-nums`.

## Assets
- `arxys-logo.png` — the real wordmark from `public/email/arxys-logo.png` in the repo (used in the header). Product/rack photos in the prototype are **striped placeholders** (only the logo was available) — use the real `public/price-book/*` images already in the repo when implementing.
- Icons are simple inline stroke SVGs copied from `dashboard/icons.tsx` / `card.tsx` — reuse the repo's icons.

## Codebase mapping (where each surface lives)
- Chrome: `src/app/(app)/layout.tsx`, `_components/portal-header.tsx`, `_components/footer.tsx`
- Shared UI: `src/app/(app)/_components/ui/` (`button`, `select`, `card`, `table`, `status-badge`, `metric-tile`, `styles.ts`)
- Tokens: `src/app/globals.css`
- A: new route; model on `calculator/` + `lib/calculator/*`, `lib/recommend/*`
- B: `dashboard/page.tsx`, `dashboard/icons.tsx`, `register-deal-form.tsx`
- C1: `comparison/` (`page.tsx`, `comparison-form.tsx`, `comparison.css`), `lib/comparison/*`
- C2: `videox-compare/` (`page.tsx`, `videox-compare-form.tsx`, `videox-compare.css`), `lib/videox-compare/*`
- Status: `submissions/status.ts`, `submissions/pipeline.tsx`, `lib/pipeline/forecast.ts`
- Price book: `price-book/page.tsx`, `price-book/[slug]/`, `lib/price-book/*`
- Admin: `admin/page.tsx`, `admin/layout.tsx`

## Files in this bundle
- `Portal — Full Fidelity.dc.html` — hi-fi interactive prototype (all screens).
- `Portal UX Pass — Wireframes.dc.html` — lo-fi wireframes + D findings.
- `arxys-logo.png` — header logo asset.
