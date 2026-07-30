# Handoff: Arxys VideoX Data-Driven Datasheet (Phase 2)

## Overview

A two-page datasheet system for Arxys VideoX products, designed to render from the same spec data the
partner portal's Price Book already uses — replacing the hand-built Illustrator sheets that currently
require re-typesetting on every spec change.

Two templates cover the whole in-scope range:

| Template | Products | Pages |
|---|---|---|
| **Video + Management** ("Ledger") | V100–V800 NVRs, V250/V255 management servers | 2 |
| **Workstation** ("Rail") | SW10, SW20 | 1 |

Out of scope for this pass, per the brief: the ACM line (V150 / V260 / V265) and SW30. The ACM models
appear as *names only* in the V250 sheet's model strip for positioning — no ACM-specific fields
(door counts, certified-platform lists) are designed anywhere.

## About the design files

The files in this bundle are **design references created in HTML** — prototypes showing intended
look, structure, and data binding. They are **not production code to copy directly**.

The target implementation is **`@react-pdf/renderer`**, matching the existing Project Quote pipeline
already live in the partner portal. The task is to recreate these layouts as `@react-pdf/renderer`
components driven by the existing spec data, plus an on-screen portal view sharing the same token
system. Do not port the HTML/CSS literally — `@react-pdf/renderer` supports a subset of flexbox and
no CSS grid, so every `display: grid` below must be rebuilt as nested flex rows.

## Fidelity

**High-fidelity.** Final colors, typography, spacing, and content. Every value in this document was
read out of the built design, not estimated. Reproduce measurements exactly.

Two things are deliberately unresolved and marked as such in the design:

1. **Product and rear-panel photography does not exist yet.** Every sheet carries a real, sized,
   positioned image slot. See "The photo slots" below for the decided missing-asset behavior.
2. **The warranty seal graphic** is a held circular slot, not a drawn mark. See "Assets".

## Page geometry

All pages are **US Letter, 816 × 1056 px** (8.5 × 11 in at 96 dpi). Every page in the design measures
exactly 1056 px with zero overflow — verified programmatically across all 7 pages. The pages are
dense; if you change a type size, re-check page fit, because there is no slack.

### Ledger (Video + Management)

```
page          816 × 1056, padding 44px 48px 30px, flex column
              page 1 row gap 14px · page 2 row gap 13px
```

Page 1, top to bottom:

| Block | Height | Notes |
|---|---|---|
| Header row | ~38px | logo left (128px wide), running mark + product class right |
| Rule | 2.5px | `#054A91`, full measure |
| Hero row | ~92px | model numeral + descriptor left, compliance pills right |
| Headline spec strip | ~60px | 4 equal columns, 1px `#DCE1E6` top and bottom |
| Model ladder | ~64px | 7 cells (NVR line), 3px gap |
| Usage / attributes | ~130px | 2 columns, `1.08fr 1fr`, 30px gap |
| **Product photo slot** | **158px** | full measure (720px), bg `#F5F7F9` |
| Warranty band | ~92px | full-bleed-to-margin gold-tinted band |
| Features label | ~11px | |
| Feature grid | flexible | 2 × 2, gap `16px 30px`, `align-content: start` |
| VMS validated row | ~33px | 1px `#DCE1E6` top border |
| Footer | ~33px | 1px `#DCE1E6` top border |

Page 2, top to bottom:

| Block | Height | Notes |
|---|---|---|
| Title row | ~30px | model + "Technical Specifications", 2.5px `#054A91` bottom border |
| Max VSR heading + ceiling | ~8px | heading left, ceiling figures right, baseline aligned |
| VSR table | ~80px | header row + 2 data rows |
| VSR parameter strip | ~38px | wash panel, 2px gold left border, inline label/value run |
| VSR caption | ~34px | |
| Orderable configurations | ~127px | heading + header row + 3 data rows + caption |
| Spec grid | flexible | 2 columns, 26px gap, `align-content: start` |
| Rear I/O + General Info | ~93px | 2 columns, `1.1fr 1fr`, 24px gap, `align-items: start` |
| Footer | ~33px | |

