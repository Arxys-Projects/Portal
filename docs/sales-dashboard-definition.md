# Arxys Portal: internal sales surface definition

Session output, 2026-08-03. Source document for two later prompts (Claude Code, Claude Design).

---

## 0. What Andy's answers changed

**He picks his next project by whoever asked him most recently.** This reframes the queue. That signal lives in Outlook and Pipedrive, and the portal can't see it, so the queue can never be ordered by his real priority. Which means the queue isn't for prioritizing, it's for **retrieval**: he arrives already knowing which project he wants because a partner just emailed him, and he needs to find that row and act on it. Search becomes the primary interaction with the table, sort order stops mattering much, and deal value loses its case for the row entirely.

**He wants to clear dead rows out of his view, not correct the partner's status.** That settles the pill question without touching the partner's tool. Internal-only archive flag, section 3.

**Richard never looks at pipeline numbers today, and Andy does.** That reverses the case against a rollup zone. The numbers aren't there because Richard needs them to do his job; they're there because Andy wants him exposed to them, and the portal is the only surface where that happens. Legitimate, but it has to be constrained or it becomes the clutter Objective 2 targets. Rules in section 2.

**He regenerates quotes often.** This is the most consequential answer. It means the portal to Pipedrive to portal loop runs several times per project, not once. Generate Project Quote living only on the submission detail page is now the biggest single friction point in the product, and moving it inline outranks every other row decision.

**His tab situation is worse than the brief assumed.** Multiple Chrome windows, multiple duplicate tabs of the same thing, and the portal actively makes it worse by opening Pipedrive into whatever window happens to be in front. A named window target is still the right technique, but it will not fully solve this and it needs testing before anyone promises it works. See section 6.

---

## 1. The job of the page, in one sentence

Start new project calculations, and take an existing project from Pipedrive line items to a sendable PDF without leaving the page, with anything expired or broken shown before he has to go looking for it.

**One surface, not two.** A separate grouped-by-objective dashboard does not earn its place. Objective 6 models the page on the partner dashboard, and that dashboard exists because a partner has no other system: they log in occasionally, need orientation, and need help convincing a customer. Richard has Pipedrive and has had it for years. He opens the portal for four things: size a project, request the quote, generate the Project Quote, download the PDF. Steps 1, 2, 5 and 6 of the seven. Everything else in his day is Pipedrive and Outlook.

Objective 6 survives as vertical zoning inside one page rather than as a second page. Action band, conditional attention band, work queue.

This also settles open item 3: "My Pipeline" as a separate internal nav entry goes away. The clearable "projects I created" filter absorbs it.

One narrowing worth naming. Mid-project, Richard should be entering the portal from the Pipedrive deal, using the portal URL the portal already writes back onto it. That's his natural direction of travel. The landing page is therefore the entry point for **new** work and the catch for **stale or broken** work, and it does not need to be his hub for work in progress.

---

## 2. What the page contains

### Band A: action

One control. "Start a new project calculation", pointing at `/calculator`. Large, unambiguous, top of page. Nothing competes with it.

No Quick Calc entry point here. The locked decision says the full calculator, and giving him two sizing doors is the kind of choice that stalls a risk-averse user.

### Band B: attention, conditional

Renders only when it has contents. Two things qualify:

1. **Expired quotes.** Current quote version generated more than 7 days ago, **and** the Pipedrive deal status is open. The open-deal condition is load-bearing: with 96 submissions and 69 in the last 30 days, almost every historic row will be past 7 days forever. Without the filter this band is permanent noise and he learns to ignore it, which destroys the reason it exists.
2. **Projects with no Pipedrive deal link.** These can never produce a quote. Action is Retry Pipedrive link, which already exists.

Each entry is a count, large, clickable, and filters the queue below. Nothing here is decorative.

### Band C: numbers, three maximum

- Open pipeline dollars, read from Pipedrive, display only, with an "as of" timestamp beside it
- Count of open projects
- Count of quotes generated in the last 30 days

The dollar figure is the one number that doesn't filter anything; it's there because Andy wants it in his eyeline. The other two filter the queue. Any number that neither filters nor answers a question Andy explicitly wants Richard to see gets cut.

No charts. No trend lines. No sparklines. No forecasts. Those require interpretation, and he won't do it.

### Band D: the work queue

The reworked pipeline view. Section 3.

**Search is the primary control**, and it's the largest element in this band. Focused on page load, so he can type the moment the page renders. It matches partial strings, case-insensitive, against project name and partner company name, because a partner's email will say "the Riverside job" and that's what he'll type. If the Pipedrive deal title ever diverges from the portal project name, search matches that too.

