**Model:** Opus 5.5 (re-check the current Opus tier before starting) · **Effort:** high
**Why Opus:** a new server-only write path, RLS on a new table, and a partner path that must stay bit-identical. **Why high and not xhigh:** the design is already locked in the brief and in this prompt, so extra deliberation adds time without catching more. Run the review gate subagents (security and architect) at their own settings.

# Claude Code prompt: Project Portal backend, Step 4 (calc save integration, server side)

Read `docs/Portal-Project revamp/claude-code-brief-project-portal-backend.md` in full, then `AGENTS.md` and the files the brief lists under "Read first". Execute **Step 4 only**. Previous step: JOURNAL 2026-10-19 "Project Portal backend, Step 3: pure engines" (ADRs 0158 to 0163) and the brief's "Step 3 results" section. Do not start Step 5.

**Baseline audit findings.** The audit reports are **not on `main`**. As of `029bb87` they live only on branch `claude/group-1-audit-preflight-n8s0yw`. Read them from there without checking it out: `git ls-tree -r --name-only refs/heads/claude/group-1-audit-preflight-n8s0yw docs/reviews/`, then `git show refs/heads/claude/group-1-audit-preflight-n8s0yw:docs/reviews/BASELINE-BACKLOG.md` and the slice reports. If `docs/reviews/` has been merged to `main` by the time you start, read it there. Before coding, say in one line per row which findings affect this step. At minimum, check the status of these rows:

- **B1-S-2 / B1-A-1** (open at `029bb87`): `authenticated` has table-wide INSERT and UPDATE on `submissions`, so a partner can write `on_behalf_of_partner_id`, `pipedrive_deal_id` and the banked figures. The backlog says this fix "must ship before Project Portal Step 4". **This is the Phase B gate** (see Phase A item 4). It is fixed in its own session. Do not fix it in this step.
- **B1-S-13** (open, "before Step 4"): a partner can plant a row in another partner's pipeline via `on_behalf_of_partner_id`. Closed by the same guard as B1-S-2. Same gate.
- **B2-S-10 / B2-A-12**: service-role name lookups trust `on_behalf_of_partner_id`. Closed by the same guard. Note it, do not fix it here.
- **B1-S-7 / B1-A-9**: `scripts/test-rls.ts` counts any error as a denial. The new cases in Phase A item 3 must check for `42501` explicitly.

## Working style for this session

- The decisions below are made. Do not reopen them. Where two options both satisfy the brief, pick the simpler one and record it in one line in the ADR.
- No new abstractions, no refactors outside the listed files, no UI, no Pipedrive calls.
- Prefer the existing helpers and patterns in `src/app/(app)/calculator/actions.ts`, `src/lib/calculator/*` and `src/lib/projects/*` over new code.

## Phase A: harness and migration (then STOP)

1. **Freeze the baseline first.** Before changing any source, run the golden tests, `src/lib/recommend/*.test.ts` and the full unit suite on the clean tree, and record the results. Then build the snapshot harness described in Phase B item 10 and capture its output **on unmodified HEAD**. Commit the harness and its captured fixtures on their own before touching `submitCalculation`. The later byte-identical claim means nothing without this.
   - The harness mocks the Supabase client, the Pipedrive client, the PDF render and `sendSubmissionNotification`, and records what each receives. It freezes the clock (fake timers) and stubs every generated id, so the captured `submissions` row, Pipedrive payloads and email arguments are deterministic. Run it twice on HEAD and confirm the two outputs match before committing the fixtures.
2. **Side table migration plus rollback**, written and not applied. Recommended shape (verify against the code and record the final shape in an ADR, numbered from 0165, check the number is free right before writing):
   - `submission_system_designs`: `submission_id` (unique, references `submissions`), `resolved_design` jsonb, `rules_snapshot` jsonb, `bom` jsonb, `engine_version` text, `created_by`, `created_at`.
   - RLS on, SELECT for `is_internal(auth.uid()) OR is_admin(auth.uid())` only. **No INSERT, UPDATE or DELETE grant for `authenticated`**, and revoke the default grants explicitly. Written only by server code using the service role, after the caller is checked as owning the submission. Never bank any of this on `submissions` (ADR 0158, security finding S-1).
   - **Write rule: insert once per submission, never update.** Checked at `029bb87`: an edited calc is saved as a new `submissions` row with `parent_submission_id` set to the source (`calculator/actions.ts:401, 476`), and the source row is not changed. So each banked design belongs to exactly one stored calc. Re-check this against the code before writing the ADR, and state the rule there.
