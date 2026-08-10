# 0118 — Pipedrive owner routed per creator, not always to one name

- **Status**: Accepted. Amends [0045](./0045-on-behalf-of-calculations.md), whose own
  "When to revisit" clause named this exact trigger. The codebase and JOURNAL have long cited
  a "ADR 0048" for the original "don't route the owner" decision — no such file exists; the
  actual decision lives in 0045 §Decision/Consequences. References in code have been corrected
  to point at 0045; this note exists so the dangling citation doesn't reappear.
- **Date**: 2026-08-10

## Context

Every Pipedrive deal the portal creates has always been owned by one fixed person —
`resolveOwnerId()` in `lookups.ts` resolves "Andy Newbom" by name (or `PIPEDRIVE_DEAL_OWNER_ID`
as an override), regardless of which portal user actually ran the calculator or which internal
rep it was created on behalf of. ADR 0045 named the internal rep on a pinned note instead of
routing ownership, and explicitly deferred real per-rep routing until "a third+ sales rep
joins," on the reasoning that a two-person team didn't justify a portal-user → Pipedrive-user-id
map.

Confirmed directly by Andy: only he and Richard Kershaw are actual Pipedrive users, and no one
else on the team will be. Other internal users (Marcos Busby and others retrofitted with
`is_internal` per the Phase 7 companion UI work) can create on-behalf submissions but are not
Pipedrive users and never will own a deal. So the mapping this needs is small, fixed, and
unlikely to grow — not the general N-rep problem ADR 0045 was avoiding building prematurely.

## Options considered

- **Two environment variables** (e.g. `PIPEDRIVE_OWNER_ID_ANDY` / `PIPEDRIVE_OWNER_ID_RICHARD`),
  matched against the creator's known portal email in code. Zero migration, matches the existing
  `PIPEDRIVE_DEAL_OWNER_ID` override pattern. Rejected — this is fundamentally per-partner data
  (the same shape as `is_internal` and `logo_path`), and putting it in env config instead of on
  the partner row makes it invisible to and uneditable from `/admin/partners`, unlike every other
  partner-scoped fact in this app.
- **Name-based matching** (compare the creator's portal display name against a Pipedrive user's
  name, the same pattern `resolveOwnerId()` already uses for "Andy Newbom"). Rejected on
  precedent, not on suspicion: ADR 0117 traced a real production bug (the `/projects` "mine"
  filter silently hiding whole partners' pipelines) to exactly this kind of string-identity
  matching. A stable id avoids the same class of bug here.
- **`partners.pipedrive_user_id`, a nullable integer set once on Andy's and Richard's own rows,
  admin-editable via `/admin/partners`.** Chosen.

## Decision

- One additive, nullable column: `partners.pipedrive_user_id integer`. Set only on the rows for
  people who are real Pipedrive users. Everyone else's row stays null.
- `resolveOwnerIdForCreator(creatorPipedriveUserId)` in `lookups.ts`: if the creator has a stored
  positive integer, use it directly as the deal owner — no Pipedrive API call, since the id is
  already what `/v1/deals` expects for `user_id`. Otherwise, delegate to the existing
  `resolveOwnerId()` unchanged (today's Andy / `PIPEDRIVE_DEAL_OWNER_ID` default).
- `createDealFromSubmission` takes a new optional `creatorPipedriveUserId` parameter and resolves
  owner through the new function instead of calling `resolveOwnerId()` directly.
  `calculator/actions.ts`'s `submitCalculation` reads `pipedrive_user_id` alongside `is_internal`
  in the same partners query it already runs for the caller, and threads it through at both
  deal-creation call sites (the normal create path, and the fallback-to-fresh-deal path when a
  source deal has gone uneditable).
- **Creation-only.** `updateDealFromRevision` is untouched — it already deliberately never
  resolves or sends `user_id`, `pipeline_id`, or `stage_id`, so a revision can never disturb a
  deal's owner. This decision doesn't change that; owner is decided once, at creation.
- **The pinned on-behalf note stays exactly as it was, unconditionally.** It names the rep and
  target regardless of whether that rep also became the deal's Pipedrive owner — a plain-text
  audit trail that doesn't depend on the owner field being correct or even present.
- **Anyone without a stored id falls back to today's default, unchanged.** Marcos, any other
  internal user, and every external partner's own self-serve submission — none of them get a row
  here, so none of their deals change owner.
- **`createComparisonDeal` (the VideoX compare tool's deal path) is untouched.** It has no
  creator-identity threading today and this decision doesn't add any — it stays on the global
  default owner. Revisit together if the compare tool ever needs the same routing.
- **A lookup failure never blocks deal creation.** This is now less of a concern than it was for
  the name-based default: a stored id is used directly, with no API call and therefore nothing to
  fail. The only remaining failure surface is the pre-existing `resolveOwnerId()` fallback path
  (env override malformed, or the Pipedrive user renamed/deactivated), which already throws today
  and is unchanged by this decision.

## Consequences

**Positive:** deals created by Andy or Richard are now owned by whichever of them actually ran
the calc, in Pipedrive's own owner field — not just in a note someone has to read. No Pipedrive
API call added to the hot path for the two people this actually affects. The mapping lives as
ordinary admin-editable data, consistent with `is_internal` and `logo_path`, not as a second,
harder-to-discover env-var configuration surface. Zero behavior change for anyone the mapping
doesn't cover.

**Negative:** the two numeric ids currently on file (Andy `6039322`, Richard `3464106`) were
supplied from memory, not verified against a live Pipedrive API call — this session's sandbox
has no network path to `api.pipedrive.com` (see the apply note). If either is wrong, deals for
that person misattribute to whichever real Pipedrive user that id belongs to — not a hard
failure, but worth the five-minute check the apply note describes before trusting it in
production. If Andy or Richard is ever deactivated/recreated in Pipedrive, their stored id goes
stale silently (no error, it just becomes someone else's or no one's) until someone notices and
corrects it via `/admin/partners` — the same staleness risk `PIPEDRIVE_DEAL_OWNER_ID` already
carries today, not a new one.

**When to revisit:** if a genuine third Pipedrive-user rep ever joins (add their row the same
way — no code change needed, just an admin edit); if the compare tool's deal path should get the
same routing; or if `createComparisonDeal` and `createDealFromSubmission` should share more of
this owner-resolution logic than they currently do (kept separate here to keep this change small
and scoped to the calculator's deal path, which is the one Andy asked about).
