# Phase 7 Plan — Internal "On Behalf Of" Calculations

**Status:** Step 1 + companion UI **shipped 2026-06-04** (see JOURNAL + ADR 0045). Deferred items below remain open.

This is a forward-looking plan (rewritable as state evolves), not a JOURNAL entry. It covers internal-user calculations on behalf of partners, plus deferred follow-ons.

---

## Problem

An internal Arxys salesperson needs to run a sizing calculation for a security partner — make the project and deal *for* them — instead of the partner self-serving. Today every submission groups by `submissions.partner_id = auth.uid()`, so the moment an internal user runs a calc it groups under the internal user's company ("Arxys"), not the partner's. The deal and pipeline rollup point at the wrong company.

Goal: an on-behalf calc rolls up to the **target partner** (submission grouping + Pipedrive deal), the external partner self-serve experience is unchanged, and a matched partner's on-behalf submissions land in the same project/partner bucket as that partner's own submissions.

---

## Step 1 — On-behalf calculation (the core mechanic)

Handoff brief: `phase-7-step-1-brief.md`. Model: **Opus**.

**What ships:**

- Two additive nullable columns on `submissions`: `on_behalf_of_partner_id` (FK → `partners.id`) and `on_behalf_of_company_name` (text fallback). At most one set; both NULL = normal self-serve.
- One additive `is_internal BOOLEAN NOT NULL DEFAULT false` on `partners` — the authorization flag.
- An internal-only target-partner field in the calculator (free-text `<input>` + `<datalist>` of existing partner company names, same pattern as Project Name). Renders only when `is_internal=true`.
- The calculator Server Action authorizes on-behalf writes against `is_internal` server-side, resolves the typed value to either the partner FK (exact name match) or the free-text fallback, and passes the **target** partner's identity into the existing Pipedrive deal-create.
- Grouping key changes to `COALESCE(on_behalf_of_partner_id, normalized on_behalf_of_company_name, partner_id)` in `forecast.ts` and the admin partner-grouped submissions view.
- Internal rep credited on the Pipedrive deal via a pinned note (not the owner field).

**What it deliberately does NOT touch:** `submissions.partner_id` semantics (stays = creator), the external partner experience, `deal.ts`/`contacts.ts`/`client.ts`/`lookups.ts` (Pipedrive behavior comes entirely from which partner identity the action passes in), and RLS policies (the change is RLS-neutral — creator-based policies already cover it; admins already read across partners).

**Key design rationale:**

- *Why `is_internal` and not company-string matching:* internal Arxys users currently have no reliable identity in the data — `company_name` varies ("Arxys", "Arxys Tech") and isn't trustworthy as a gate. A boolean flag set at invite time (and retrofittable by admin) is the honest signal.
- *Why free-text is allowed but person is omitted for free-typed deals:* reps shouldn't be blocked waiting for partner onboarding. But a free-typed company has no email, so `upsertPerson` has nothing to match on. Creating a placeholder person would pollute Pipedrive. So a free-typed on-behalf deal creates the org only; when that partner is later invited and quoted, their real person attaches going forward.
- *Why owner routing is deferred:* the Pipedrive owner is a Pipedrive user ID, requiring a portal-user → Pipedrive-user-ID map maintained by hand. Two-person team, Andy manages all created deals. A note captures rep attribution for free. Revisit if the sales team grows.

---

## Companion UI work (bundle with Step 1 or fast-follow)

- **Invite form** (`/admin/partners/new`): add an "Internal user" checkbox that sets `is_internal` on the new partner row.
- **Admin partners table** (`/admin/partners`): add a per-row toggle to mark/unmark existing users internal — needed to retrofit current Arxys staff (Michael, Richard, Marcos, etc.) who were invited as plain partners. Same Server Action + `requireAdmin()` pattern as the existing Suspend/Reactivate actions.

These are admin-surface changes, low risk, and gate the whole feature (no internal users = nobody can use the field). Sequence them with Step 1 so the feature is testable end-to-end.

---

## Deferred — later Phase 7 steps

- **Tag / share a calc with a real portal user.** The "bonus" from the original ask: add an actual portal user (already in the system) to a project so they can see/revise it. This is a `submission_collaborators` join table + new RLS (read access beyond `partner_id = auth.uid()`) + UI. Tripled RLS surface for a nice-to-have — kept out of Step 1 deliberately. Revisit once on-behalf is in production use.
- **Pipedrive owner routing per internal rep.** Portal-user → Pipedrive-user-ID map + threading owner through deal-create. Only worth it if a third+ rep joins.
- **Partner-side visibility of on-behalf projects.** Decide whether a partner, on login, sees projects an Arxys rep created for them (vs. invisible until explicitly shared). Currently out of scope — on-behalf submissions belong to the creator's `partner_id`, so a partner does not see them today. If partners should see "their" on-behalf projects, that's a read-access change that overlaps with the collaborator work above. Defer and decide together.

---

## Open questions to settle before later steps

1. Should an external partner ever see an on-behalf project created for them? (Drives the collaborator/visibility work.)
2. If a free-typed company is later invited as a real partner, do we want a backfill that links the old free-typed submissions to the new `partners.id`? (Probably a small admin script; out of scope for now.)
