# Portal gap analysis — ranked for partner adoption

**Date:** 2026-07-20
**Session:** Claude chat strategic review (journal + live dashboard screenshot as inputs)
**Lens:** partner adoption and usage, ranked. Planned ADRs and net-new items ranked together.
**Status of this doc:** planning artifact. Nothing here is decided except item 11 (ADR 0087, Proposed). Every other item requires its own scoping pass before any Claude Code brief.

**How to use this doc in later sessions:** each item carries a Scope (in) and Non-goals (out) block. The non-goals are the drift guards. If a later session wants something from a non-goals list, that is a new decision requiring its own justification, and this doc should be updated to record the change. Do not silently expand.

---

## Ranked list

### 1. Price-staleness flag on saved projects (net-new, small)

**Problem.** Pricing is append-only with `effective_date`; submissions store SKU + units and resolve prices live at render. A partner who generated an estimate in June and quoted their customer gets no signal that regenerating today produces different numbers. In the current price-velocity environment (July HDD jumps of 38 to 55%) this is an active liability for partners.

**Scope (in):**
- A staleness check per submission: compare submission `created_at` (or last-generated date) against the latest `effective_date` for any SKU it references.
- A visible badge in My Pipeline rows and on the submission detail page ("Prices updated since this estimate").
- A regenerate affordance next to the badge (the existing regenerate path; nothing new).

**Non-goals (out):**
- No stored price snapshots on submissions. Live resolution stays (ADR 0086 single source of truth).
- No per-line diff of old vs new prices.
- No automatic regeneration.
- No email (that is item 2).

**Effort / model:** half day, Sonnet 4.6, no schema change, no gates.
**Open questions:** which date anchors the comparison when a submission has multiple generated PDFs (latest generation date is the likely answer).

---

### 2. Partner notification emails (net-new, small-medium)

**Problem.** SMTP exists but every current email points inward. Partners get zero outbound signal from the portal, so nothing pulls them back without their own decision to visit.

**Scope (in):** exactly three transactional triggers.
1. **Price-change notice:** on a production price run, email partners who own open submissions referencing affected SKUs. Pairs with item 1.
2. **Deal-registration confirmation:** immediate email on Register a Deal with what was received and what happens next.
3. **Quote-ready:** when ADR 0083 ships, notify the partner a Project Quote revision is visible.

