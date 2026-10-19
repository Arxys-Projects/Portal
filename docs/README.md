# Arxys Partner Portal — Documentation

Three documents, three jobs. Don't mix them.

| File | Purpose | When to read | When to write |
|---|---|---|---|
| [`JOURNAL.md`](./JOURNAL.md) | Chronological narrative of what was tried, what failed, what we course-corrected on, and why. The history book. | When you need to understand *why* something looks the way it does, or what we ruled out. | Append after every meaningful work session. Include detours, fixes, surprises. |
| [`RUNBOOK.md`](./RUNBOOK.md) | The clean, idempotent recipe to recreate this project from a blank Mac. No dead-ends, no detours. | When you (or a new contributor) need to set up the project from zero or recover from a broken state. | Update *immediately* every time a step in the happy path changes. Keep it linear and copy-pasteable. |
| [`decisions/NNNN-title.md`](./decisions/) | Architecture Decision Records (ADRs). One short markdown per non-obvious choice: context, options considered, decision, consequences. | When deciding whether to revisit a past choice, or when onboarding someone who'll be making similar choices. | Whenever a decision is made that isn't self-evident from the code six months later. |

## How they relate

- A bug fix in production → JOURNAL entry (what broke and why), maybe a RUNBOOK update (if the fix changes setup), no ADR.
- Switching a library or pattern → JOURNAL entry, RUNBOOK update, **and** an ADR.
- A failed approach we backed out of → JOURNAL entry, no RUNBOOK change, no ADR.
- Adopting a tool that needs install steps → JOURNAL entry, RUNBOOK update for the install.

## Filename conventions

- JOURNAL entries are dated headings inside a single file. Newest at top.
- ADRs are sequentially numbered: `0001-title.md`, `0002-title.md`. Numbers never get reused, even if an ADR is superseded.
- A superseded ADR isn't deleted — it gets a `Status: Superseded by #NNNN` note at the top and stays in the directory.

## Forward-looking plans

The three core docs above are the source of truth for *what happened* and *how to recreate it*. They don't cover *what's next*. Active project plans live alongside them and follow different rules — they're rewritten as project state evolves rather than appended to like JOURNAL.

| File | Status |
|---|---|
| [`calculator-math-phase-2-plan.md`](./calculator-math-phase-2-plan.md) | **Superseded by its own ADRs** — the sizing-engine rework, built in three phases against the golden harness. Read it for the reasoning; read the ADRs for what actually shipped, which differs on D8. Backed by [`audits/calculator-math-audit.md`](./audits/calculator-math-audit.md). **Phase A (D1–D8) built 2026-08-12** ([apply note](./apply-notes/0123-calculator-math-phase-a.md), ADRs [0123](./decisions/0123-bitrate-reanchor-and-sublinear-fps.md)–[0128](./decisions/0128-audio-metadata-counted.md)). **Phases B + C built 2026-08-17, plus a reversal of D8** ([apply note](./apply-notes/0131-calculator-math-phase-bc.md), ADRs [0131](./decisions/0131-audio-metadata-reversed-into-the-buffer.md)–[0133](./decisions/0133-vsr-rating-basis-is-complexity-tier-2.md)): **D8's audio/metadata toggle is withdrawn**, replaced by a ~2% storage-only cushion in the buffer default (90% → 88%); retention is per camera group; the VSR rating basis is recorded as complexity tier 2, with the Quick Calc complexity conflict **still open for Andy**. |
| [`phase-7-plan.md`](./phase-7-plan.md) | **Active** — internal "on behalf of" calculations. Step 1 + companion UI shipped 2026-06-04 (see JOURNAL + ADR [0045](./decisions/0045-on-behalf-of-calculations.md)). Of the three originally-deferred items, two have since shipped (partner visibility, ADR [0054](./decisions/0054-on-behalf-target-visibility.md); Pipedrive owner routing, ADR [0118](./decisions/0118-pipedrive-owner-per-rep-routing.md)) — only collaborator sharing remains open. See `phase-7-plan.md` itself before trusting this line; it sat stale here for two months last time. Handoff brief: [`phase-7-step-1-brief.md`](./phase-7-step-1-brief.md). |
| `phase-3-plan.md` (not yet created) | **Next** — Portal Phase 3 work plan. Will cover custom domain `portal.arxys.com` + 2-3 partner cohort invite + anything else surfaced after Phase 2 close. Scoped when needed. |
| [`phase-2-plan.md`](./phase-2-plan.md) | Complete (2026-05-22) — Portal Phase 2 work plan (Pricing Pipeline + MVP feature-complete). Historical record; see ADR [0036](./decisions/0036-phase-2-closure-and-phase-3-scope.md) for closure. |
| [`proposals/phase-2-pricing-pipeline.md`](./proposals/phase-2-pricing-pipeline.md) | Reference — verbatim copy of Andy's Pricing Pipeline planning doc. Authoritative spec for Pipeline Phases 0–3. Read-only history; the operational plan was in `phase-2-plan.md`. |