Secondary controls, as visible chips rather than a dropdown builder: the clearable "projects I created" filter, a portal status filter, and "Show archived" (off by default).

Default sort is most recently updated. It isn't worth optimizing past that, since his real priority signal arrives by email and the portal can't see it.

### Confirmation, everywhere

He doesn't trust that things happened. That's a design requirement, not a personality note. Every state change has to be legible on the row afterward, permanently, and not delivered as a toast that vanishes. Quote version number, generation date and time, and expiry state all live on the row. The PDF generation date prints on the PDF, which is already a standing requirement.

---

## 3. The pipeline row: data contract

Settle this here, write it into both prompts identically.

### Fields the backend produces per row

| Field | Notes |
|---|---|
| `submission_id` | |
| `project_name` | |
| `partner_company_name` | |
| `created_by_user_name`, `created_by_is_internal`, `created_at` | drives the creator filter |
| `portal_status` | open / won / lost |
| `portal_status_editable` | always false for internal users. The pill is read-only to internal, full stop. |
| `internal_archived_at`, `internal_archived_by` | internal-only, never visible to partners, never affects the partner pipeline |
| `pipedrive_deal_id`, `pipedrive_deal_url` | null when unlinked |
| `deal_link_state` | `linked` / `missing` |
| `pipedrive_deal_status` | open / won / lost |
| `pipedrive_status_as_of` | timestamp, rendered to the user |
| `pipedrive_read_ok` | false means render last known value with a stale marker, never blank |
| `pipedrive_deal_value` | list price, display only |
| `deal_line_item_count` | gates the generate action |
| `products_display` | single truncated line |
| `products_source` | `quoted` / `recommended` |
| `current_quote_version` | project-scoped number, null if none |
| `current_quote_generated_at` | |
| `current_quote_expires_at`, `is_expired` | generated_at + 7 days; `is_expired` only true when deal status is open |
| `project_quote_version_count` | how many versions exist across the project |
| `is_superseded` | existing pill |
| `project_key`, `parent_submission_id` | grouping and lineage |
| `available_actions` | computed server side, not inferred in the UI |

### Inline actions

- **Open in Pipedrive.** Every linked row.
- **Primary action, context dependent.** Three states, and the state matters:
  - Deal linked, `deal_line_item_count` is 0: the button reads **Add line items in Pipedrive** and opens Pipedrive. It does not generate.
  - Deal linked, line items present, no quote yet: **Generate Project Quote**.
  - Quote exists: **New Project Quote version**.
- **Download.** Defaults to the Customer Proposal, since that's the one he sends. Project Quote sits behind an expand on the same control.
- **Retry Pipedrive link.** Only on rows where `deal_link_state` is `missing`.
- **Archive.** Internal only. Hides the row from his queue and changes nothing a partner sees. The confirm shows the current Pipedrive deal status, so he isn't archiving a live deal by accident, and it doesn't block him if the deal is open, because he's the one who knows. After archiving, offer "Open in Pipedrive to mark it lost". That nudges the actual fix without the portal writing anything. Reversible in one click from the "Show archived" chip. Nothing is deleted.
- **Open project.** The detail page still exists for version history, lineage, and sizing inputs.

The line-item guard is the single most valuable behavior on the page. Without it, a risk-averse user clicks Generate too early, burns a version number, produces a wrong PDF, and stops trusting the button. That is exactly the failure he already fears.

### What he never has to open a detail page for

Generating a quote, generating a new version, downloading either document, opening the deal, seeing which version is current and whether it's expired.

---

## 4. Ranked, given the density limit

Because the queue is for retrieval and not prioritization, the row carries less than the brief's objectives implied. Two lines, and the split is the whole answer.

**Primary line, large type, non-negotiable:**

1. Project name plus partner company name
2. Quote state: version number, generation date, and expired or current
3. Primary action button (the three-state control above)
4. Open in Pipedrive
5. Download

Five things at large type in a three-zone row (identity left, state centre, actions right) is comfortable rather than tight, which is what Objectives 5 and 7 are asking for.

**Secondary line, quiet, smaller type:**

6. Products, one truncated line, labeled `Quoted` or `Recommended`
7. Portal status pill, read-only
8. Created date
9. Deal value

Items 6 and 7 are locked decisions and stay, and the quiet line is where they fit without competing. Deal value drops to last because it isn't his sorting handle; he works whoever asked him most recently. It stays in the data contract so nobody has to re-plumb it later.

