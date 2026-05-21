# Portal Phase 2 — Pricing Pipeline & MVP launch

Portal Phase 1 closed 2026-05-20 (JOURNAL: *Step 11 — pre-launch verification*). Phase 2 takes the project from "Phase 1 structurally verified but partner-launch blocked" to **"MVP final — first external partners invited."** Pricing data, calculator real-pricing, partner XLSX download, and an HTML price book inside the portal all land before any external partner is invited.

## Naming (per ADR [0029](./decisions/0029-phase-2-step-naming-convention.md))

- **Portal Phase 1** = the partner-portal MVP. Closed.
- **Portal Phase 2** = this work. Ships the MVP.
- **Phase 2 Step N** = a discrete work unit inside Portal Phase 2. Numbered from 1.
- "Phase 2" with no qualifier means Portal Phase 2.

## Locked decisions (per ADR [0030](./decisions/0030-phase-2-scope-and-locked-decisions.md))

- **No Google Slides work in Phase 2, ever.** No automation. No retirement step. No comms work. The portal's HTML price book (Step 8) replaces Slides functionally; Slides becomes a non-thing.
- **Internal testing only until end of Phase 2.** No external partners during Phase 2. End-of-Phase-2 = "MVP final" = the 2–3 partner cohort invite (Step 10).
- **PQ1 launch-blocker:** moot. Internal-only testing means the placeholder `$1.00..$57.00` view on `/submissions` is invisible to anyone outside Arxys until Step 6 unblocks with real numbers.
- **PQ2 Master Sheet reconciliation:** (ii) — work with the Sheet as-is. Push script derives Product Group from the SKU prefix (`VX5-<GROUP>-<TIER>`); parses inline MKT/CFQ in the MSRP cell. Zero data-entry burden on the Sheet's maintainer. Validation pass refuses to push any row whose SKU breaks the prefix convention — explicit error, requires manual fix in Sheet or addition of a Product Group column.
- **PQ3 discount mechanic:** partial. Partner XLSX download (Step 7) is MSRP-only — no discount logic. HTML price book (Step 8) defers the per-user discount question to its own scoping brief; possibly displays "Contact Arxys" until tier data exists.
- **PQ4 schema appetite:** full SKU-PK migration. The 6-row family `products` table is replaced with the ~35-row SKU-PK schema from the proposal. Cascade FK updates on `submissions.recommended_product_id` and `server_specs.product_id`.
- **PQ5 push script location:** (a) — `scripts/push-prices.ts` in this repo. Sits next to `bootstrap-admin.ts` and `test-rls.ts`; reuses existing Supabase + Pipedrive clients + env validation.
- **PQ6 sub-phase sequencing:** per-step scoping briefs in the Step 11 shape, at `docs/phase-2/step-N-<short-title>.md`.

## Work-unit table

| # | Title | Blocker | Notes |
|---|---|---|---|
| **Phase 2 Step 1** | Minimal portal branding | None — independent | Arxys logo in app header + Gold accent (`#fbb040`) on primary buttons. Half-day. Ships first so internal testers see the brand from day one. |
| **Phase 2 Step 2** | Master Sheet validation | None | Confirm Sheet is the final master. Confirm SKU prefix convention (`VX5-<GROUP>-<TIER>`) holds for all 35 current rows. No column additions per PQ2(ii). |
| **Phase 2 Step 3** | Schema migration: `products` UUID-PK → SKU-PK | Step 2 | New columns per proposal: `price_type`, `product_group`, `sort_order`, `active`. Cascade FKs on `submissions.recommended_product_id` + `server_specs.product_id`. Migration replaces the 6 placeholder rows on first push. |
| **Phase 2 Step 4** | Recommendation algorithm rewrite (family → SKU) | Step 3 | Calculator picks a specific SKU based on workload fit + cost. Tie-break logic updated. |
| **Phase 2 Step 5** | Push script — `scripts/push-prices.ts` | Steps 2 + 3 | Sheet → Supabase + Pipedrive Products. Slides explicitly excluded. Validation + change-preview + CONFIRM-or-CANCEL prompt per the proposal. Adds `googleapis` dependency (scripts-only, not bundled into the portal app build). |
| **Phase 2 Step 6** | Partner-price display fix | Steps 4 + 5 | `formatPrice` returns real numbers. Pipedrive Deal `value` no longer $0. Pinned `Phase 1 placeholder` note removed from new Deals. The Step 11 launch blocker resolves here. |
| **Phase 2 Step 7** | Partner XLSX download (dashboard tool) | Step 5 | Goal 4. On-demand from Supabase. Authenticated partners only. MSRP-only (no discount). Dashboard button/widget; not on the Price Book page itself. |
| **Phase 2 Step 8** | Portal HTML price book page | Step 5 | Goal 5. New authenticated route. **Open scoping question** at the bottom of this doc — depends on what's in the current Slides beyond a price table. |
| **Phase 2 Step 9** | Verification + internal smoke testing | Steps 6 + 8 | Step 11's deferred items (forgot-password recovery, suspend banner, Resend Invite, page-by-page production walk) all run against real prices + the new price book. Internal-tester pass; admins + a few internal staff. |
| **Phase 2 Step 10** | MVP launch — 2–3 partner cohort invite | Step 9 | End of Phase 2. Canary partner first; remaining 1–2 stagger 24–48h after the canary's first submission lands cleanly. |
| **Phase 2 Step X (optional)** | Custom domain `portal.arxys.com` | None — independent | Anytime; ADR [0025](./decisions/0025-supabase-custom-smtp-and-branded-templates.md) "when to revisit." |

## Open question parked for Step 8 scoping

What's in the Google Slides price book today, content-wise, beyond a flat price table?

- **Just a clean price table** → Step 8 is a simple Supabase-driven table render, similar in shape to `/admin/submissions`. ~half-day.
- **Product imagery + family descriptions + marketing copy + configuration callouts** → Step 8 grows into a content/design surface. Depends on Andy supplying assets (product photos, family blurbs) and copy. Splittable into 8a (table) + 8b (content shell) so 8a can ship independently.

This question opens when Step 8 reaches its own scoping brief. Not now.

## How each Phase 2 Step gets scoped

Per Step 11 shape. Each scoping brief at `docs/phase-2/step-N-<short-title>.md` covers:

1. Andy's dashboard / account / manual prereqs (separated from code work).
2. Code work, with file-level task list.
3. Verification gates (build, lint, test, RLS, smoke).
4. Definition of done.
5. Open questions to lock before execution.

## References

- [`JOURNAL.md`](./JOURNAL.md) — Step 11 close-out entry (2026-05-20) for the trigger event; Phase 2 setup entry for the locking session.
- [`proposals/phase-2-pricing-pipeline.md`](./proposals/phase-2-pricing-pipeline.md) — Pricing Pipeline reference spec. Top-of-file banner records the scope cuts (Slides removed, Sheet stays as-is, script in this repo). Body below the banner is verbatim historical reference.
- [ADR 0019](./decisions/0019-defer-real-pricing-to-phase-2.md) — original deferral that created Phase 2 as a concept.
- [ADR 0029](./decisions/0029-phase-2-step-naming-convention.md) — naming convention this doc uses.
- [ADR 0030](./decisions/0030-phase-2-scope-and-locked-decisions.md) — the PQ resolutions and scope cuts summarized above.
