**Model:** Opus 5.5 (re-check the current Opus tier before starting) · **Effort:** high
**Why Opus:** a trust gate on partner-priced documents, migrations on tables partners can read, and a customer-facing send. **Why high and not xhigh:** the design is locked here and in the brief. Run the review gate subagents at their own settings.

# Claude Code prompt: Project Portal backend, Step 6 (quote gate, "Prepared for", quote email)

Read `docs/Portal-Project revamp/claude-code-brief-project-portal-backend.md` in full, then `AGENTS.md` and the files the brief lists under "Read first". Also read ADRs 0083, 0152, 0155, 0169, 0170, 0171, 0172, the baseline backlog row B1-S-4 in `docs/BASELINE-BACKLOG.md`, `src/lib/project-quote/generate.ts`, `src/lib/projects/line-items.ts` and the Step 5 fingerprint helper. Execute **Step 6 only**. Previous step: JOURNAL 2026-10-23 "Project Portal backend, Step 5 Phase B" (ADRs 0170 to 0172). Do not start Step 7 or any screen.

## Working style

- The decisions below are made. Do not reopen them. Where two options both satisfy the brief, pick the simpler one and record it in one line in the ADR.
- No UI, no screen server actions, no new abstractions, no change to the partner path. Reuse the Step 5 pattern: server functions that check the actor themselves, take `deps`, and read only from the portal's own records.
- Run `git status` and `git rev-parse HEAD` first and record the hash. If the tree is dirty with changes you did not make, say so and build on the committed state.

## Phase A: migrations, written not applied (then STOP)

1. **B1-S-4 pin trigger** on `project_quotes` (BEFORE INSERT): the deal id must equal the submission's deal, and the version must be max+1 for that **submission**. Versioning is per submission: the existing key is `project_quotes_submission_version_key unique (submission_id, version)`, and revisions share their source's deal (ADRs 0040, 0173), so a per-deal max+1 would refuse a revision's first quote. Do not add a (deal id, version) key. Make it `SECURITY DEFINER` with `search_path = ''`, because it reads `submissions` and `project_quotes` and must not depend on the caller's RLS. Before writing it, read how `generate.ts` computes the version (`pipedrive_deal_id` is `not null`), and let legacy and partner-path inserts pass unchanged. The existing unique (submission_id, version) key means two reps generating at once cannot take the same version; `generate.ts` already re-assembles once on a 23505. Phase B maps a 23505 that survives that retry to a plain "another quote was just generated, try again" message. Rollback file. This closes baseline row B1-S-4.
2. **Send log** `quote_email_sends`: `project_quote_id` (references `project_quotes`, no delete), `to_email`, `sent_by`, `status`, `error`, `created_at`. CHECK `to_email = lower(to_email)` and CHECK `status IN ('sending','sent','failed')`. Unique on (`project_quote_id`, `to_email`) so a double click cannot send twice. Internal SELECT only, no INSERT, UPDATE or DELETE grant for `authenticated`, written by server code only, as in ADR 0171. A `failed` or crashed `sending` row blocks that address until Andy clears it with a one-off script modeled on `scripts/resolve-project-deal-claim.mts` (ADR 0170). Write that script in Phase B. Rollback file.
3. **Lock down `quote_pricing_confirmations`** in the same migration. ADR 0155 let internal sessions INSERT as themselves, so any rep could post a confirmation with an arbitrary fingerprint over REST and bypass the gate. ADR 0171 closed the same hole on the ledger. Drop the internal INSERT policy and grant, keep SELECT, and write rows from server code only (service role, after the actor check). Amend ADR 0155. Rollback file.
4. **Tests.** RLS cases in `scripts/test-rls.ts`: a partner and an internal non-admin cannot write the send log; an internal session cannot insert a confirmation; the pin trigger refuses a wrong deal id and a skipped version for internal and admin. Also PGlite tests on the real migrations: existing rows, a legacy-shaped insert, and two concurrent inserts. Write the live ones, do not run them. **Never run `scripts/test-rls.ts` or any script that touches production.**
5. ADR numbers from 0174 (0173 is the revise fix). Check each is free right before writing.
6. **STOP.** Report the migration paths, rollbacks and apply steps. Phase B starts only after Andy confirms all three: the migrations are applied, the live RLS suite passes, and a partner-path Project Quote generate-and-download works on the applied trigger.

