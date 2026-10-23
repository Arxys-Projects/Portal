# 0172 - The Phase B script saves the test calc as the rep through a one-time sign-in

- **Status**: Accepted
- **Date**: 2026-10-23
- **Related**: 0164 (every entry point checks an active partner), 0165 (banked design), 0167 (submissions write guard), 0169 (project calc saves), 0170, 0171

## Context

Step 5 Phase B is one live end-to-end test: save a project calc through the real `submitCalculation`,
then preview, create the deal, and read it back. No screen sends a project calc yet, so production
has none. `submitCalculation` is a server action: it reads the rep's session from request cookies
(`createSupabaseServerClient`), checks the account (`requireActive`), and writes the row and its
project link as that session, under RLS and the ADR 0167 guard. A script has no cookies.

There is also no project row yet (nothing creates projects before the screens), and the Escambia
calc (`59b730df`) is a legacy calc, which a project calc cannot revise.

## Options considered

- **The rep saves it in the app.** The real path, but no screen sends `projectId` until the UI work.
- **Run the action with the service-role client posing as the session.** Saves the same columns,
  but skips RLS and the guard on the rep's writes, so it does not test the path Phase B is for.
- **Sign the rep in from the script with a one-time token** (chosen). The service role asks Supabase
  for a magic-link token for the rep's account (`auth.admin.generateLink`, which sends no email), the
  script exchanges it for a session in memory (`verifyOtp`) and hands that client to the action
  through a module mock. RLS and the guard apply exactly as in the browser. No password is used.
- **Ask Andy for his password and sign in with it.** Never: credentials stay out of scripts and chats.

## Decision

- `scripts/project-deal-phase-b.mts` runs one step per invocation: `check` (read-only), then
  `create-field`, `create-project`, `save-calc`, `create-deal`, `retry-lines`, each needing
  `--apply` and a typed CONFIRM after it prints exactly what it will write; `preview` and `verify`
  are read-only.
- The script acts as Andy's account only (`--as` is refused), and only while it is active with
  `is_internal = true`: `submitCalculation` honours the project fields for `is_internal` alone, so an
  admin who is not internal would be saved as a partner calc with a deal made by name (review gate
  A-1 / S-1). After the save, a result that is not a project calc in the named project is reported
  as a failure.
- `save-calc` signs in only with `--apply` after CONFIRM, and signs that session out on normal exit,
  on errors and on Ctrl-C (this session only, so Andy's browser sessions stay signed in; a killed
  process leaves a session that lived only in its memory, and its access token expires within the hour).
  `--design` is required, so recorders-only (`{}`) is a choice, never a default. It refuses
  when the project already has a calc unless `--again` is passed, and its dry run names the partner
  login that will see the calc, if any.
- `create-deal` prints the whole deal header before CONFIRM and warns when another submission for
  the same job already has a deal. `verify` checks the diff, the deal header (pipeline, stage, org,
  person, owner, USD, `arxys_project_id`), the ledger against the deal, each line's price, the deal
  value against Pipedrive's own line sums, and the calc's deal link; it also reports whether the deal
  search and the org's deal list show the project id, which the stuck-claim script relies on.
- The test calc is a fresh project calc with the Escambia calc's groups and settings
  (`fromStoredSubmission`), in a new project row for its company and the contact Andy names. The
  legacy calc is not changed.
- `PROJECT_DEAL_PRODUCTS` is set to `"true"` inside the script's process only; production stays off.
- The script mocks `server-only`, `next/cache` and `@/lib/supabase/server` with Node's module mocks
  (`--experimental-test-module-mocks`), the same technique as the ADR 0166 harness.

## Consequences

**Positive:** the save runs through the same code, RLS and guard as the rep's browser, so Phase B
tests the path the screens will use. Every live write is its own approved step.

**Negative:** the script holds a way to sign in as a staff account with the service-role key. It is
limited to Andy's own account, active and internal, a typed CONFIRM and Andy running it. Supabase
records the sign-in, and the magic-link token replaces any password-reset link Andy had pending. The project row is written by the service role, not a rep session, because no
screen creates projects yet.

**When to revisit:** when the screens can create projects and send project calcs; the script's
`create-project` and `save-calc` steps then retire.
