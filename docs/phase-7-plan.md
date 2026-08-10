# Phase 7 Plan — Internal "On Behalf Of" Calculations

**Status:** Step 1 + companion UI **shipped 2026-06-04** (see JOURNAL + ADR 0045). Of the three items originally deferred below, two have since shipped — partner-side visibility (2026-06-12, ADR 0054) and Pipedrive owner routing (2026-08-10, ADR 0118). Collaborator sharing is the one still open; see the updated list below.

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
- *Why owner routing was deferred, and why it no longer is:* the Pipedrive owner is a Pipedrive user ID, requiring a portal-user → Pipedrive-user-ID map maintained by hand — this note originally reasoned that a two-person team didn't justify building it. Andy later confirmed the team really is just the two of them for Pipedrive purposes (only he and Richard are Pipedrive users, and no one else on the team will be), which is a small fixed mapping rather than the general N-rep problem this was avoiding — see [ADR 0118](./decisions/0118-pipedrive-owner-per-rep-routing.md) (2026-08-10). The pinned note stays regardless, as a plain-text audit trail independent of the owner field.

---

## Companion UI work (bundle with Step 1 or fast-follow)

- **Invite form** (`/admin/partners/new`): add an "Internal user" checkbox that sets `is_internal` on the new partner row.
- **Admin partners table** (`/admin/partners`): add a per-row toggle to mark/unmark existing users internal — needed to retrofit current Arxys staff (Michael, Richard, Marcos, etc.) who were invited as plain partners. Same Server Action + `requireAdmin()` pattern as the existing Suspend/Reactivate actions.

These are admin-surface changes, low risk, and gate the whole feature (no internal users = nobody can use the field). Sequence them with Step 1 so the feature is testable end-to-end.

---

## Deferred — later Phase 7 steps

- **Tag / share a calc with a real portal user.** The "bonus" from the original ask: add an actual portal user (already in the system) to a project so they can see/revise it. This is a `submission_collaborators` join table + new RLS (read access beyond `partner_id = auth.uid()`) + UI. Tripled RLS surface for a nice-to-have — kept out of Step 1 deliberately. Revisit once on-behalf is in production use. **Still the one genuinely open item** — no signal since 2026-06-04 that anyone's asked for it.
- ~~**Pipedrive owner routing per internal rep.**~~ **Shipped 2026-08-10**, see [ADR 0118](./decisions/0118-pipedrive-owner-per-rep-routing.md). Built for the confirmed two-person Pipedrive-user team (Andy, Richard), not waiting on a third.
- ~~**Partner-side visibility of on-behalf projects.**~~ **Shipped 2026-06-12**, see [ADR 0054](./decisions/0054-on-behalf-target-visibility.md). A partner the work is prepared for can see and revise it from their own account today, with a "Prepared by Arxys · {rep}" badge. This bullet sat here stale for two months after shipping — caught 2026-08-10 while reviewing this plan for something else; check JOURNAL against this list before trusting it as current.

---

## Open questions to settle before later steps

1. Should an external partner ever see an on-behalf project created for them? — **Settled 2026-06-12** for the matched-partner case (ADR 0054). Still open only for the collaborator-sharing extension above (a *different* portal user than the on-behalf target seeing/revising a project).
2. If a free-typed company is later invited as a real partner, do we want a backfill that links the old free-typed submissions to the new `partners.id`? (Probably a small admin script; out of scope for now.)