> **Layout warning.** On both pages the *only* flexible child is the feature grid (p1) / spec grid
> (p2), and it sits at its content minimum, so it absorbs nothing. Adding any fixed-height content
> pushes the footer off the page. Budget height explicitly.

### Rail (Workstation)

```
page     816 × 1056, flex ROW (no page padding)
rail     214px fixed · bg #F5F7F9 · border-right 1px #DCE1E6 · padding 44px 22px 30px · gap 18px
content  flex 1 · padding 44px 44px 30px · gap 13px · min-width 0
```

Rail contents, top to bottom: logo (120px) · running mark + model numeral + product class · part
number (own rule above) · rule · key attributes · rule · warranty card · compliance pills · spacer
(`flex: 1`) · address block.

Content column: headline sentence + 2.5px gold rule (56px wide) · usage paragraph · **photo slot
110px, bleeding right** (`margin-right: -44px`) · camera stream matrix + caption · 2-column spec grid
· footer.

## Design tokens

### Color

| Token | Hex | Use | Contrast on white |
|---|---|---|---|
| Navy primary | `#054A91` | all headings, rules, table headers, part numbers, stream counts | 8.6:1 |
| Gold accent | `#FCB23E` | warranty band tint, section marks, attribute bullets, ladder active bar, workstation rule | — |
| Gold dark | `#8A6A1F` | seal label text only | 5.0:1 |
| Gold wash | `#FFF8EC` | warranty band background | — |
| Gold wash border | `#F2DDB6` | warranty band top/bottom rule | — |
| Seal ring | `#E0C795` | 1px dashed held-slot ring | — |
| Ink | `#23272B` | spec values, headline strip values, VMS names | 14.6:1 |
| Body | `#3D444B` | paragraphs, feature copy, fine print | 9.8:1 |
| Muted | `#5F6B76` | spec labels, footers, captions, product class lines | 5.36:1 |
| Brand grey | `#828386` | secondary text **at 10px and above only** | 3.79:1 |
| Caption | `#4A5560` | page-2 table captions | 7.7:1 |
| Hairline | `#DCE1E6` | all borders and rules | — |
| Table rule | `#EDF0F3` | table row dividers | — |
| Spec rule | `#F1F4F6` | spec-row dividers | — |
| Wash | `#F5F7F9` | table header rows, rail background, photo slot background | — |
| Separator | `#B9C2CB` | the "/" in "V250/V255" (display size only) | — |

**Accessibility constraint, enforced in the design:** `#828386` at 3.79:1 fails WCAG AA for text
under 18px. It is used **only at 10px and above**. Everything smaller uses `#5F6B76` (5.36:1). Do not
reintroduce the brand grey into fine print — this was a real defect that was fixed. Every text run in
the built design passes AA except the decorative 56px "/" glyph.

### Type

Two families: **Poppins** (600 only — numerals, feature titles, headline values, VMS names) and
**Montserrat** (400/500/600/700 — everything else). Both from Google Fonts.

| Element | Family | Size / line-height | Weight | Tracking | Color |
|---|---|---|---|---|---|
| Model numeral | Poppins | 56 / 0.92 | 600 | −0.015em | navy |
| Model descriptor | Montserrat | 16 / 1.25 | 600 | 0.06em, uppercase | muted |
| Running mark "VIDEOX V5" | Montserrat | 9.5 / 1 | 700 | 0.24em | navy |
| Product class line | Montserrat | 9 / 1.5 | 500 | — | muted |
| Page-2 title model | Poppins | 19 / 1 | 600 | — | navy |
| Page-2 running head | Montserrat | 12 / 1 | 700 | 0.12em, uppercase | muted |
| Section header | Montserrat | 10.5 / 1 | 700 | 0.15em | navy |
| Rail section header | Montserrat | 9.5 / 1 | 700 | 0.14em | navy |
| Table column header | Montserrat | 8.5 / 1 | 700 | 0.11em | navy |
| Headline strip key | Montserrat | 8 / 1 | 700 | 0.13em | muted |
| Headline strip value | Poppins | 14 / 1 | 600 | — | ink |
| Body paragraph | Montserrat | 10.5 / 1.6 | 400 | — | body |
| Key attribute | Montserrat | 9 / 1.45 | 400 | — | body |
| Feature title | Poppins | 10.5 / 1.3 | 600 | — | navy |
| Feature body | Montserrat | 9.5 / 1.55 | 400 | — | body |
| Spec label | Montserrat | 8.5 / 1.35 (rail 8) | 600 | — | muted |
| Spec value | Montserrat | 9 / 1.5 (rail 8.5 / 1.45) | 400 | — | ink |
| Table cell | Montserrat | 9 / 1–1.3 | 400–600 | — | body / ink |
| Stream count | Poppins | 13 / 1 | 600 | — | navy |
| Fine print | Montserrat | 8 / 1.55 | 400 | — | body |
| Table caption | Montserrat | 8–8.5 / 1.5 | 400 | — | caption |
| Footer | Montserrat | 7.5 / 1.5 | 400 | — | muted |
| Page number | Montserrat | 7.5 / 1 | 600 | 0.14em | muted |

