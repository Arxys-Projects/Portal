# 0170 - One portal-built deal per project, guarded by a claim taken before the create

- **Status**: Accepted
- **Date**: 2026-10-23
- **Related**: 0093 (revision lineage), 0098 (value locked by attached products), 0118 (owner per creator), 0155 (deal-line ledger), 0165 (banked design), 0167 (server-only deal link), 0169 (project calcs make no Pipedrive call)

## Context

Step 5 creates a project calc's Pipedrive deal by id, with product lines (`createProjectDeal` in
`src/lib/projects/project-deal.ts`). A double click, or a create from a later revision of the same
calc, must never make a second deal; the portal's history has six recurrences of duplicate deals
(ADR 0093). `POST /api/v2/deals` has no idempotency key, so a create that times out may or may not
exist in Pipedrive.

Revisions are linked by `parent_submission_id`, which is `on delete set null`: deleting a middle
revision makes its child the root of a new chain, so a key on the lineage root alone can be split.
Options and phases (several calcs and deals per project) are out of scope for the MVP.

## Options considered

- **Check `submissions.pipedrive_deal_id` before creating.** Two clicks both see null; no guard.
- **Key on the lineage root only.** Stops double clicks and revisions; a deleted middle revision
  splits the chain and lets the child make a second deal.
- **Claim table with unique keys on the lineage root and on the project** (chosen). One extra table.
- **Search Pipedrive for a deal carrying the project id before creating.** Search is eventually
  consistent and costs the most API budget; it cannot stop two concurrent clicks.

## Decision

- New table `project_deal_claims` (migration `20261023000001`): unique `project_id`, unique
  `lineage_root_submission_id` (`on delete restrict`), the leaf `submission_id`, the
  `pipedrive_deal_id` once known, the confirmed preview fingerprint, `claimed_by`. RLS on; internal
  and admin read; only the service role writes.
- The claim is inserted after every read-only check (actor, calc, fresh preview against the confirmed
  fingerprint, org and person, pipeline, stage, `arxys_project_id` field, owner) and before
  `POST /api/v2/deals`. A unique violation is refused: "already has deal #N" when the claim holds a
  deal, "a deal may already exist, check Pipedrive" when it does not.
- **One portal-built deal per project in Step 5** (Andy, 2026-10-23). A deliberate scope cut.
- A create Pipedrive refused (a 4xx, or a 429 that outlasted the retries) wrote nothing, so the claim
  is deleted and the rep can try again. A create with no answer, a timeout or a 5xx may exist: the
  claim stays with no deal id and the portal never retries the create.
- Once a claim holds a deal id, a trigger refuses any change to it and any delete, for every role.
- A refusal for a claim with no deal id says "being created right now, reload in a few minutes"
  while the claim is under 15 minutes old (the other half of a double click), and "check Pipedrive,
  then ask Andy" after that.
- A stuck claim is resolved by Andy with `scripts/resolve-project-deal-claim.mts` (dry run by
  default, `--apply` plus typed CONFIRM, never writes to Pipedrive). It looks for deals carrying the
  project's id two ways: Pipedrive's deal search, which is index-backed and can lag, and the project
  org's deal list read directly (it stops if that list comes back without custom fields).
  `--attach-deal=<id>` records a deal that carries the project's id in `arxys_project_id`.
  `--release` deletes the claim only when it is at least 15 minutes old and neither read finds a
  deal. The 15 minutes is one constant shared with the refusal wording above.
- Only the leaf of a lineage builds the deal: a calc a later revision supersedes is refused.
- The deal: `owner_id` from `resolveOwnerIdForCreator` (ADR 0118). An actor with no
  `partners.pipedrive_user_id` gets the existing default: `PIPEDRIVE_DEAL_OWNER_ID` when set, else a
  v1 `/users` search for "Andy Newbom". That fallback is the one v1 call on this path, reused as
  Andy decided rather than added. `org_id` and `person_id` from the
  project's company and active primary contact (no name-based upsert), pipeline "Partner Projects"
  and stage "New Deal" resolved by exact name on every call (apart from `lookups.ts`, whose stage
  cache belongs to the partner path), `currency: "USD"`, never `value`, and the project id in
  `custom_fields` under the `arxys_project_id` field's code. A missing field refuses; the code never
  creates it, and it is not in `CUSTOM_FIELDS`.
- The deal id is recorded on the claim, then on `submissions.pipedrive_deal_id` as service role
  (ADR 0167), so My Pipeline and `groupIntoDeals` treat it like any deal.
- ADR 0098 retry note: a project calc never reaches `updateDealFromRevision`. The calculator returns
  before the Pipedrive block for every project calc (ADR 0169), and staff relink refuses a project
  calc, a child of one, and any row already linked to a deal. The note text is unchanged.
- Everything sits behind `PROJECT_DEAL_PRODUCTS` (`"true"` turns it on; default off).

## Consequences

**Positive:** a double click, a revision, a split lineage and a second calc of the same project all
refuse in the database, not in a read-then-write check. A timeout can never become two deals.

**Negative:** a project cannot have a second deal (an option or a phase) until this is revisited. A
create with no answer blocks the project until Andy runs the script. A claim, once it holds a deal,
can only be removed by dropping the trigger by hand.

**When to revisit:** when options and phases land (the project key becomes per option), or if
Pipedrive adds an idempotency key to deal creation.
