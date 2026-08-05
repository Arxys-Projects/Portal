# Claude Design prompt: Arxys Portal internal sales surface

Paste this into Claude Design. Companion prompt for Claude Code covers schema, queries, and behavior. Do not design schema or behavior here.

---

## Product context

The Arxys Partner Portal runs at portal.arxys.com on Next.js, Supabase and Vercel. Arxys manufactures purpose-built video surveillance appliances (VideoX NVR appliances V100 to V800, AnalyticX AI appliances, SW workstations) and sells direct to security integrators. Pipedrive is the CRM and the quoting engine. The portal handles sizing and document generation and does no price math.

The portal has an existing design system, complete across all pages as of ADR 0067. **Extend that system. Do not replace it.** Same color tokens, same radii, same spacing rhythm, same component vocabulary. What changes on this page is the type scale, bumped one to two steps, and the density, which comes down. No new color tokens. No new type families. Nothing that makes this page look like a different product, because the user crosses between this page and `/calculator` several times per project and a visible seam in that loop will make him think he ended up somewhere he shouldn't be.

## Who this is for

One internal sales person. Smart, semi computer savvy, not a beginner. He has lived in Pipedrive for years and uses Outlook because he knows it. He does not trust that emails actually send. He is risk averse, afraid of being wrong, and wants confirmation that a thing happened. He wants to make deals and treats everything else as friction.

**The register: don't dumb it down, strong it up.** His problem is insecurity, not capability. Condescending UI makes it worse. Confidence comes from certainty, so every element on this page either states a fact or offers a specific action, and nothing is vague. That means:

- No tooltips explaining basic concepts, no wizard hand-holding, no coaching copy, no tips panel, no progress encouragement.
- Buttons name the specific thing that will happen. "Generate Project Quote V4" beats "Generate".
- State is always legible and never delivered as a toast that vanishes. If something happened, the row says so afterward, permanently, with a timestamp.
- Confirmations show the one fact he needs in order to decide, then get out of the way.
- No reassurance copy. Facts reassure; adjectives don't.

## Objectives 5 and 7, verbatim from the brief

> 5. Bigger fonts and a clearer UI so an older user can see what to do, where, and how. Show rather than tell. More idiot proof.

> 7. Clean, clear, Roku-like UI and UX may be the right register.

Read "more idiot proof" as "impossible to get wrong," not "simplified." The guard behaviors in the row spec are how that objective gets met.

Desktop only as a priority. He is on Windows in Chrome, multiple windows open. Design at 1440 and check 1280. No mobile layout.

---

## The job of the page, in one sentence

Start new project calculations, and take an existing project from Pipedrive line items to a sendable PDF without leaving the page, with anything expired or broken shown before he has to go looking for it.

**Design consequence:** the table is for retrieval, not for browsing or prioritizing. He arrives already knowing which project he wants, because a partner emailed him about it. Search is how he gets there.

Route is `/projects`. Header link reads **Projects**.

---

## Page structure: four bands, top to bottom

### Band A: start

One control: **Start a new project calculation**, pointing at `/calculator`. Large, dominant, unmistakable. Nothing on the page competes with it visually. This is the only element in the band.

### Band B: attention, conditional

Renders only when it has contents. When empty it is absent, not an empty state. Two kinds of entry:

- **Expired quotes.** Current quote generated more than 7 days ago on a deal that is still open in Pipedrive.
- **Projects with no Pipedrive deal link.** These can never produce a quote. Action is Retry Pipedrive link.

Each is a large clickable count that filters the table below. This band should read as urgent and factual, not alarming. It is the reason a risk-averse user should open this page at all.

### Band C: numbers, exactly three

- **Open pipeline dollars.** Read from Pipedrive, display only, with an "as of" timestamp beside it. This one is not clickable and must not look clickable.
- **Open projects count.** Clickable, filters the table.
- **Quotes generated, last 30 days.** Clickable, filters the table.

The clickable and non-clickable distinction has to be visible without hovering. No charts, no trend lines, no sparklines, no goal tracking, no forecasts.

### Band D: the queue

**Search is the primary control and the largest element in this band.** Focused on page load so he can type immediately. Placeholder should say what it matches, in his language: partner emails say "the Riverside job," so he types "Riverside."

Secondary controls as visible chips, not a dropdown builder: "Projects I created" (clearable), portal status, and "Show archived" (off by default).

Default sort is most recently updated. Sort controls are low priority; his real priority signal arrives by email and the portal cannot see it.

Then the rows.

---

## The row

**Two lines. This split is the density answer, and it is fixed.**

