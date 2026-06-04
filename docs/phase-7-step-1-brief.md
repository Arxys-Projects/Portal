# Claude Code Scoping Brief — Phase 7 Step 1: Internal "On Behalf Of" Calculations

**Model: Opus.** This is an additive schema migration + a new authorized write path + a partner-identity branch in the Pipedrive deal-create caller + RLS test additions. Judgment-heavy, touches auth scoping. Not a Sonnet job.

**Push discipline:** do not run `supabase db push` or `git push` without explicit confirmation. Hand back migration SQL for manual review first, per standing practice.

---

## Goal in one sentence

Let an internal Arxys user run a calculation *on behalf of* a security partner so the resulting submission, project grouping, and Pipedrive deal roll up to that **partner**, not to the internal user — without changing anything about how external partners use the calculator today.

---

## Background facts (already confirmed — do not re-investigate these)

- `partners` table: one row per company, columns include `company_name`, `role` (`admin`/`partner`), `status` (`active`/`invited`/`suspended`). Lives in `supabase/migrations/20260515193702_initial_schema.sql`. `is_admin()` requires `role='admin' AND status='active'`.
- `submissions.partner_id` = `auth.uid()` of the creator. This is the grouping key today. All RLS leans on `partner_id = auth.uid()`.
- Pipedrive deal-create (`src/lib/pipedrive/deal.ts` → `createDealFromSubmission`) takes a **`partner: DealPartnerInput { companyName, contactName, email }` as a separate argument**. It does NOT derive identity from the logged-in user. `upsertOrganization` matches Pipedrive org by exact name; `upsertPerson` matches by exact email; both create-if-absent. `resolveOwnerId()` is decoupled and always resolves to "Andy Newbom" (or `PIPEDRIVE_DEAL_OWNER_ID` env override).
- Project-name field is already a free-text `<input>` + native `<datalist>` (Phase 3 Step 4) sourced from the partner's prior project names.
- Grouping rollups live in `src/lib/pipeline/forecast.ts` (`groupIntoDeals`) and `src/app/(app)/admin/submissions/page.tsx` (`?groupBy=partner`).

---

## First investigation step (do this before writing code)

Read `src/app/(app)/calculator/actions.ts` and confirm:

1. Exactly how it currently builds the `DealPartnerInput` it passes to `createDealFromSubmission` (which fields, from which source — the logged-in partner row, `auth.users`, etc.).
2. Where `partner_id` is set on the `submissions` INSERT.
3. How it reads the caller's `partners` row (for the `status='active'` defense-in-depth check already present).

Report what you find in one short note, then proceed. If any of the "confirmed facts" above turn out wrong in the live code, STOP and flag before coding.

---

## Design decisions (locked — implement exactly this)

### Data model
Additive migration on `submissions`, two new nullable columns:

- `on_behalf_of_partner_id UUID REFERENCES partners(id) DEFAULT NULL` — set when the target is an existing partner row.
- `on_behalf_of_company_name TEXT DEFAULT NULL` — set when the rep free-typed a company that has no matching partner row.

Plus one new column on `partners`:

- `is_internal BOOLEAN NOT NULL DEFAULT false` — the authorization flag for who may run on-behalf calcs.

All additive. Every existing row: both submission columns NULL, `is_internal=false`. Zero behavior change for existing data. Provide a paired rollback at `supabase/rollback/phase-7-step-1-rollback.sql` (drops exactly the three columns) and run `scripts/backup-tables.ts` per the standing free-tier backup pattern before any push.

**State rule:** at most one of `on_behalf_of_partner_id` / `on_behalf_of_company_name` is set. Both NULL = normal partner self-serve. Prefer a single CHECK constraint enforcing "not both set."

### Authorization (the gate)
- Only a caller whose `partners.is_internal = true` may submit a calculation with either on-behalf field populated.
- Enforce this in the calculator Server Action (`actions.ts`): if the submit payload carries on-behalf data, re-read the caller's `partners.is_internal` server-side and reject if false. This is the authoritative check (defense-in-depth, same spirit as the existing `status='active'` guard). Do NOT trust a client flag.
- `submissions.partner_id` stays = the internal caller's `auth.uid()` (creator). The on-behalf columns carry the target. **Never repurpose `partner_id`.**

RLS: because `partner_id` remains the creator, the internal user's own RLS policies already permit the INSERT and let them SELECT their own on-behalf submissions. Admins already SELECT across all partners. **Do not add new RLS policies unless the investigation shows a gap.** If you believe a new policy is needed, STOP and explain why before writing it — new policies expand the RLS test matrix and are the highest-risk part of this change.