Spec values land at ~6.8pt and footers at ~5.6pt. That is deliberate and matches the density of the
existing Illustrator sheets, but it is the tightest part of the design — see "Known constraints".

### Spacing

Page padding `44 / 48 / 30`. Column gaps 13–14px on page bodies, 24–30px between grid columns.
Table cell padding `6–7px 12–13px`. Spec row padding `5px 0` (rail `3px 0`). No border radius
anywhere except the `3px` on the review badges, which are canvas chrome and not part of the sheet.

## Components

### Model ladder

Horizontal strip of equal cells showing where the current SKU sits in its line. **Two separate
ladders — do not merge them:**

- **NVR ladder** (7 cells): V100, V200, V400, V500, V600, V700, V800. Cell shows name, `{bays} bay · {U}U`, max camera streams.
  V250 is excluded — it is a management server, not an NVR. V900 is excluded — end of life.
- **Management / ACM ladder** (5 cells): V150, V250, V255, V260, V265. Cell shows name, role, capacity.
  V150/V260/V265 currently show "Access control / ACM" because no capacity data was supplied.

Cell: 1px `#DCE1E6` border, white background, padding `6px 4px 7px`, centered. Active cell gets a
**3px `#FCB23E` bar across its top edge** — that is the only differentiator, no background change.

### Headline spec strip

4 equal columns, 1px hairline above and below, `11px 0` padding. Key over value, 5px gap. Labels are
per-template: NVRs use Throughput / Max Storage / Drive Bays / Max Camera Streams; the management
sheet swaps Max Storage → Cameras Managed and Max Camera Streams → Form Factor.

### Max Video Stream Rate (VSR) table

**Terminology is load-bearing: these are camera _streams_, not cameras.** A multisensor or
multi-head device presents several streams to the VMS. Never label this column "Cameras".

Columns: `1.15fr .7fr .95fr 1.2fr` — Resolution, Codec, Camera Streams, vs. 4MP Baseline.
Two rows only, **H.265 exclusively** — do not split H.264 and H.265:

- 4MP · 2560×1440 (16:9) — the baseline VSR
- 8MP · 3840×2160 — **45% fewer streams**, because it carries double the pixels per frame

`8MP streams = round(baseline × 0.55)`.

Directly beneath, the **VSR parameter strip** — wash panel with a 2px gold left border, holding the
standardized parameters the number is validated against, as an inline label/value run:

> 4MP · 2560×1440 · 15 fps · H.265-20 (Good) ~3.2 Mbit/s · record on motion with VMD + metadata ·
> 75% average motion activity per day · 30 days retention

This strip is what makes the stream count defensible to an integrator. It is not decoration — keep
it adjacent to the table and never drop it.

### Orderable configurations table

The piece that resolves "three SKUs per NVR". Columns `1.05fr 1.6fr .75fr .95fr` — Part Number,
Drive Configuration, Raw, Usable.

**RAID level is a template variable, not a constant** — this was caught by testing the template
against V400 and is the single most important gotcha in this handoff:

