# 0045 — Internal "on behalf of" calculations

- **Status**: Accepted (extended by [0054](./0054-on-behalf-target-visibility.md) — the named partner can now see and revise on-behalf rows; the free-text match is replaced by a partner-user picker)
- **Date**: 2026-06-04

## Context

An internal Arxys salesperson needs to run a sizing calc *for* a security partner — so the resulting submission, project grouping, and Pipedrive deal roll up to that **partner**, not to the rep. Previously every submission grouped and synced under `submissions.partner_id = auth.uid()`, so a rep's calc rolled up to "Arxys" and pointed the deal at the wrong company.

Constraints: the change must be RLS-neutral (creator-based insert/select policies keep working, admins already read across partners), the external partner self-serve experience must be untouched, and a calc directed at an existing partner must land in that partner's bucket alongside their own submissions. Internal users had no trustworthy identity in the data — `company_name` varies ("Arxys", "Arxys Tech") — so authorization could not key off a string.

## Options considered

- **Reassign `submissions.partner_id` to the target.** Rejected — breaks the `with check (partner_id = auth.uid())` insert policy, loses the creator/author record, and forces an RLS rewrite.
- **Company-string matching to detect internal users.** Rejected — `company_name` is unreliable as a security gate.
- **`is_internal` boolean flag + two additive on-behalf columns, creator unchanged.** Chosen.

## Decision

- `partners.is_internal boolean not null default false` — the authorization flag, set at invite time and retrofittable by an admin via the partners table.
- `submissions.on_behalf_of_partner_id` (FK → partners) and `submissions.on_behalf_of_company_name` (text). `partner_id` stays = creator. **At most one of the two is set** (a DB CHECK constraint enforces "not both"): the FK for a target matched to an existing partner, the text for a free-typed company with no partner row, both NULL for normal self-serve.
- Grouping key = `COALESCE(on_behalf_of_partner_id, lower(trim(on_behalf_of_company_name)), partner_id)`, centralised in `groupIntoDeals` so every consumer (dashboard, admin partner view, XLSX export) follows. A matched partner's on-behalf rows land in the same bucket as that partner's self-serve rows; free-typed companies group by normalised name.
- Authorization is enforced server-side in the calculator action: an on-behalf target is honoured only when the caller's `is_internal` is true; otherwise the field is ignored. The client flag is never trusted.
- **Free-typed (unmatched) target creates the Pipedrive org only** — no person, since there is no email to match on; a placeholder person would pollute Pipedrive. This required one narrow guard in `createDealFromSubmission` to skip `upsertPerson` when no email is supplied. A matched target builds the full `DealPartnerInput` from the partner's row (company, contact name, invite email read from `auth.users`).
- The internal rep is credited via a **pinned note** (`createDealFromSubmission`'s optional `onBehalfNote`), not the Pipedrive owner field.

## Consequences

**Positive:** RLS untouched; external partners unaffected; the DB enforces the data invariant; on-behalf calcs roll up correctly for matched and free-typed targets; the 13 existing `deal.test.ts` cases stay green (self-serve Pipedrive path unchanged).

**Negative:** an FK-only on-behalf row carries no inline display name, so an RLS-scoped reader (the rep's own dashboard) must resolve the target's name with a service-role lookup in the page loader — a small, scoped read, not an RLS change. Pipedrive owner is not routed to the rep.

**When to revisit:** if a third+ sales rep joins (build the portal-user → Pipedrive-user-ID owner map), or if external partners should *see* on-behalf projects created for them (overlaps with the deferred collaborator work).