### UI — the target-partner field
- Renders ONLY when the logged-in user's `partners.is_internal = true`. Partners never see it.
- Same pattern as Project Name: a free-text `<input>` + native `<datalist>` sourced from all `partners` rows' `company_name` (an internal user can already read these — confirm via the existing admin/partner read path or service-role in the page loader; do not weaken RLS to achieve it).
- Free text allowed. On submit, resolve: if the typed value exactly matches a `partners.company_name` → send `on_behalf_of_partner_id` (that row's id). Otherwise → send `on_behalf_of_company_name` (the typed string).
- Show a subtle inline hint when the typed value has no partner match: "No matching partner — a new Pipedrive organization will be created." Non-blocking.
- Field sits next to Project Name in the calculator form's global-settings block. Label: "Partner (internal)" or similar — make it visually clear it's internal-only.

### Pipedrive behavior
No changes to `deal.ts`, `contacts.ts`, `client.ts`, or `lookups.ts`. All behavior comes from what `actions.ts` passes as the `partner` argument:

- **Matched partner** (`on_behalf_of_partner_id` set): build `DealPartnerInput` from the **target partner's** row — `companyName` = their `company_name`, `email` = their invite email (read from `auth.users` the same way `/admin/partners` already does), `contactName` = their contact name. Org + person bootstrap automatically.
- **Free-typed** (`on_behalf_of_company_name` set): build `DealPartnerInput` with `companyName` = typed string, and **omit person** (no email exists). `upsertOrganization` creates the org; do not invent a placeholder person. Confirm `createDealFromSubmission` tolerates a missing person — if it currently requires `contactName`/`email`, add a narrow branch so a free-typed on-behalf deal sends `org_id` without `person_id`. Keep the change minimal and inside `actions.ts` / a thin helper, not a rewrite of `deal.ts`.
- **Normal partner self-serve** (both NULL): unchanged — exactly today's path.
- **Owner field:** unchanged (deferred — see Phase 7 plan). Rep is credited via a note instead: post a pinned note "Created by {internal user name/email} on behalf of {target company}" using the same try/catch, non-blocking pattern `deal.ts` already uses for add-on notes. Decide whether to add this note inside `createDealFromSubmission` (cleaner) or in `actions.ts` after create returns the deal id — prefer wherever it touches the least existing tested code.

### Grouping
Update the grouping key to coalesce target-over-creator:

```
COALESCE(
  on_behalf_of_partner_id::text,
  lower(trim(on_behalf_of_company_name)),
  partner_id::text
)
```

- `src/lib/pipeline/forecast.ts` `groupIntoDeals`: group by this key instead of raw `partner_id`. A matched partner's on-behalf submissions land in the SAME bucket as that partner's self-serve submissions (both resolve to the partner's id). Free-typed companies group by normalized name. Self-serve is untouched.
- `src/app/(app)/admin/submissions/page.tsx` `?groupBy=partner`: same coalesce, and the displayed company label should prefer the resolved partner's `company_name`, falling back to the free-typed string.
- Add forecast tests covering: (a) on-behalf matched partner groups with that partner's self-serve rows; (b) free-typed company groups by normalized name; (c) two free-typed variants differing only in case/whitespace collapse to one group; (d) self-serve unaffected.

---

## Verification gates (all must pass before handing back)

- `npm run build` — clean, all routes in manifest.
- `npx eslint` on changed files — 0 errors.
- `npm test` — existing suite green + new forecast tests pass. The 9 existing `deal.test.ts` cases MUST remain byte-for-byte green (proves the self-serve Pipedrive path is untouched).
- `scripts/test-rls.ts` — run if service-role creds are available; if not, state explicitly that it wasn't run and argue why the change is RLS-neutral (no new policies). Add an RLS case only if a policy was added.
- Migration SQL review — additive ALTER + CHECK constraint, valid syntax. Rollback drops exactly the three columns.
- Language audit — run the `no-ai-slop` skill over any user-facing strings and the JOURNAL entry.

---

## Explicitly OUT of scope (do not build)

- Pipedrive deal **owner** routing per internal rep (needs a portal-user → Pipedrive-user-ID map; deferred; two-person team, Andy manages all deals).
- Tagging / sharing a calc with a real portal **user** (collaborator join table + new RLS). Deferred to a later Phase 7 step.
- Any change to the external partner self-serve experience.
- Any new RLS policy unless the investigation proves a concrete gap (STOP and flag first).

---

## Deliverables back to Andy

1. The migration SQL + rollback (for manual review — do not push).
2. Summary of changed files and what each does.
3. Confirmation of the investigation findings (how `actions.ts` builds `DealPartnerInput` today).
4. Verification gate results.
5. A drafted JOURNAL.md entry for this step (append-at-top, dated, with Work done / Detours & fixes / Verification gates).
6. Any new ADR if a non-obvious choice was made (e.g. the free-typed-deal-omits-person decision likely warrants one).
