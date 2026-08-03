# Claude Code prompt — build `/projects`, the internal sales surface

Reference screenshots in this folder. Build to these, not to your own judgement of what a projects list should look like.

| File | What it shows |
|---|---|
| `4a-projects-page.png` | The whole page at 1440, every row state |
| `4b-by-partner.png` | The By partner view of the same queue |
| `4c-search-active.png` | Search active, results filtered |
| `4d-dialogs-empty-states.png` | Generate confirm, archive confirm, both empty states |
| `4e-type-scale.png` | Type scale as steps off the ADR 0067 scale |
| `2c-header-internal-bar.png` | Header: partner menu untouched, internal strip below |

Design source of truth is `Projects Page Directions.dc.html` in this project, block `4a`–`4e`. Where this document and a screenshot disagree, the screenshot wins.

---

## Non-negotiables

- **Extend the existing portal design system.** Same color tokens, same radii, same spacing rhythm, same component vocabulary as every other page. No new color tokens. No new font families. What changes here is the type scale (up one to two steps, see `4e`) and the density (down).
- **Desktop only.** Design target 1440, must hold at 1280. No mobile layout.
- **One internal user.** He is capable but risk averse and wants proof a thing happened. No tooltips explaining basics, no coaching copy, no wizards, no progress encouragement, no reassurance adjectives. Every element states a fact or offers a specific action.
- **No toasts for state.** If something happened, the row says so afterwards, permanently, with a timestamp.
- **Out of scope, do not build:** email sending, any write to Pipedrive, price math, charts of any kind, partner roster management, activity feed, notification centre, quote approval workflow, Quick Calc entry, revision-chain collapsing, saved views, filter builder, any "sent" indicator.

---

## Route and navigation

Route `/projects`. Two audiences, one header.

**Partner users:** header is exactly what ships today — Dashboard, Calculator, Pipeline, Compare, Products & Prices, Support, Portal guide, avatar, Sign out. No internal strip, no Sales link, nothing new.

**Internal users:** same header, plus a navy internal strip immediately below it (`2c-header-internal-bar.png`):

- Label `INTERNAL` in small caps, 13/700, 0.11em tracking, muted blue on navy.
- `SALES` at 19/800, caps, 0.05em tracking, white, amber underline when the active section. Deliberately larger and heavier than partner menu items so it reads as a different class of thing.
- Siblings: `Partners`, `Requests` with an amber count badge, `Specs & Datasheets`.

Nothing partner-facing moves or changes. The internal strip renders only for `created_by_is_internal` users.

---

## Page structure — four bands

### Band A: start
One control, dominant, nothing competes with it: a white card in the command band, `START HERE` label, "Start a new project calculation", button "Open calculator →" pointing at `/calculator`.

### Band B: attention, conditional
Full-width bar under the command band. Renders **only when it has contents** — when empty it is absent, not an empty state. Two entry types, each a whole-row clickable target that filters the queue:

- Expired quotes: current Project Proposal generated more than 7 days ago on a deal still open in Pipedrive. Copy: `4 quotes expired on deals still open` + filled button `Show these 4 →`.
- Projects with no Pipedrive deal link: `2 no Pipedrive deal — cannot be quoted` + filled button `Show these 2 →`. Action on those rows is Retry Pipedrive link.

Amber for expiry, red for unlinked. Factual, not alarming.

### Band C: numbers, exactly three, inside the command band
- **Open pipeline dollars** — read from Pipedrive, display only. Flat text on the navy band, no border, no card, no hover: it must not look clickable. Beneath it: `Read today at 9:42 AM` and a `↻ Refresh` control that re-reads Pipedrive and updates the timestamp.
- **Open projects** — a white tile, whole tile clickable, filters the queue. `Show in queue →`.
- **Quotes · 30 days** — same treatment.

The clickable / non-clickable distinction must be visible without hovering: clickable = white surface, border, 2px bottom shadow lip, cursor pointer, hover lightening, an explicit `Show in queue →` label. Non-clickable = flat type on navy.

No charts, sparklines, trends, goals or forecasts anywhere.

### Band D: the queue
- **Search is the primary control and the widest element.** 68px tall, 22/500 type, autofocused on page load, `/` refocuses it. Placeholder: `Search a project or partner — "Riverside"`. Matches project name and partner company name; matched substrings are highlighted amber in results. Right side of the field shows `3 of 00 projects` and a `Clear ✕` when a query is active.
- **View toggle** beside search: `Recent` | `By partner`. Same list, same filters, same search — two groupings. There is **one** search box on this page; the old Partner Pipeline page becomes the By partner view (`4b`), it does not get its own search or its own row vocabulary.
- **Filter chips**, not a dropdown builder: `Projects I created` (clearable, default on), `Open`, `Won`, `Lost`, `Show archived` (dashed border, off by default). All filters, the query and the view live in the URL query string (`/projects?q=riverside&mine=1&status=open&view=partner`) so his several Chrome windows each keep their own state.
- Default sort: most recently updated. Sort UI is low priority.
- Keyboard: `↑ ↓` move the row focus ring, `Enter` opens the project, `/` focuses search. Show the hint line beside the "Show 00 more projects" control.