| Model | RAID | Bays | Usable / raw | Part numbers |
|---|---|---|---|---|
| V800 | RAID 60 | 36 | 83.3% | `VX5-V800-576 / -720 / -864` → 480 / 600 / 720 TB usable |
| V400 | RAID 6 | 8 | 75% | `VX5-V400-128 / -160 / -192` → 96 / 120 / 144 TB usable |

Part number convention: `VX5-{MODEL}-{RAW_TB}`. Drive capacities are 16 / 20 / 24 TB — same chassis,
same performance, different retention. The column header and caption must both interpolate the RAID
level.

Management servers use a different shape: Part Number, Model, Configuration, Cameras Managed —
`VX5-V250-MGM` (base CPU & RAM, 2× 480GB SSDs, up to 250 cameras) and `VX5-V255-MGM` (upgraded CPU &
RAM, 2× 960GB SSDs, 250 and above).

### Warranty band

Full-measure band, `#FFF8EC` background, 1px `#F2DDB6` top and bottom, `13px 16px` padding, 16px gap.
Seal slot left, then title + body. Sits directly under the product photo on page 1.

Servers are 5-year; **workstations are 3-year** (optional 5-year upgrade must be purchased with the
unit). On the Rail template there is no full-width band, so the warranty becomes a bordered card
inside the rail with the seal centered above the title.

### Compliance pills

1px `#DCE1E6` border, `6px 9px` padding, navy 7.5px/700 at 0.1em. **`white-space: nowrap` and no
flex shrink** — without this they break mid-string ("CE / UKCA" splitting across two lines) whenever
the model descriptor claims more of the hero row. Servers: NDAA, CE / UKCA, FCC / UL / RCM.
Workstations: NDAA, CE / FCC, ENERGY STAR.

### VMS validated row

1px hairline above, `11px 0` padding. "VALIDATED / WITH" label (700, 7.5px, 0.16em, navy, two lines)
then the platform names in **Poppins 600 at 14px, ink**, 22px gap: Milestone, Genetec, Avigilon,
Hanwha WAVE, NX Witness, Exacq. These are set large on purpose — VMS compatibility is the first
qualifying question an integrator asks. **Replace the wordmarks with real logo art when available**;
keep the row height and the label treatment.

### Spec grid

2 columns. Left "Hardware Information", right "Regulatory & Environmental" (workstation: "Hardware" /
"Performance & Environmental"). Each column: navy section header with a 1px navy bottom border, then
rows of `82px 1fr` (rail `66px 1fr`) label/value with a 1px `#F1F4F6` divider.

**Balance the two columns by row count**, not semantics — an unbalanced grid was the cause of a page
overflow. The workstation sheet moves Bandwidth and Monitors into the right column purely for
balance.

## The photo slots

Rear-panel photography does not exist for any product. The brief made the missing-asset behavior a
required decision. **Decided: held blank space with a hairline frame.** Not a fallback port list, not
an omitted section, not line art.

| Slot | Size | Placeholder |
|---|---|---|
| Product photo, servers | 720 × 158 | "{MODEL} front 3/4 — product photography" |
| Product photo, workstation | 513 × 110, bleeds right | "SW10 tower — product photography" |
| Rear I/O panel | ~370 × 84 | "Rear I/O photography — slot held" |

The rear slot keeps its space whether or not a photo exists — the layout never reflows around a
missing asset, which is what makes the same template safe to render for every SKU. In the prototype
these are `<image-slot>` web components (drag-and-drop, persisted); in production they are plain
sized frames with a 1px `#DCE1E6` border that render the photo when the spec record has one and stay
empty when it doesn't.

**The rear slot is currently 84px tall, which is shallower than a 4U rear panel deserves** (a 4U
chassis is roughly 2.5:1; the slot is ~4.4:1). This is the clearest symptom of the two-page
constraint — see below.

## Assets

| Asset | Status |
|---|---|
| `assets/arxys-logo.png` | Real. Gold/grey "ARXYS ✕ APPLIANCES" wordmark, 190 × 47 native, rendered at 128px (rail 120px). Brand colors were sampled from its pixels: gold `#FCB23E`, grey `#828386`. |
| 5-year warranty seal | **Held slot, 72px circle.** The real graphic is `5-year-warranty-circle` on the VideoX product page, but it is an **AVIF, which does not survive PDF or PNG export** — it must be converted to PNG and stored locally, not hot-linked. |
| 3-year warranty seal | **Held slot, 62px circle.** No matching 3-year graphic is known to exist; one needs producing for the workstation sheets. |
| Product / rear-panel photography | Does not exist. Slots held as described above. |