**Cut from the row entirely:** created-by (the "projects I created" chip answers it better and sits right above the table), camera count, storage TB, retention days, bandwidth, version history list, lineage detail, revision count.

---

## 5. Routing and naming

- Internal header link reads **Projects**, route `/projects`. Not "Pipeline", which collides with both Pipedrive's vocabulary and the partner-facing "My Pipeline".
- Internal users land on `/projects` after login.
- Partner header link stays **My Pipeline** at `/pipeline`, unchanged.
- `/admin/partner-pipeline` redirects to `/projects` and comes out of the admin nav.
- Admin nav keeps a link to the partner-facing `/pipeline` so Andy can look at what a partner sees on purpose.
- Andy sees both `Projects` and `Admin` in the header. Richard sees `Projects` and no `Admin`.
- The admin overview stays exactly as it is.

---

## 6. Pipedrive tab behavior: recommendation

**Use a named window target**, `window.open(dealUrl, 'arxysPipedrive')`, on every Pipedrive button in the portal. Repeated clicks then reuse one Pipedrive tab and Chrome focuses it, including when it lives in a different window.

Two caveats that have to be handled honestly rather than promised away:

1. The window name registry is scoped per browsing context. Richard's three independently-opened portal tabs can each hold their own `arxysPipedrive` target, so he could still end up with three Pipedrive tabs. That's a large improvement over one per click and it isn't a complete fix.
2. Pipedrive may send `Cross-Origin-Opener-Policy: same-origin`, which severs the opener relationship and can break name reuse. `rel="noopener"` breaks it too and must not be set on these links.

**Before this goes into the Code prompt as a commitment, test it on Richard's own Windows Chrome with his actual multi-window setup.** Fifteen minutes of empirical checking beats shipping a technique that a response header quietly defeats.

The larger point: he generates and regenerates often, so he crosses between the two apps several times per project. Cutting the number of crossings matters more than tab hygiene. Inline Generate and the line-item guard do more for his tab count than any window target will.

---

## 7. Explicit exclusions

The sales surface does not have:

- Email sending of any kind. Delivery stays a file on the Pipedrive deal plus Outlook.
- Any write to Pipedrive. No line items, no status, no value, no notes.
- Any price math.
- Charts, graphs, trends, sparklines, forecasts, goal tracking.
- Partner roster management, invitations, partner requests, or anything else from the admin overview.
- An activity feed or notification centre.
- A quote approval or review workflow.
- Quick Calc as an entry point on this page.
- Revision chain collapsing or merging.
- Saved views or a filter builder. Visible chips only.
- A mobile layout as any kind of priority. He's on a Windows desktop in Chrome.
- Any attempt to show whether a quote was sent. The portal doesn't send, so it can't know, and a field that guesses is worse than no field.

---

## 8. Deferred, with reasons

**Retroactive version renumbering: don't.** Quotes already sent carry per-submission numbers printed on PDFs in customer inboxes. New versions continue from the highest number already used anywhere in the project, so no number is ever reused and no sent PDF changes meaning. Gaps in the sequence are acceptable; a V1 that becomes V3 in his customer's inbox is not. This satisfies the locked decision without rewriting history.

**Portal status editing: decided, not deferred.** Internal is read-only on the pill, always, including on submissions internal staff created on behalf of a partner. That last part matters because on-behalf-of submissions are internal-created and partner-owned at once, so "partner-created" was never a clean line to draw a permission on. The archive flag covers the actual need.

One consequence to accept rather than fix: the Open Pipeline dollar figure reads Pipedrive, so archiving a portal row doesn't change the number. Excluding archived rows from the total would reintroduce exactly the drift that reading Pipedrive was meant to end. The real fix is closing the deal in Pipedrive, which is why the archive confirm nudges him there.

**Deal owner mapping** stays a nice-to-have with unconfirmed feasibility, as in the brief.

**`adminDeleteSubmission` and the `project_quotes` foreign key.** Still blocked, still no merge action. Not in this scope, and the shelved revision-chain work is where it belongs.

**Pipedrive status cache tuning.** The behavior is decided (cache-first render, visible "as of", background refresh, stale marker on failure, never blank, never a spinner blocking the page). The staleness window in minutes gets set during the Code phase against real read latency for roughly 96 deals.

**Revision chain decluttering** stays shelved, per the locked decisions.

**Concurrency guard migration.** Project-scoped numbering requires moving the unique constraint off `(submission_id, version)` and onto the project key. Flagged for the Code prompt, and it has to happen in the same migration as the numbering change or the race protection disappears in between.
