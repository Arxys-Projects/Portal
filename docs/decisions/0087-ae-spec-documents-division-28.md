# 0087 — A&E Specification Documents (Division 28)

**Status:** Proposed
**Date:** 2026-07-20
**Owner:** Andy Newbom
**Depends on:** none (content-first project; portal work is minimal)
**Related:** 0085 (convince-the-hesitant surfacing), Phase 2 planning set

## Context

Security projects are frequently won upstream of the integrator, at the moment an A&E consultant writes a manufacturer into the bid specification. Consultants and integrators responding to spec'd bids look for downloadable CSI-format specification language (MasterFormat Division 28, Electronic Safety and Security) on the manufacturer's site or portal. Arxys publishes none today. The absence is invisible in day-to-day partner conversations because the ask never reaches Arxys: the bid simply gets written around a competitor whose spec language is available, most often a Dell-branded VMS appliance.

The portal currently serves the sizing moment (calculator, estimates) and is expanding into the persuasion moment (0085). Spec documents serve the bidding moment, which precedes both. One well-executed asset here compounds: a single spec'd bid can be worth more than months of outbound.

## Decision

Produce downloadable CSI-format specification documents per product family and surface them in the portal as a "Spec Documents" card under Reference.

Scope of the decision at this stage:

1. This is a content project first and a portal feature second. The hard work is writing accurate Section 28 language (28 23 00 Video Management System storage/recorder hardware and related sections). The portal side is a Reference card, a storage location, and download links. No schema, no RLS, no calculator involvement.
2. Documents are produced per VideoX V5 family. Whether AnalyticX is included in the first pass is an open question for the planning session.
3. Delivery format is PDF plus an editable format (DOCX) because consultants paste spec language into their own bid documents. Editable is the whole point.
4. Content authoring happens in a dedicated planning session with the arxys-company and branding skills loaded. No spec language is drafted outside that session, and every technical claim in the documents is verified against current product specs before publication.

## Open questions (to settle in the planning session)

- **Gating:** open download vs. behind partner login. Open maximizes reach with consultants who will never register for a portal; gated gives contact capture. Consultant behavior strongly favors open. A hybrid (open on arxys.com, mirrored in the portal) is also on the table and would make this the first portal Reference asset with a public twin.
- **Family scope:** VideoX V5 only, or VideoX + AnalyticX.
- **Section coverage:** which Division 28 sections beyond 28 23 00 (e.g., general 28 05 00 common requirements) are worth including vs. noise.
- **Maintenance trigger:** spec documents reference concrete capacities and models, so they need a defined refresh trigger tied to the existing price/product update run and EOL process (a stale spec that names a discontinued model is worse than no spec).
- **Naming and versioning convention** for the files (date-stamped, family-keyed), consistent with the portal's existing document conventions.

## Prework required before the planning session

1. **Format reference:** pull one or two real Division 28 specifications from past bids as structural models. The WCJ Adult Detention Center (Franklin, TN) RFQ is the first place to look.
2. **Scope call:** decide VideoX-only vs. VideoX + AnalyticX for the first pass.
3. **Gating call (provisional):** arrive with a lean toward open vs. gated so the session doesn't stall on distribution strategy.
4. **Source-of-truth inventory:** confirm which portal/product data (product_specs, current datasheets, validated VMS list) the spec language will be verified against, so the session has authoritative inputs loaded.
5. **Skills loaded for the session:** arxys-company, branding, no-ai-slop.

## Consequences

- Arxys becomes specifiable in consultant-driven bids, a channel currently defaulting to competitors.
- Adds a static-content asset class to the portal Reference section; establishes the pattern (storage location, download card, refresh trigger) for future leave-behind documents from 0085.
- Creates a recurring maintenance obligation tied to product updates and EOL events. Accepted; the refresh trigger is defined in the planning session before anything publishes.
- No portal engineering risk: links-and-card only, no data or access-model changes.
