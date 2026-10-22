# 0166 - The submitCalculation snapshot harness runs the real clients against a fake fetch

- **Status**: Accepted
- **Date**: 2026-10-22
- **Related**: 0165 (the side table), 0020 (Pipedrive failure never fails a save), 0040 (revisions update the deal in place)

## Context

Step 4 changes `submitCalculation`, the one server action behind the full calculator and Quick
Calc. The partner path must stay byte-identical: the `submissions` row, the Pipedrive payloads and
the sales notification. The golden tests cover the math only, and nothing tested the action end to
end, so a baseline had to be captured on the unmodified HEAD before Step 4 touched the action.

The action builds its own Supabase clients from `next/headers` cookies, imports `server-only`
modules, renders a PDF, sends mail, and calls Pipedrive through `fetch`. The test runner is
`tsx --test` (node:test), with no Jest or Vitest in the project.

## Options considered

- **Add seams to `submitCalculation`** (inject clients): clean to test, but it changes the code
  before the baseline exists, so it cannot be the baseline.
- **Mock the wrapper functions** (`createDealFromSubmission`, the `.insert()` call): records what the
  action passes in, but misses how the libraries serialize it, which is what reaches Supabase and
  Pipedrive.
- **Real supabase-js and the real Pipedrive client against a fake `fetch`** (chosen): the recorded
  bodies are the actual request bytes. Needs module mocks only for the Supabase client factories,
  `server-only`, the PDF render call and `sendSubmissionNotification`.
- **Module mocking tool**: add Vitest vs node:test's `mock.module`. `mock.module` needs no new
  dependency, but is experimental and needs `--experimental-test-module-mocks` (Node 25.8 here).

## Decision

- `src/app/(app)/calculator/submit-calculation.snapshot.test.ts` records every Supabase request
  (method, path and query, `Prefer`, which key sent it, raw body), every Pipedrive request (token
  redacted, raw body), the PDF render input (logo and hero data URIs as digests), the
  `sendSubmissionNotification` arguments, `console.warn` / `console.error`, and the returned state.
  Fixtures live in `__snapshots__/submit-calculation.json`.
- Seven scenarios of today's paths: partner full calculator, Quick Calc, a partner sending Step 4's
  `projectId` and `systemDesign` (must equal the plain partner save), partner revisions with and
  without a source deal, and internal on-behalf saves by partner pick and by company name.
- Deterministic by construction: TZ is UTC, `Date` is frozen at 2026-10-22 17:00 UTC, ids come from
  the fake database, and the Pipedrive lookup cache is reset between scenarios. Each scenario must
  save (`status: "ok"`), so a broken fake cannot pass by snapshotting an error.
- `npm test` passes `--experimental-test-module-mocks`. The flag only enables the API; the other
  984 tests are unchanged. `UPDATE_SUBMIT_SNAPSHOTS=1` rewrites the fixtures, and is only for a
  commit whose partner path is the reference.
- Captured on `029bb87` and committed alone (`08749e6`) before any Step 4 change. Two captures were
  byte-identical, and changing one character of the saved row failed all seven scenarios.
- Re-baselined the same day (`b8925f6`) on the merge of `origin/main` (`4c3550e`), still before any
  Step 4 change. Another session's `7268cdf` moved the account check to `requireActive()`, turning
  one `partners` read into two. A diff across all seven scenarios showed that read as the only
  change; the row, the Pipedrive requests, the email and PDF arguments, logs and results were
  byte-identical. The rule for any future re-baseline is the same: diff first, and re-record only
  when every difference is explained by a change made outside Step 4.

## Consequences

**Positive:** "the partner path is unchanged" is a test result at the byte level, covering the row,
the deal payloads, the notes and the email together. The same harness can carry Step 4's own
project-calc tests.

**Negative:** it relies on an experimental Node API whose flag or behavior may change. The fake
database honors only `eq` and `ilike` filters and plain column lists, so it does not prove a query
selects the right rows in Postgres. A deliberate change to the partner path means regenerating the
fixtures and reviewing the diff.

**When to revisit:** if Node drops or renames the flag, or the project adopts Vitest for other
reasons.
