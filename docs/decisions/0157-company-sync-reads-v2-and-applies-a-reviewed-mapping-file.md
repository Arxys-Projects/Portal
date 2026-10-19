# 0157 — The company sync scans Pipedrive v2 read-only, and aliases and links come only from a reviewed mapping file

- **Status**: Accepted
- **Date**: 2026-10-16
- **Related**: 0153 (companies and contacts keyed by Pipedrive id), 0156 (include list), 0150 (v2 product reads)

## Context

Step 2 fills `companies` and `contacts` from Pipedrive and proposes how the portal's free-typed
company names and partner logins map onto them. Step 0 found the v2 org list has no label filter,
v1 org and person endpoints are out of support, and name-based upserts created duplicate orgs. A
wrong alias or login link silently changes what a project shows and who sees which quote, so the
mapping needs a human check before it is written.

## Options considered

- **Org selection**: saved filter #44 (returns 16 of 62, unusable) vs a full v2 scan filtered in code
  on `label_ids`, plus the include list.
- **Login → contact**: by name (the failure Step 0 found) vs by email, exact and case-insensitive,
  checked against the company the login's own company name maps to.
- **Writing the mapping**: write proposals straight away vs write them to a file Andy edits, and
  apply only that file.
- **Name matching**: exact only vs exact, then approved alias, then a normalized guess (case,
  punctuation, "&", trailing legal suffixes), with ties reported as ambiguous.

## Decision

- `scripts/sync-pipedrive-companies.mts` only ever GETs from Pipedrive (`src/lib/pipedrive/company-api.ts`):
  the label option is resolved by name from `GET /api/v2/organizationFields`, all orgs are paged from
  `GET /api/v2/organizations`, persons from `GET /api/v2/persons?org_id=`. A 429 waits for
  `x-ratelimit-reset`.
- Dry run by default. `--execute` (typed CONFIRM) upserts companies and contacts by Pipedrive id and
  marks missing ones inactive. It never writes aliases or links.
- Every run writes the proposals to `backups/company-mapping-<stamp>.json` (gitignored; it holds
  emails). Andy deletes what he does not approve, and `--apply-mapping=<file>` (typed CONFIRM)
  writes exactly that file. Proposed links are only clean email matches; mismatches, duplicate
  emails and no-contact logins are listed for Andy, never proposed.
- Matching order is exact, alias, normalized; an approved alias outranks a normalized guess.
- The pure planning lives in `src/lib/companies/sync.ts` with unit tests.

## Consequences

**Positive:** no Pipedrive writes and no name-based resolution. Nothing lands in the alias or link
tables that Andy did not see in a file.

**Negative:** a full scan is 18 org pages plus one persons call per company on every run. Logins
whose email is not on a Pipedrive person get no link until the person record gets that email (or a
rep links them by hand later).

**When to revisit:** if Pipedrive adds a label filter to v2 organizations, or if the sync needs to run
on a schedule (then the reviewed-file step needs a different approval path).