## Phase B: server code behind flags

Two flags, both default off: `PROJECT_QUOTE_GATE` (the pricing gate) and `PROJECT_QUOTE_EMAIL` (the send).

7. **What counts as portal-built.** A deal is portal-built when the portal's own records say so: a `project_deal_claims` row or `deal_line_syncs` rows for the quote's deal id (Step 5). Never decide it from a Pipedrive field or a title. If the claim or ledger read errors, refuse. Never fall through to legacy behavior. Legacy and partner deals keep today's behavior, including the existing empty-deal guard, unchanged.
8. **`confirmDealPricing(deps, dealId, shownFingerprint, actor)`.** Internal or admin actor, checked inside. It reads the deal's current lines from Pipedrive (v2, every page; any read error refuses), normalizes them with `src/lib/projects/line-items.ts`, and refuses if the fresh fingerprint differs from the one the rep was shown. Refuse unless every `deal_line_syncs` row for the deal is `added` and `diffDealLines` reports no missing, extra, quantity or role difference, and refuse a deal with no lines, so a partial sync can never be confirmed. On success, insert the `quote_pricing_confirmations` row with the service role, carrying the fingerprint and the exact lines it was computed from. The fingerprint must cover product id, quantity, `item_price`, discount and role, so a discount edit in Pipedrive changes it. Verify `line-items.ts` and the Step 5 helper do. If a field is missing, extend the helper additively and keep every Step 5 test and the Step 5 preview results unchanged, so the portal keeps one fingerprint format. "Latest confirmation" means ordered by `created_at desc, id desc`. A rep confirming means the rep set discounts in Pipedrive first. The portal does no price math.
9. **The gate in Project Quote generation.** For a portal-built deal, generation reads the deal's lines **once** (all pages, fail closed on any error), compares them with the latest confirmation's fingerprint, and renders the PDF from those same lines, passed as an argument. Verify that `generate.ts` and the PDF renderer do not fetch lines again. A mismatch or no confirmation refuses with a plain message telling the rep to confirm again. Store the confirmation id and fingerprint in the quote's snapshot. With the flag off, generation behaves as today. Before this phase ends, list every external call `generate.ts` makes (Pipedrive attach, note, stage, storage, email) in the report.
10. **"Prepared for".** When the submission is linked in `project_submissions`, read the company and primary contact from the project tables and snapshot them into the quote. Otherwise fall back to the 2026-10-15 resolver unchanged. Never resolve a project's company by name.
11. **`sendQuoteReadyEmail(deps, projectQuoteId, actor)`.** Internal or admin actor. An explicit rep action, never triggered automatically by generation.
    - Refuse unless the quote's snapshot carries a Prepared-for project contact and, for a portal-built deal, a confirmation id. Take the recipient from that snapshot, lowercased. Refuse when the contact is inactive or has no email.
    - Attach the PDF from the stored quote. Include a portal link when the visibility rule from ADR 0152 holds for this contact (reuse that function, do not copy its logic), and an access-request link otherwise.
    - Insert the send-log row as `sending` before the SMTP call, so a second call finds it and stops, then mark `sent` or `failed`. A send with no answer is never retried automatically. No resend in this step.
    - Use the existing SMTP path and template style in `docs/email-templates`. Before using the SMTP helper, verify it adds no CC, BCC or reply-to defaults, and say what it does add.
    - The recipient override for the live test is an optional field on `deps`, constructed only in `scripts/`, never read from env, request data or a flag in app code. The log's `to_email` records the address actually used.