3. **RLS test** in `scripts/test-rls.ts`: a partner and an internal non-admin cannot INSERT, UPDATE or DELETE the table; a partner cannot SELECT it; internal can SELECT. Each denial case checks for error code `42501` explicitly (B1-S-7), so a different error never passes as a denial. Write it, do not run it against production. **Never run `scripts/test-rls.ts` or any script that touches production.** Andy runs it after he applies the migration. Running the new migration and the cases in PGlite in the scratchpad is fine and encouraged.
4. **STOP.** Report the migration path, the rollback path, and the apply steps for Andy. Phase B starts only after **both** gates below pass, either later in this session or in a continuation session whose kickoff line points to this phase:
   - Andy confirms the side table migration is applied and the live RLS suite passes.
   - The `submissions` column guard for **B1-S-2 / B1-A-1 and B1-S-13** is merged on `main` and its migration is applied. Check this yourself in the backlog and `git log` (status "fixed" with a commit on `main`). If it is still open, say so in the report and do not start Phase B.

## Phase B: server integration

5. **Request shape.** `submitCalculation` accepts optional `projectId` and `systemDesign`. Honor them **only** when the caller is internal and the project exists, both verified server side. For anyone else, ignore them and run today's path unchanged. Validate the whole `systemDesign` object with zod at the boundary, with a length cap on every SKU text field.
6. **Engines.** Call `resolveSystemDesign`, then `sizeProjectDesign` with the same `totals` the partner path passes to `recommend()` and each computed group's `storageGb` and resolved `retentionDays`. Load the management and workstation dropdown SKUs for `catalog` on the server from active products. Never take the catalog, a snapshot or a BOM from the request. Add `rack_units` and `sfp_addon` through a **project-only pool loader**, so the partner query stays byte-identical. On `ok: false`, log the error server side and return a plain message for the rep. Never return engine internals.
7. **Persist.** Write the submission as today, then bank the resolved design, rules snapshot and BOM in the side table, server side only. Display and reopen from the banked design. Re-resolve only on a new save.
8. **Project link and attribution.**
   - Insert the `project_submissions` row (`calc_role = 'primary'`).
   - **Only project calcs write `input_state` version 4.** Partner and Quick Calc saves keep writing version 3 exactly as today, or the snapshot in item 10 fails: `INPUT_STATE_VERSION = 3` (`src/lib/calculator/rehydrate.ts:45`) is stamped on every row at `calculator/actions.ts:379`, so bumping that shared constant changes every partner row. Add a separate project version constant (or pass the version in), and teach the normalizer to read v4. It defaults v1 to v3 rows unchanged. Bump `calc_version` only if banked figures change, and say whether they did. Any `calc_version` bump applies to project calcs only, for the same reason.
   - For project calcs, the project's company and primary contact replace the on-behalf picker (ADR 0152). Never write `on_behalf_of_company_name`. Set `on_behalf_of_partner_id` to the primary contact's linked login only when exactly one linked login exists, verified server side as active and non-internal, the same check today's picker gets. With none or several, leave it null.
   - Scope the 14-day duplicate guard to the project for project calcs.
   - Keep the old failover and management add-on booleans readable for legacy rows. Project calcs use system design instead.
   - **Revising a project calc.** A revision is a new row (Phase A item 2), so it gets its own `project_submissions` row as `'primary'` and the source row's link stays as it is. The current calc of a project is the newest row in its `parent_submission_id` lineage; record that rule in the side table ADR. Server side, read the source's project link with the service role (`project_submissions` is internal-only, so a partner session cannot see it). If the source is linked to a project:
     - the revision is a project calc and takes the project from the source; a request `projectId` that differs is refused with a plain message;
     - a non-internal caller is refused with a plain message. This matters because a contact's linked login can read the project calc through `on_behalf_of_partner_id` (ADR 0152), and the source has no `pipedrive_deal_id`, so letting it through the partner revise path would create a deal by the old name-based upsert. No project calcs exist today, so partner snapshots are unaffected.
