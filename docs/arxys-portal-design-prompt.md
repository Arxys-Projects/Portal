# Claude Design — Arxys Partner Portal, unified UI/UX pass

*Paste this into a Claude Design session. Attach the items listed under "Attach when you run this" before starting. Design owns layout, information architecture, component consistency, and responsive behavior. It does not write persuasive copy, change data or logic, or design generated PDFs. Those are handled separately in Claude Code.*

---

## Who uses this portal

Two operators share it. Security integrators (partners), and Arxys internal sales running calculations on partners' behalf. There is no end-user buyer in the product; the integrator carries output into their own customer meeting. Partners use it and like it, so this is refinement, not rescue.

Three integrator types to design for:
- **Box Mover** — thin hardware margin, profit in labor. Wants speed and simplicity, reads dense specs as noise.
- **Technical Differentiator** — in-house engineering, wants verifiable side-by-side data, fact-checks everything.
- **Relationship Builder** — hardware anchors a multi-year account, wants durability and predictability.

---

## Method (in this order)

1. **Wireframes first.** Low-fidelity layouts for every changed surface below, for review before any full-fidelity work. This is to catch structure problems cheaply.
2. **Full screens** after wireframe sign-off, using the existing design system.
3. **Consistency pass** across all pages once the changed surfaces are settled.

---

## Design system to adopt (do not invent a new look)

Match the shipped system exactly. Use the attached screenshots as the source of truth over anything below.

- Flat, high-contrast style. Navy primary (#054A91). Navy primary buttons.
- Tokenized components already in use: Button / IconButton, Select, Card / NavCard, Table, StatusBadge, MetricTile.
- 2px card borders, 3px NavCard borders. Gold is a brand accent only, not an action color; actions are navy.
- Header nav and admin sidebar patterns as shown in the screenshots.

If a proposed change needs a component that doesn't exist yet, extend the existing tokens rather than introducing a new visual language.

---

## Surfaces to design

### A. Quick Project Calculation & Quote (new page)

A fast-path calculator for quoting when full camera specs aren't in hand. It produces the same result and output document as the full calculator from far fewer inputs. See the attached Quick Calc scope doc for the authoritative spec.

- **User sets only:** partner block (company, partner user, project name), VMS, number of camera streams, retention days, add-ons (Failover Recorder, Management Server).
- **Everything else is fixed** to the Arxys VSR standard and should be shown as a compact, read-only "assumptions" summary so the user sees the basis without editing it: 4MP, 15 FPS, H.265, medium complexity / low motion, record on motion 75%, 24 hours, 20% storage overhead.
- **Job:** get to a saved quote fast, with far less on screen than the full calculator.
- **Serves:** Box Mover and fast internal quoting.
- **Acceptance:** a user can complete it in a fraction of the full calculator's fields; the fixed assumptions are visible but not editable; it reads as its own focused tool, not a stripped clone of the big calculator.

### B. Dashboard regroup by job

Today the dashboard sorts tools by an internal taxonomy (Tools vs Reference) that buries the deal-winning tools under "Reference." Regroup by what the user is trying to do:

- **Size a job** — the full Storage & Bandwidth Calculator (the existing large hero stays as the entry to the full tool).
- **Win a job** — the VMS Server Comparison, elevated to a first-class destination (see C).
- **Look it up** — Price Book, VideoX Quick Compare, Price List download.
- **Track my work** — My Pipeline.
- **Repurpose the existing "Calculator" card in the TOOLS row into the entry for Quick Calc** ("Quick Project Calculation & Quote"). The large hero remains the full calculator, removing the current redundancy where both point at the same tool.
- **Acceptance:** the two most persuasive tools are no longer filed as passive reference; a partner can tell at a glance where to size, where to win, where to look things up, and where their work lives.

### C. Compare split

One nav item ("Compare") currently covers two tools with different jobs. Separate them:

- **VideoX Quick Compare** — model-vs-model selection ("which VideoX for this job"). A utility.
- **VMS Server Comparison** — Arxys vs a competitor appliance ("should I switch"). A persuasion tool, and the strongest convince surface in the portal. Give it the first-class "win a job" treatment from B, with an entry aimed at a partner who hasn't committed yet.
- **Acceptance:** the persuasion tool is no longer hidden inside a utility; each has a clear, separately reachable home; nav labels match their card and page-header labels.

### D. All-pages UI/UX consistency pass

Across every page (dashboard, calculator, My Pipeline, submission detail, price book landing and detail, both compare tools, admin overview):

- **Naming consistency.** One label per thing across nav, cards, and page headers. Today "Compare / VMS Server Comparison / VideoX Quick Compare" and "Products & Prices / VideoX V5 Price Book" drift.
- **Component and spacing consistency.** Flag and align inconsistent card, table, button, and metric-tile usage.
- **Responsive / mobile.** Integrators work on job walks. Make the reasonable surfaces usable on a phone, and call out which ones genuinely can't be (dense spec tables, the full calculator) rather than forcing them.
- **Deliverable:** a short list of the inconsistencies found, plus the corrected patterns.

---

## Hard rails

- "Validated," never "certified." This is a legal and partnership line.
- Plain, technically accurate voice. No marketing language, no hype, no AI-slop phrasing. Where copy is needed, use clear placeholder text or the copy provided in the attachments; do not invent persuasive claims, spec numbers, delivery times, or pricing.
- Conservative sizing language throughout.

## Do not touch (these are Claude Code, not Design)

- Pricing logic, partner-discount display, and anything that renders partner pricing (it must stay inside the generated PDF only, never as portal UI).
- The Pipedrive integration and the project-to-quote flow.
- Generated documents (System Estimate PDF, Project Quote PDF, comparison PDF).
- Record-level access, roles, RLS, and the status system.
- The recommendation / sizing engine.
- Persuasive content bodies (price-lock badge wording, support-model explainer, durability copy). Design the placement and the component; the words arrive separately.

---

## Attach when you run this

- Screenshots of every current page: dashboard, calculator, My Pipeline, admin + pipeline submission detail, price book landing, V600 detail, VideoX Quick Compare, VMS Server Comparison.
- The Quick Calc scope doc.
- A component/token reference or a clean screen that shows the current design system, so fidelity matches the shipped app.

---

## What to hand back

1. Wireframes for A, B, and C.
2. The consistency findings for D.
3. After wireframe sign-off, full-fidelity screens for A, B, C and any corrected patterns from D.
4. Per surface, a one-line note on the job it serves and how it meets the acceptance criteria above.