---

## The row

Two lines, fixed. Three zones on the primary line, in a **fixed-width layout** so the primary action never moves horizontally between rows:

| Zone | Width | Contents |
|---|---|---|
| Identity | `flex:1; min-width:0` | project name 24/700, partner company name 17/400 |
| State | 230px | status dot + quote state 19/700 + qualifier 16/400 |
| Actions | 620px, right-aligned, `flex:none` | three slots, always in this order |

Secondary line, quiet, above a 1px divider: products source label + truncated products line, then the fact trays, then created date and deal value (17/700, tabular numerals).

**Never on the row:** created-by, camera count, storage TB, retention days, bandwidth, version history, lineage detail, revision count.

### The three action slots — always present, always in the same order

1. **Task.** The primary action. Three states, each visually distinct:
   - `deal_line_item_count === 0` → outlined navy button `Add line items ↗`, opens Pipedrive, does **not** generate. This guard is the point: generating early burns a version number and produces a wrong PDF.
   - Line items present, no quote → filled navy `Generate Project Proposal`.
   - Quote exists → filled navy `New Project Proposal v4`, naming the version it will create.
   - Unlinked deal → filled navy `Retry Pipedrive link`. Archived row → outlined `Restore to my queue`.
   - On a row where a proposal was just generated, slot 1 *is* the download: filled navy split-button `Download Proposal v4 ⌄`.
2. **Download.** One split-button — label `Download`, joined chevron half opens a menu listing `Project Proposal v3 (PDF)` (the quote he sends to the customer) and `Calculator submission (PDF)` (sizing inputs and recommendation, internal). The menu opens **inside** the row card, right-aligned under its trigger; the card grows. On `Recommended` rows there is no proposal yet, so the slot is a single button `Submission ⤓`.
3. **Pipedrive.** Navy `P` mark + `Pipedrive ↗`, opens `pipedrive_deal_url`. On an unlinked row it is present but disabled and reads `No deal to open` — the slot never disappears, because a slot that moves costs more than a slot that repeats.

Also available per row: **Archive** (internal only, in a `···` menu or row overflow) and **Open project** (clicking the row / Enter → detail page with version history, lineage, sizing inputs).

Every action label names the specific thing that will happen, including the version number.

### Row states to implement, all visible in `4a`

| State | Treatment |
|---|---|
| Proposal just generated | green top strip inside the card: `✓ Project Proposal v4 generated today at 9:47 AM by you · Ready to download and send`. Persistent, never a toast. Slot 1 becomes Download Proposal v4. |
| Quote current, inside 7 days | green dot, `Quote v3 · current`, `Generated 00 Mon · expires in 5 days` |
| Quote expired, deal open | 2px amber card border, amber dot, `Quote v1 · expired 5 days ago` |
| Line items changed since the quote | amber top strip: `Pipedrive line items changed 00 Mon, after Quote v2 was generated · v2 no longer matches the deal`; state reads `Quote v2 · out of date` |
| Deal linked, zero line items | grey dot, `No quote yet` / `Deal has 0 line items`, slot 1 = Add line items ↗ |
| No Pipedrive deal link | 2px red card border, red dot, `No Pipedrive deal linked` / `No quote can be generated`, value cell reads `Value unavailable`, Pipedrive slot disabled |
| Superseded and/or Pipedrive read failed | dashed grey chips in a separate tray: `Superseded by a newer submission`, `Pipedrive unreachable · read 00 Mon`. Never blank a value — render last known with the marker. |
| Archived (only when the chip is on) | dashed border, desaturated type, grey strip: `Archived today at 9:51 AM by you · nothing was deleted` + `Undo` button on the row |
| Keyboard focused | 3px navy focus ring on the card |

### Quoted vs Recommended — must never read the same

- `Quoted` = the frozen `project_quotes` snapshot for that submission. Solid blue chip, navy text, solid border, products line in normal body colour.
- `Recommended` = calculator output before any quote exists. Dashed outline chip, grey text, products line in **italic grey** prefixed `Calculator output, not yet quoted`.

Label plus visual difference, never label alone. Confusing them puts a wrong product list in front of a customer.

### Truncation and numbers

- Products line truncates to one line and **counts what it hid**: `0 × Model · 0 × Model +3 more`. Never a bare ellipsis.
- Money: no cents anywhere. `$6,545,821`, tabular numerals, right-aligned in the value cell.
- Two separate fact trays on the secondary line, divided by a 1px rule: data facts (Superseded, Pipedrive unreachable) then deal facts (`Deal open` pill, created date, value).
- Timestamp format: `Read today at 9:42 AM` for today, `Read 00 Mon at 9:42 AM` otherwise. Relative ages elsewhere (`2 days old`, `expires in 5 days`, `expired 5 days ago`).

