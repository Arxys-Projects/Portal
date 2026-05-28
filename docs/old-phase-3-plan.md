# Arxys Portal — Phase 3 Plan

**Created:** 2026-05-22  
**Status:** Ready for execution  
**Executor:** Claude Code (Opus, highest effort)

---

## Overview

Phase 3 focuses on two tracks:

- **Track A — UI/UX fixes and polish.** Quick wins that make the portal feel like real software. These ship first.
- **Track B — Calculator and Price Book enhancements.** Bigger functional improvements that build on the Phase 2 foundation.

Items are ordered by execution priority within each track. Track A goes first, then Track B.

---

## Pre-Execution Setup

Before writing any code, Claude Code must:

1. Read `docs/JOURNAL.md`, `docs/RUNBOOK.md`, and `docs/README.md` to understand current project state
2. Review existing component patterns, styling conventions, and page layouts
3. Copy the following uploaded image assets into the project's public/assets directory:
   - `Windows_Server_2022.png` — Windows Server 2022 + 2025 box art (both versions in one image)
   - `5_year_warranty-circle-2.png` — Five Year Warranty circular badge
4. Confirm the current Supabase schema for submissions (relevant to Track B item B4)

---

## Track A — UI/UX Fixes and Polish

### A1. Dashboard — Title and Card Styling

**Page:** Dashboard (main landing after login)

Changes:
- Page title: Change to **"Arxys Partner Dashboard"**
- Card headers: Increase font size to make category labels more prominent and visually distinct from card body content
- Card borders: Increase border width by 2–3px to give each card more visual weight and separation
- Background: Add a subtle off-white or light gray background to the page body (not pure white) so the cards have contrast and the page feels like an application, not a blank webpage
- Consider adding subtle card shadows for depth

**Goal:** The dashboard should feel like a professional partner portal, not a white page with some boxes on it.

### A2. Dashboard — Footer

**Change:** Add the same footer that currently exists on the Price Book page to the bottom of the Dashboard page. This should be a shared component if it isn't already — extract and reuse rather than duplicate.

**Goal:** Consistent chrome across pages. Makes the portal feel like a cohesive product.

### A3. Submission History — Delete Button

**Page:** Submission History

Changes:
- Add a delete button (trash icon or "Delete" text link) to each submission row
- On click: show a confirmation dialog ("Are you sure you want to delete this submission? This cannot be undone.")
- On confirm: **hard delete** the submission record from Supabase and remove the row from the UI
- No soft delete, no archive — keep storage clean

**Note:** This is a hard delete by design to avoid accumulating orphaned records over time.

### A4. Price Book — Header Text Changes

**Page:** Price Book (main listing page)

Changes:

**a) VIDEOX V5 title sizing:**
- Make "VIDEOX V5" visually as large as "MSRP Price Book" in the header
- Keep the existing orange color — same hue, just bigger text
- Both titles should feel like co-equal header elements

**b) Replace the subtitle/tagline text below "MSRP Price Book" with:**

> VideoX Enterprise IP video servers give security professionals a winning competitive edge with AI-optimized performance, ultra-reliable uptime, and plug-and-play scalability—purpose-built to handle today's demanding VMS workloads without compromise. Run modern CODECS at line speed, double your camera counts per server, and deliver advanced analytics—while protecting 30% more margin than quoting VMS branded Dell. That's your competitive edge.

**c) Replace the disclaimer/footer text at the bottom of the page with:**

> Prices and specs subject to change without notice. All tariff taxes are passed on to buyers. Prices and quotes expire immediately upon new prices and quotes. Prices, specs and availability superseded by latest Arxys price list on that date. We put our best effort and knowledge to maintain the accuracy of specifications and price. Should there be any discrepancies we reserve the right to follow our specifications and pricing. In case of a newer component or part we reserve the right to change to the newer part at our discretion. Thanks for your understanding.

### A5. Price Book — Windows Server and Warranty Images

**Page:** Price Book (main listing page)

**Change:** Add the Windows Server 2022/2025 box art image and the Five Year Warranty badge to the empty space on the right side of the blue header box. These should be sized to fit the available space without crowding — approximately 80–120px height, arranged side by side or stacked depending on available width.