**Primary line, large type, three zones:**

- **Identity, left:** project name, partner company name
- **State, centre:** quote state (version number, generation date, and whether it is current or expired)
- **Actions, right:** primary action button, Open in Pipedrive, Download

**Secondary line, quiet, smaller type:** products (one truncated line, labeled `Quoted` or `Recommended`), portal status pill (read-only), created date, deal value.

**Not on the row at all:** created-by, camera count, storage TB, retention days, bandwidth, version history, lineage detail, revision count. Do not add fields. The backend produces exactly the contract below and nothing more.

### Data contract

| Field | Notes |
|---|---|
| `submission_id` | |
| `project_name` | |
| `partner_company_name` | |
| `created_by_user_name`, `created_by_is_internal`, `created_at` | created_by drives the filter chip, not a column |
| `portal_status` | open / won / lost |
| `portal_status_editable` | always false for internal users. The pill is read-only here. |
| `internal_archived_at`, `internal_archived_by` | internal only, never visible to partners |
| `pipedrive_deal_id`, `pipedrive_deal_url` | null when unlinked |
| `deal_link_state` | `linked` / `missing` |
| `pipedrive_deal_status` | open / won / lost |
| `pipedrive_status_as_of` | timestamp, rendered to the user |
| `pipedrive_read_ok` | false means render last known value with a stale marker, never blank |
| `pipedrive_deal_value` | list price, display only |
| `deal_line_item_count` | gates the primary action |
| `products_display` | single truncated line |
| `products_source` | `quoted` / `recommended` |
| `current_quote_version` | project-scoped number, null if none |
| `current_quote_generated_at` | |
| `current_quote_expires_at`, `is_expired` | generated_at + 7 days; true only when the deal is open |
| `project_quote_version_count` | versions across the project |
| `is_superseded` | existing pill |
| `project_key`, `parent_submission_id` | grouping and lineage |
| `available_actions` | computed server side |

### The primary action button: three states

This is the most important control on the page and each state needs its own visible treatment.

1. `deal_line_item_count` is 0: button reads **Add line items in Pipedrive** and opens Pipedrive. It does not generate. This guard exists because if he clicks Generate too early he burns a version number and produces a wrong PDF, which is exactly the failure he already fears.
2. Line items present, no quote yet: **Generate Project Quote**.
3. Quote exists: **New Project Quote version**, naming the version it will create.

### Other row actions

- **Open in Pipedrive.** Every linked row.
- **Download.** Defaults to the Customer Proposal, since that's the document he sends. Project Quote sits behind an expand on the same control, not as a second equal button.
- **Retry Pipedrive link.** Only when `deal_link_state` is `missing`.
- **Archive.** Internal only. Hides the row from his queue and changes nothing a partner sees. The confirm dialog shows the current Pipedrive deal status so he isn't archiving a live deal by accident, and it does not block him if the deal is open. After archiving, offer "Open in Pipedrive to mark it lost." Reversible in one click. Nothing is deleted, and the copy should make that obvious.
- **Open project.** Detail page for version history, lineage, sizing inputs.

### Row states to design explicitly

- No Pipedrive deal link
- Deal linked, zero line items
- Deal linked, no quote yet
- Quote current, inside 7 days
- Quote expired, deal still open
- Superseded
- Archived, visible only when the chip is on
- Pipedrive read failed, showing last known value with a stale marker

**`Quoted` and `Recommended` must never read the same.** Quoted means the frozen `project_quotes` snapshot for that submission. Recommended means the calculator's output before any quote exists. Two different kinds of truth, and confusing them would put a wrong product list in front of a customer. Solve this with a label plus a visual distinction, not a label alone.

---

## Copy to write

Button labels for all three primary-action states. Chip labels. Band B headings. The "as of" timestamp format. The stale-data marker. The archive confirm. Empty states for: search returning nothing, and no projects at all. Band B has no empty state because it disappears.

---

## Explicit exclusions

Do not design: email sending of any kind, any write to Pipedrive, price math, charts or graphs of any type, partner roster or invitation management, an activity feed, a notification centre, a quote approval workflow, a Quick Calc entry point, revision chain collapsing, saved views, a filter builder, a mobile layout, or any indication of whether a quote was sent (the portal doesn't send, so it can't know, and a field that guesses is worse than no field).

## Deliverables

1. `/projects` at 1440, all four bands, populated
2. The row in every state listed above
3. The search-active state with results filtered
4. The archive confirm dialog
5. Both empty states
6. The type scale you used, expressed as steps off the existing ADR 0067 scale