---

## By partner view (`4b`)

Same queue, grouped by partner company. Group header: company name 20/700, `0 projects · 0 contacts`, warning pills where relevant (`1 quote expired`, `1 project has no deal link`), then right-aligned `OPEN PIPELINE` and `WON` totals and an expand control. Expanded groups list project rows on a tinted surface using the **same three action slots** at a slightly smaller scale (16px buttons). `Export XLSX` sits with the filter row. Footnote: `Pre-CRM partner activity — not synced with Pipedrive stage. Open pipeline is the straight sum of open-deal list prices (ADR 0081).`

---

## Dialogs (`4d`)

### Generate confirm — the trust loop
Title `Generate Project Proposal v4`. Subtitle: project · partner · `Pipedrive deal #0000`. Then the exact line items the PDF will contain, read live: label `Line items read from Pipedrive at 9:47 AM`, a table of item / qty / list price, and a bold `Total on the PDF` row. Body: `v4 becomes the current Project Proposal for this project. v3 stays downloadable and is marked superseded. Nothing is sent to anyone.` Buttons: `Generate Project Proposal V4` (filled), `Cancel`, and `Check the deal in Pipedrive ↗` right-aligned.

### Archive confirm
Title `Archive "<project name>"?`. A facts panel: `Pipedrive deal status — Open · read today 9:42 AM` and `Current quote — v3 · generated 00 Mon`. Body: `Archiving hides it from your queue. Quotes, versions and the Pipedrive link stay exactly as they are, partners see no change, and Undo sits on the row afterwards.` Buttons: `Archive project`, `Keep in queue`, `Mark it lost in Pipedrive ↗`. Does not block archiving an open deal. Reversible in one click. Nothing is deleted.

### Empty states
- **Search found nothing:** `No project matches "riverzide"`, body naming what search covers plus the closest match, buttons `Search "Riverside" instead` and `Include archived`.
- **No projects at all:** `Nothing here yet` / `Projects appear here once a calculation is saved. Start one and it lands at the top of this list.` + `Start a new project calculation →`.
- Band B has no empty state — it disappears.
- When a query matches archived projects that are hidden: an inline strip below the results, `1 archived project also matches "Riverside"` + `Show archived matches`.

---

## Data contract

Render exactly these fields and nothing more.

```
submission_id
project_name
partner_company_name
created_by_user_name, created_by_is_internal, created_at   // created_by drives the filter chip, not a column
portal_status                       // open / won / lost
portal_status_editable              // always false for internal users; the pill is read-only here
internal_archived_at, internal_archived_by                 // internal only, never visible to partners
pipedrive_deal_id, pipedrive_deal_url                      // null when unlinked
deal_link_state                     // linked / missing
pipedrive_deal_status               // open / won / lost
pipedrive_status_as_of              // rendered to the user
pipedrive_read_ok                   // false => render last known value with a stale marker, never blank
pipedrive_deal_value                // list price, display only
deal_line_item_count                // gates the primary action
products_display                    // single truncated line
products_source                     // quoted / recommended
current_quote_version               // project-scoped, null if none
current_quote_generated_at
current_quote_expires_at, is_expired                       // generated_at + 7 days; true only when the deal is open
project_quote_version_count
is_superseded
project_key, parent_submission_id
available_actions                   // computed server side
```

Line-item drift detection needs one addition: a timestamp of the deal's last line-item change, compared against `current_quote_generated_at`, plus a count of differing lines for the row strip.

---

## Type scale (`4e`) — steps off the ADR 0067 scale

| Element | Portal today | This page | Step |
|---|---|---|---|
| Row: project name | 17 / 600 | 24 / 700 | +2 |
| Row: quote state | 15 / 600 | 19 / 700 | +2 |
| Row: primary action label | 15 / 600 | 17 / 700 | +1 |
| Row: secondary line | 14 / 400 | 16 / 400 | +1 |
| Search input | 15 / 400 | 22 / 500 | +3 |
| Band C numbers | 28 / 700 | 34–44 / 700 | +1 / +2 |
| Small caps labels | 11 / 700 | 13 / 700 | +1 |
| Nav: SALES | 15 / 600 | 19 / 800 | +2 |

Nothing below 15px anywhere on this page. Primary action targets are 48px+ tall.

---

## Acceptance checks

1. At 1440 and 1280, the primary action button starts at the same x on every row; nothing clips or wraps.
2. Band B is absent, not empty, when there is nothing to show.
3. Open pipeline cannot be clicked and does not change on hover; the two counts are clickable across their whole tile.
4. Generating a proposal leaves a permanent timestamped line on the row after a reload.
5. Zero line items makes generation impossible from this page.
6. A `Recommended` row and a `Quoted` row are distinguishable with the labels covered.
7. Archiving is reversible from the row, and nothing a partner sees changes.
8. Reload restores query, chips and view from the URL.
9. Pipedrive read failure shows last known values plus the stale marker, never blanks or zeros.