**Non-goals (out):**
- No marketing email engine, no digests, no newsletters, no campaign tooling (that lives in Andy's existing outbound stack).
- No per-partner notification preference UI in v1. One global opt-out flag on the partner record at most.
- No email to partners without affected open submissions on a price run.

**Effort / model:** 1 to 2 days, Sonnet 4.6 for templates and wiring; the price-run trigger touches `push-prices.ts` and should be reviewed at Opus level since that script is gated.
**Dependencies:** trigger 3 depends on 0083. Triggers 1 and 2 have none.
**Open questions:** sender identity (noreply@ vs a monitored address); whether trigger 1 fires from `push-prices.ts` itself or a separate follow-up script (separate script is safer given the resurrection-trap hardening already on push-prices).

---

### 3. Quick Project Calculation (ADR 0082, Proposed, medium)

Already scoped in the 2026-07-15 session. Ranked #3 here on the adoption lens: the full calculator serves the Technical Differentiator archetype; the Box Mover wants six inputs and a number. Lowering first-run friction is the biggest lever for partners who logged in once and have not returned.

**Drift guard:** the 0082 scope is six inputs feeding the same submission/deal/System Estimate pipeline with VSR standard fixed. Later sessions should resist adding inputs to Quick Calc; every added input recreates the full calculator and defeats the page.

---

### 4. Lead time / availability column in the Price Book (net-new, small)

**Problem.** Seagate and WD are sold out into 2027 and integrators know it. The Price Book is currently a static MSRP reference; availability is the question they actually carry into every bid right now.

**Scope (in):**
- One admin-editable lead-time/availability field per product family (free text, short: "Ships in 2-3 weeks", "Allocation, call us").
- Displayed as a column in the Price Book and on QuickCompare.
- Admin edit surface on the existing admin pages.

**Non-goals (out):**
- No per-SKU granularity in v1 (per family only).
- No live inventory integration, no ERP hookup, no stock counts.
- No promised-date commitments; language stays qualitative.

**Effort / model:** half day to a day, Sonnet 4.6. One column (migration, gated), one admin form field, two display sites.
**Open questions:** family-level table to hang it on (product families are currently derived, verify where family metadata lives).

---

### 5. Partner visibility of own Project Quotes (ADR 0083, Proposed, medium, RLS gate)

Already scoped. Ranked #5: deepens usage for already-active partners rather than widening the funnel, so it sits after Quick Calc on the adoption lens. Stop-and-flag before RLS work stands (amends 0059).

---

### 6. Clone project (net-new, small)

**Problem.** Integrators size the same job shape repeatedly (same camera mix, different site). Re-entering it is the most repetitive work the heaviest users do.

**Scope (in):**
- A "Duplicate" action on a partner's own submissions (My Pipeline row + detail page).
- Pre-fills the calculator with the source submission's groups/settings; partner renames and saves as a new submission.
- New submission is fully independent (new Pipedrive deal on save, per the normal flow).

**Non-goals (out):**
- No linking/parent-child relationship between source and clone.
- No cloning of other partners' submissions, including for internal users in v1 (internal on-behalf cloning is a candidate v2, decide separately).
- No cloning of generated PDFs or quote history; the clone starts clean.

**Effort / model:** half day, Sonnet 4.6. Reuses the existing revision-hydration path (`page.tsx` prop flow) with a "new instead of edit" flag.
**Open questions:** whether clone carries the VMS selection and on-behalf fields (default: yes to VMS, no to on-behalf).

---

### 7. Status-model UI pass + IA regroup (TODO 0081-ui + ADR 0084, planned, small-medium)

The dashboard currently renders Weighted Forecast, Sent, and Drafts tiles as em-dash placeholders against retired statuses. Dead tiles on the landing page read as an unfinished product to a partner deciding whether to trust it.

**Drift guard / sequencing note:** the tile removal and Won/Lost visual treatment (marked `// TODO(0081-ui)`) should ship ahead of the full 0084 Design session if that session slips more than a week or two. It is a small standalone change and the current state actively costs credibility.

---

### 8. Datasheet links per model (net-new, small if links-only)

**Problem.** Integrators assembling customer proposals need spec sheets. Today that is a trip to arxys.com, which takes them out of the portal mid-workflow.

**Scope (in):**
- A `datasheet_url` per SKU (or per family where SKU-level does not exist), admin-maintained.
- Surfaced as a link/icon in Price Book and QuickCompare.

**Non-goals (out):**
- No asset library, no image galleries, no file hosting in the portal (links to existing arxys.com-hosted PDFs only).
- No version management of datasheets.

**Effort / model:** half day, Sonnet 4.6, one column (gated migration), two display sites, admin edit field.
**Open questions:** SKU-level vs family-level (family is probably right and matches item 4's granularity).

---

### 9. Convince-the-hesitant surfacing (ADR 0085, Proposed, medium)

Already scoped. Real value, but it serves conversion of the partner's customer more than partner adoption, so it ranks here on this lens. Phase 2 timing as scoped stands. The co-brand direction from the 2026-07-17 session lives here.

**Addendum from this session:** extend co-brand (partner logo) to the System Estimate PDF, not just the packet. Same logo asset and render pattern serves both; it should be one line in the 0085 spec rather than a separate later effort. The estimate is the document partners generate most and present as their own design; co-branding it makes running every job through the calculator self-reinforcing.

---

### 10. Deal-registration status loop (net-new, small)

**Problem.** "Andy will follow up" is a black hole from the partner's side after Register a Deal.

**Scope (in):**
- A status field on registered deals: Received / Approved / Expired (three states, mirroring the 0081 minimalism lesson: only states someone will actually maintain).
- Partner sees status on their registrations; admin sets it.

**Non-goals (out):**
- No approval workflow engine, no expiry automation, no protection-period date math in v1.
- No notification email in v1 (fold into item 2's triggers later if wanted).

**Effort / model:** half day to a day, Sonnet 4.6, one column (gated migration).
**Priority note:** low urgency until registration volume grows. Ranked last among build items for that reason.

---

### 11. A&E Specification Documents, Division 28 (ADR 0087, Proposed)

Adopted into the plan this session. Full context, decision, open questions, and prework in [`0087-ae-spec-documents-division-28.md`](./decisions/0087-ae-spec-documents-division-28.md). Requires a dedicated planning session with arxys-company, branding, and no-ai-slop skills loaded. Content-first; portal side is a Reference card and download links. Unranked against the build items above because its effort is authoring, not engineering, and it can proceed in parallel.

---

## Surfaced and parked (explicitly not in plan)

- **Partner-specific pricing ("your price" column):** highest-impact idea from the integrator-expectations pass, and the most consequential. A per-partner discount percentage applied as a display column would cover most of it without a discount engine. Parked because it touches the no-price-math-in-portal rule at its edge and deserves its own dedicated scoping session with Richard/Michael input on discount-structure exposure. Do not fold into any other item's build.
- **Warranty / serial lookup:** strong integrator fit; blocked on whether serials + ship dates exist in pullable form in fulfillment records. Prework: confirm data availability, then scope.
- **VMS license line on estimates:** useful, non-critical. Parked as a single line item to ride along whenever the System Estimate PDF is next touched. Non-priced informational line only ("Genetec: N camera connections required, licensed separately").
- **Per-SKU lifecycle status column (Active / Last-call / EOL with replacement link):** merged conceptually with item 4's Price Book column work; scope together when item 4 is briefed, as they share the same admin surface and display sites. Kept separate in ranking because lifecycle data already exists internally while lead time is new data entry.

## Refused (integrator desires that stay out of the portal)

Firmware download library, training/certification LMS, marketing asset library, full RMA workflow, live order/shipment tracking (already dropped 2026-07-15). All real desires; all portal bloat at a 12-partner channel scale, and all better served by support.arxys.com or direct contact. Any future session proposing one of these must justify why the scale answer has changed.

## Sequencing suggestion

Items 1, 2 (triggers 1+2 only), and 4 combine into one "supply-chain era" Claude Code brief: all small, mutually reinforcing, shippable in one pass. Then 0082 (Quick Calc) as already planned. Item 7's tile removal ships opportunistically if the Design session slips. Item 11 proceeds in parallel on the content track.

## Standing constraints (apply to every item)

- No price math in the portal. No git push. No `supabase db push` by the agent. Gated migrations with backup/dry-run/rollback for anything touching live records or schema. Stop-and-flag on RLS.
- Every Claude Code brief states model + effort at top. Opus 4.8 for schema/RLS/security/CRM write paths; Sonnet 4.6 for mechanical UI/display work.
- Analytics baseline is live as of 2026-07-20 (Vercel Web Analytics, anonymous page-level). Revisit rankings once 4 to 6 weeks of page data exists; a Supabase `portal_events` table is the identified follow-on for per-partner attribution.