12. **Email copy.** Plain, short, and written to a partner contact as a peer. Guide and point, for example what is attached and where to find it in the portal. Do not instruct their day-to-day work, do not mention competitors, and use no em dashes and no "not X, but Y" constructions.
13. **Small carry-ins.** Fix the admin delete message that maps every 23503 to "a quote has been generated" (Step 5 open item): name the real cause (quote, deal claim or ledger rows). Record the Step 4 A-5 decision in the ADR: the save-time sales email and its PDF stay as they are (internal, recorders only), and the "Quote ready" email is the partner-facing one.
14. **Tests with mocks.**
    - Gate: no confirmation; matching confirmation; a line price edited after confirmation; a discount edited after confirmation; a second confirmation after an edit; empty deal; a deal with a `failed` ledger row; a second page of lines; a Pipedrive read error (refuses); a claim read error (refuses); legacy and partner deal unchanged with the flag on and off; the single-read property (a line changing between calls cannot pass the check and still render); a 23505 maps to the plain message.
    - Confirm: fingerprint mismatch; non-internal actor; direct insert by a session is impossible (covered in Phase A RLS).
    - Prepared for: project submission, legacy submission, inactive primary contact.
    - Email: flag off; non-internal actor; a quote with no confirmation id on a portal-built deal; recipient taken from the snapshot, not re-read live; contact with exactly one linked login, none, and several; mixed-case address; double call sends once; SMTP failure marks `failed` and does not resend; the override is absent in app code paths.
    - Partner path and the Step 4 snapshot harness unchanged.

## Phase B review gate, then STOP before any live write

Run `review-gate` on the Phase B diff. Fix what it confirms, rerun affected tests, commit locally, and **STOP**. Report the exact live steps, every external call they make (including the `generate.ts` list from item 9), and the final To, CC and BCC list the email will use. Wait for Andy's go for each write below separately.

## Phase C: live, one write at a time, each approved by Andy

The test deal is #5589, whose primary contact is **Ken Fuller, a real customer contact (person #9221). Never email him from a test.** The live script (`scripts/`, dry run by default, typed CONFIRM per write) requires an explicit recipient, prints the final To, CC and BCC list before CONFIRM, and inserts no log row on a dry run.

1. `confirmDealPricing` on #5589 (writes one confirmation row).
2. Generate the Project Quote with the gate flag on (writes the quote and whatever else item 9 listed).
3. Andy edits a line price in Pipedrive by hand, you confirm the gate now refuses, then confirm again. Then Andy restores the original price and either runs a fresh `confirmDealPricing` or decides to leave the deal as is. Do not leave a real deal with a hand-edited price.
4. `sendQuoteReadyEmail` once, to the address Andy names. Andy confirms it arrived with the PDF and the right link.
5. Leave `PROJECT_QUOTE_GATE` and `PROJECT_QUOTE_EMAIL` off in production. Andy turns them on.

## Standing rules that apply here

- No `git push`. Commit locally at the end of each phase. Andy reviews and pushes.
- No `supabase db push`. Migrations plus rollbacks, Andy applies them. RLS changes are stop-and-flag.
- No live Pipedrive, Supabase, Vercel or email writes without Andy's go-ahead for that specific write. Never print a secret value.
- No price math in the portal UI. Prices shown or sent come from Pipedrive, passed through verbatim.
- JOURNAL entry per phase. ADR for every non-obvious choice.
- No em dashes and no "not X, but Y" constructions in any prose you write.

## Out of scope

Screens, a resend action, automatic sending, options and phases, changing the save-time sales email, any change to the partner path.

## Finish

1. Update the brief: mark Step 6 done with the date, add a "Step 6 results" section, and update the Status line and next free ADR number.
2. Write the JOURNAL entry (Work done, Detours and fixes, Decisions captured).
3. Commit locally.
4. Report: what changed, tests run (full suite, `tsc`, Step 4 snapshot harness), the review gate verdict, the live outcome, and what is unverified. Then stop and wait for Andy before Step 7.