9. **Pipedrive and email on save.** Read what `submitCalculation` does today for the Pipedrive deal and the sales notification. Step 5 owns deal creation for project calcs, behind `PROJECT_DEAL_PRODUCTS`. Defaults for this step:
   - A project calc saves the row, the link and the banked design, and makes **no** Pipedrive call, on a fresh save or a revision, so the old name-based upsert and the revise path never run for a project. If that cannot be separated cleanly from the shared path, stop and flag it to Andy instead of working around it.
   - **A fresh project calc emails sales@arxys.com only** (Andy, 2026-10-22). Today `sendSubmissionNotification` (`src/lib/email/submission-notification.ts:122`, called at `calculator/actions.ts:581`) sends two messages: the sales notification to `env.INTERNAL_NOTIFICATION_EMAIL`, which is `sales@arxys.com` (`docs/RUNBOOK.md:50`), with the PDF attached and the ADR 0015 BCC; and a "Your Arxys Video Storage Report" copy to `partnerEmail`, which is the logged-in user (`calculator/actions.ts:510`). For a project calc, keep the sales message as it is and pass no `partnerEmail`, so the second message is skipped. Keep using the env var; do not hardcode the address. Step 6 owns the customer's "Quote ready" email. A revision sends none, as today. Record this in the no-Pipedrive-call ADR.
   - Add no live write of any kind. Tests mock the Pipedrive client, SMTP and the PDF render.
10. **Prove the partner path is unchanged.** Snapshot tests, using the harness captured on HEAD in Phase A, must show that a full-calculator partner save and a Quick Calc save (`quick-calc-form.tsx:163` goes through `submitCalculation`, so one harness covers both) produce byte-identical `submissions` rows (including `input_state.version` 3), byte-identical Pipedrive payloads and identical sales-notification arguments against mocked clients. Cover a partner revision too. Also test: an internal save with `projectId` and `systemDesign` (no Pipedrive call, sales notification sent to `INTERNAL_NOTIFICATION_EMAIL` with no `partnerEmail` copy, `input_state.version` 4); a partner who sends `projectId` and `systemDesign` anyway (both ignored, row identical to a plain partner save); a nonexistent `projectId`; an SFP+ calc that would have picked V200; zero, one and several linked logins on the primary contact; the duplicate guard scoped to a project; an oversized SKU string; an `ok: false` sizing result; an internal revision of a project calc (new row linked as `'primary'`, source link untouched, no Pipedrive call, no email); a revision with a `projectId` that differs from the source's project (refused); a non-internal caller revising a project calc (refused, no Pipedrive call).

## Gotchas

- Parallel sessions share this checkout. Run `git status` and `git rev-parse HEAD` at the start, record the hash, and review only the committed state if the tree is dirty with changes you did not make.
- The tree has untracked files that are not yours (at `029bb87`: `Claude outputs/`, `skills/`, and this prompt file). Stage only the paths you wrote, by name. Never `git add -A` or `git add .`.
- ADR numbers: next free is 0165 per the brief. Verify before writing each one.
- The ownership check and the service-role write must live in one server function, so no code path writes the side table without the check. Put a test on that function.
- Never print a secret value. Name its location and redact it.
- Warnings from `sizeProjectDesign` (different add-ons on failovers, GPU with a non-supported VMS) must reach the rep in the save result.

## Standing rules that apply here

- No `git push`. Commit locally at the end of each phase. Andy reviews and pushes.
- No `supabase db push`, no live Pipedrive, Supabase, Vercel or email writes.
- No price math in the portal UI. This step adds no prices anywhere.
- RLS changes are stop-and-flag: Phase A ends at that gate.
- JOURNAL entry per phase. ADR for every non-obvious choice (side table shape and write rule, the project-only pool loader, the no-Pipedrive-call default for project saves).
- No em dashes and no "not X, but Y" constructions in any prose you write (JOURNAL, ADRs, comments, messages).

## Out of scope

The `submissions` column guard for B1-S-2 / B1-A-1 and B1-S-13 (its own session; it gates Phase B), UI screens and screen server actions, `PROJECT_DEAL_PRODUCTS` and any deal creation (Step 5), the quote gate and notification (Step 6), renaming `/projects`, the intake form, options and phases UI, migrating legacy submissions, deleting the leftover "RLS Hijack Co" test persona (a database write; remind Andy in your report and leave it), and any change to the partner path. The revision refusal in Phase B item 8 applies only when the source is a project calc, so it leaves today's partner saves and revisions as they are.

## Finish

After Phase B, run the review gate (`review-gate`: architect-review and security-review as fresh subagents on the Step 4 diff). Fix what it confirms, rerun the affected tests, then:

1. Update the brief: mark Step 4 done with the date, add a "Step 4 results" section (what was built, ADR numbers, decisions, what is unverified), and update the Status line and next free ADR number.
2. Write the JOURNAL entry (Work done, Detours and fixes, Decisions captured).
3. Commit locally.
4. Report: what changed, tests run (full unit suite and `tsc`, golden and recommender results before and after, snapshot harness results), the review gate verdict, and what is unverified. Then stop and wait for Andy before Step 5. The next gate is before any live Pipedrive write in Step 5.