**Assets:**
- `Windows_Server_2022.png` (shows both 2022 and 2025 editions)
- `5_year_warranty-circle-2.png`

### A6. Price Book — Enterprise Grade Highlighted Box

**Page:** Price Book (main listing page), positioned at the top of the page before product listings begin (below the header area, above the first product card)

**Change:** Add a highlighted/accented box containing:

> **Enterprise Grade:** Arxys VideoX servers come standard with:
> - Microsoft Windows Server 2022 or 2025
> - Hot-swap, enterprise class HDDs and SSDs
> - Hot-swap and redundant power and cooling
> - Dedicated secure remote management
> - Resilient Hardware RAID with cachevault protection
> - Rack slide rails, and lockable drive access

**Styling:** This should be a visually distinct banner — light background with a left border accent or subtle background tint. Not a full-color block, but clearly set apart from the product listings below it. Two-column bullet layout as shown in the reference screenshot if horizontal space allows.

### A7. Product Detail Pages — Reduce White Space

**Page:** All product detail pages

**Change:** Reduce vertical padding and margins on content elements below the blue VMS-validated box. Target approximately 20–30% reduction in spacing. The goal is to compress the scroll distance without making the layout feel cramped.

**Approach:** Audit the current spacing values (padding, margin, gap) on the elements below the blue box. Reduce them proportionally. Test on a few product pages to make sure it looks balanced before applying globally.

---

## Track B — Calculator and Price Book Enhancements

### B1. Calculator — Submit Button Repositioning

**Page:** Calculator

**Current problem:** The submit/request quote button is below the fold and invisible unless the user scrolls past all Camera Groups. Most users don't know it's there.

**Change:**
- Move the "Request Quote" / submit button to **above the Camera Groups section**, near the top of the calculator layout
- Button starts in a **disabled/grayed state**
- Button becomes **enabled and visually prominent** once at least one Camera Group has been configured (any non-zero input)
- Enabled state should draw the eye — full color, possibly with a subtle pulse or glow on first enable

**UX rationale:** The button being visible from the start teaches the user where they're headed. The disabled-to-enabled transition creates a clear "ready to go" signal.

### B2. Calculator — Smooth Result Appearance

**Page:** Calculator

**Change:** When the recommended solution box appears after submission, it should animate into view with a smooth CSS transition:
- Content below the insertion point slides down over ~300ms (ease-out)
- The result box fades in or slides in from the top
- No jarring layout shift — the whole thing should feel like a fluid reveal

**Goal:** "Magic software" feel. The result appearing should feel intentional and polished, not like the page just jumped.

### B3. Calculator — Product Detail Links in Results

**Page:** Calculator (submission result display)

**Change:** In the recommended solution output, the VideoX model name(s) (e.g., "VideoX V500", "VideoX V600") should be clickable links that navigate to the corresponding product detail page in the Price Book.

**Implementation:** Map each VideoX model identifier to its product detail route. The link should open in the same tab (standard navigation within the portal).

**Goal:** A user sees their recommendation, clicks the model name, lands on the full product detail with specs and PDF download. Simple and clean.

### B4. Calculator — Link to Product Detail from Submission History

**Page:** Submission History

**Change:** Each submission row should include a link to the recommended product's detail page, in addition to the existing PDF download. This could be the model name rendered as a link, or a small "View Product" button alongside the PDF download button.

### B5. Price Book — H.265 Performance Card

**Page:** Price Book (main listing page)

**Change:** Add a card/section on the Price Book page that surfaces the VideoX V5 H.265 performance story. This is a summary card, not the full technical page.

**Content:**
- Short heading: "VideoX V5 Drives H.265 Performance" (or similar)
- 2-sentence summary: Something like: "V5's AMD Zen5 architecture delivers 2.3x more H.265 streams per server, eliminating the performance penalty that forces most NVRs to fall back to H.264. Run modern codecs at full speed without compromising camera counts or analytics."
- "Learn More" link pointing to: `https://www.arxys.com/videox-v5-launch-deliver-on-the-promise-of-h-265-today/`