Held slots render as a 1px dashed `#E0C795` circle with a `#8A6A1F` micro-label ("5 YR SEAL").

## Known constraints — read before building

1. **Two pages is over-subscribed for the server sheets.** Page 2 carries the VSR table, the
   parameter strip, the orderable-configurations table, a full spec grid, and the rear-panel slot.
   Every legibility improvement so far has been paid for by shrinking a photo slot. The
   recommendation carried through this design pass, still open, is **a third page for the server
   template** — specs and rear-panel photography move there, page 2 keeps the VSR and ordering
   tables. Workstations stay single-page. If a third page is acceptable, raise spec values to ~8pt
   and restore the photo slots first.
2. **The usage paragraph and key attributes sit side by side**, so the page only gains height when
   the *taller* column shrinks. Trimming attribute bullets on a sheet whose paragraph is the tall
   column buys nothing.
3. **Data gaps.** The V800 per-resolution stream counts are illustrative — only the 325-stream /
   4,000 Mbit/s ceiling is published, so the rows need real Price Book figures. The SW10 usage
   paragraph was composed for this design because the existing workstation sheet has none. V150 /
   V260 / V265 have no capacity data.
4. **The workstation stream matrix still shows both codecs**, because that is what the real SW10
   sheet publishes. Whether it should collapse to the single-H.265 VSR shape used on the servers is
   an open question.

## Template variables

Everything below flows from data. **Only three SKU-specific literals exist in the entire two-page
template** — verified by auditing the markup:

1. the model descriptor line (`36 Bay · 4U Rack · V5 Video Server`)
2. the page-2 ceiling line (`4,000 Mbit/s · 864 TB raw · 720 TB usable`)
3. the RAID level in the orderable-configurations header and caption

Data-bound: headline strip, key attributes, model ladder (+ which cell is active), feature blocks,
VSR rows, VSR parameters, SKU rows, hardware rows, environmental rows, compliance badges, VMS list.

## Verification performed

Do not assume these still hold after changes — re-run them.

- All 7 pages measure `scrollHeight === clientHeight === 1056` at 816px wide, no overflow, no clipped footers.
- Contrast sweep of every text run: all pass WCAG AA except the decorative 56px "/" glyph.
- **V400 test pass**: the V800 template was duplicated with only data swapped, then checked against
  the real V400 factsheet on 16 points — descriptor, throughput, max storage, drive bays, stream
  ceiling, ladder active cell, usage copy, RAID 6 header, all three part numbers, all three usable
  capacities, page-2 ceiling line, CPU model, both VSR rows, and absence of stray V800 references.
  All 16 passed. This test is what surfaced the RAID-level variable.
- No console errors.

## Files

| File | What it is |
|---|---|
| `Arxys Datasheet.dc.html` | The design. 7 pages: V800 (2), V400 test (2), V250/V255 (2), SW10 (1). Open in a browser. |
| `Arxys Datasheet Wireframes.dc.html` | The three structural directions explored before picking Ledger + Rail. Reference only — Ledger won for servers, Rail for workstations. |
| `support.js`, `image-slot.js` | Runtime for the prototypes. Not part of the design. |
| `assets/arxys-logo.png` | Real logo asset. |
| `screenshots/` | 2× PNG of all 7 pages. |
| `datasheet-phase2-design-brief.md` | The original brief. |

> The two HTML files were split apart because a single document holding all 16 pages blocked the
> browser's main thread and stopped painting. Worth knowing if you consider rendering many SKUs into
> one preview page in the portal.

Source material this was built from — the current Illustrator sheets and the Project Quote whose
house style the datasheet matches — are the V800 / V400 / V250 / SW10 factsheet PDFs and the
`Arxys Quote — WCJ Adult Detention Center` PDF supplied with the brief.