## Handoff briefs

Session-scoping briefs for work handed to a fresh Claude Code session: model + effort, what to
read first, tasks, and the hard "do not" list. One per build step that needs one — not every
step does. They live next to the ADR they implement, as `decisions/claude-code-brief-*.md`.
Written before the work, not updated after it; the JOURNAL records what actually happened.

| File | Status |
|---|---|
| [`Portal-Project revamp/claude-code-brief-project-portal-backend.md`](./Portal-Project%20revamp/claude-code-brief-project-portal-backend.md) | **Active**, multi-step, and unlike the others it IS updated at each gate (its own rule). Project Portal backend MVP 1.0: companies, contacts, projects, system design, deal lines. Step 0 done 2026-10-16 (ADR [0152](./decisions/0152-project-contact-login-sees-quotes-via-on-behalf-fk.md); prerequisites fixed in [0150](./decisions/0150-pipedrive-products-retire-via-linkable-and-stop-on-duplicate-codes.md) and [0151](./decisions/0151-partners-self-update-guard-trigger.md)). Step 1 schema applied and verified 2026-10-16 (ADRs [0153](./decisions/0153-project-companies-contacts-and-project-link-tables.md), [0154](./decisions/0154-system-design-and-bom-rules-are-admin-edited-and-audited.md), [0155](./decisions/0155-deal-line-ledger-and-insert-only-pricing-confirmations.md); [apply note](./apply-notes/0153-project-portal-schema.md)). Addendum [0156](./decisions/0156-company-sync-include-list-for-unlabeled-orgs.md) (company include list) applied and verified 2026-10-16. Step 2 sync written and dry-run ([0157](./decisions/0157-company-sync-reads-v2-and-applies-a-reviewed-mapping-file.md)). Step 2 done: 64 companies, 413 contacts, 8 aliases, 68 login links written. Step 3 pure engines done 2026-10-19 (ADRs [0158](./decisions/0158-system-design-resolved-from-validated-rules-with-a-snapshot.md), [0159](./decisions/0159-failover-sized-on-the-primarys-basis-from-per-group-daily-load.md), [0160](./decisions/0160-sfp-excludes-1u-servers-by-rack-units.md), [0161](./decisions/0161-bom-lines-one-per-sku-and-role-no-prices.md)). **Next: Step 4.** |
| [`decisions/claude-code-brief-price-book-spec-sync.md`](./decisions/claude-code-brief-price-book-spec-sync.md) | Complete 2026-10-12. The seven product_specs families' Price Book pages derive their spec facts from `product_specs`, ADR [0146](./decisions/0146-price-book-pages-derive-spec-facts-from-product-specs.md); audit and Gate B table in [`audits/price-book-spec-drift-audit.md`](./audits/price-book-spec-drift-audit.md). Data corrections and Andy's three product decisions from the audit's §7 applied 2026-10-12 (V400 rated 1600 Mbit/s). **Open:** V250 / V260 / V150 ACM / SW still authored. |
| [`decisions/claude-code-brief-projects-page-schema-and-query-layer.md`](./decisions/claude-code-brief-projects-page-schema-and-query-layer.md) | Phase 1 of 2 complete 2026-08-03 — schema + query layer for `/projects`, ADRs [0112](./decisions/0112-internal-project-archive-is-a-side-table.md) / [0113](./decisions/0113-pipedrive-reads-are-cached-with-a-last-known-fallback.md), migrations **applied and verified 2026-08-03** ([apply note](./apply-notes/0112-0113-projects-page-schema.md)). **Phase 2 (the page itself) is open and needs its own brief**; the design spec is [`design/projects-page-handoff/handoff/claude-code-prompt-projects.md`](./design/projects-page-handoff/handoff/claude-code-prompt-projects.md) and the contract to build against is `src/lib/projects/types.ts`. |
| [`decisions/claude-code-brief-0097-step-2.md`](./decisions/claude-code-brief-0097-step-2.md) | Complete — ADR [0097](./decisions/0097-datasheet-surfaces-join-admin-editable-pattern.md) build step 2: `src/lib/spec-form/` extracted and `/admin/specs` migrated onto it, shipped 2026-07-28. Steps 1, 3 and 4 also shipped that day; **step 5** (the `appliance_specs` surface) is the open one and has no brief yet — design §3–4 and §7 scope it. |
| [`decisions/claude-code-brief-0089-customer-proposal-and-logo.md`](./decisions/claude-code-brief-0089-customer-proposal-and-logo.md) | Complete — ADR [0089](./decisions/0089-customer-proposal-and-partner-logo-system.md) Customer Proposal + partner logo system. Shipped to production 2026-07-22. |
| [`phase-7-step-1-brief.md`](./phase-7-step-1-brief.md) | Complete — `phase-7-plan.md` step 1, shipped 2026-06-04. Predates the `decisions/` convention above; left where it is. |