**Placement options (Claude Code should evaluate which fits best with existing layout):**
- As a card in a "Resources" or "Learn More" row below the product listings
- As a banner between the Enterprise Grade box and the product listings
- As a sidebar element if the layout supports it

**Styling:** Should match the portal's existing card/component patterns. Include the H.265 HEVC badge graphic if feasible to recreate in CSS/SVG, or use a simple styled label.

### B6. Price Book — Additional Arxys.com Links

**Page:** Price Book and/or Dashboard

**Change:** Add links to relevant Arxys.com pages. Suggested links to evaluate and include where they fit naturally:

| Link Text | URL | Suggested Placement |
|---|---|---|
| "View all VideoX Appliances" | `https://www.arxys.com/videox-appliances/` | Price Book, near product listings |
| "Contact Sales for Custom Configurations" | `https://www.arxys.com/contact/` | Price Book footer or header area |
| "About Arxys" | `https://www.arxys.com/about/` | Dashboard or portal footer |
| "Support & Resources" | `https://www.arxys.com/support/` | Dashboard or portal footer |

**Implementation notes:**
- Links open in a new tab (`target="_blank"`) since they leave the portal
- Style as subtle text links or small buttons — not banner CTAs. These are secondary navigation, not primary actions
- Don't overdo it. If only 2–3 of these make sense in context, skip the rest

---

## Deferred to Phase 3b or Phase 4

The following items were discussed but intentionally deferred. They require additional planning, schema changes, or strategic work that shouldn't block the Track A/B improvements.

### Calculator — Save Full Input State to Supabase

**What:** Update the submission flow to persist the complete calculator input state (all camera group configs, stream counts, storage days, FPS settings) as a JSON blob in Supabase alongside the existing submission record.

**Why deferred:** No current feature consumes this data. Building the save mechanism before the "Update Calculations" feature that uses it adds schema complexity for no immediate value. However, when this is built, it should be done *before* the Update Calculations feature so historical data exists.

**Supabase impact:** Negligible. A JSON blob per submission is ~2–5 KB. Thousands of submissions would use <1% of the free tier's 500 MB limit.

### Calculator — "Update Calculations" Button (Dream Feature)

**What:** On the Submission History page, each submission row gets an "Update Calculations" button alongside the PDF download. Clicking it loads the saved calculator inputs into a new calculator session. The user can modify any values, resubmit, and a new submission row is created.

**Depends on:** The input state being saved to Supabase (item above).

**Feasibility:** Fully feasible once inputs are persisted. The flow is: deserialize JSON → populate calculator component state → user edits → submit creates new row. No grouping, no appending — just a fresh submission.

### Strategic Planning — Competitive Portal Analysis

**What:** Research what Milestone, Avigilon, Genetec, and other VMS vendors offer their partners through their portals, calculator tools, and enablement platforms. Identify gaps and opportunities for Arxys to deliver more value through the portal.

**Why deferred:** This is a strategic planning exercise, not a code task. Deserves its own focused session.

### Strategic Planning — Additional Partner Tools

**What:** Brainstorm and evaluate additional tools Arxys could add to the portal that help security partners sell more product and do their jobs better. Ideas could include: project scoping wizards, competitive comparison tools, ROI calculators, training/certification tracking, deal registration, etc.

**Why deferred:** Same as above — strategy first, then spec, then build.

---

## Execution Notes for Claude Code

1. **Read the existing codebase first.** Review component patterns, styling conventions, route structure, and Supabase schema before writing any code.
2. **Track A items are all independent.** They can be executed in any order, but the listed order is recommended (dashboard first, then price book, then product pages).
3. **Track B items have some dependencies:** B2 depends on B1 (button must be repositioned before animating the result). B3 and B4 are independent of each other but both depend on knowing the product detail route mapping.
4. **Test across pages.** The footer extraction (A2), white space reduction (A7), and link additions (B6) affect multiple pages — verify consistency.
5. **Image assets** must be copied into the project before starting A5. Verify the images render correctly at the target size before committing.
6. **External links** (B5, B6) should all use `target="_blank"` and `rel="noopener noreferrer"`.
