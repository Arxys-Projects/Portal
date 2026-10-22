# 0165 - A project calc's system design is banked once, in a side table only server code writes

- **Status**: Accepted
- **Date**: 2026-10-22
- **Related**: 0158 (the engines and security finding S-1), 0161 (BOM lines), 0153 (`project_submissions`), 0093 (revision lineage), 0164 (`is_internal()` requires an active partner)

## Context

Step 4 saves project calcs through `submitCalculation`. A saved project calc is shown and reopened
from the design the engines resolved at save, its rules snapshot and its BOM (ADR 0158), so those
three have to be stored. The engines trust a well-typed design and snapshot, so whoever can write
them controls the add-ons and quantities on a quote (S-1).

`submissions` is not a safe home. `authenticated` has table-wide INSERT and UPDATE on it with
row-only policies (baseline audit B1-S-2, open on 2026-10-22), so a partner could rewrite anything
banked there.

An edited calc is saved as a new `submissions` row with `parent_submission_id` pointing at the
source (ADR 0093; `calculator/actions.ts` lines 401 and 476 at `029bb87`). The source row is not
changed. So one banked design per submission row always describes the calc stored in that row.

## Options considered

- **Columns on `submissions`**: one table, but open to partner writes until B1-S-2 ships, and
  every later column guard has to remember them.
- **Side table, internal write policies**: the same pattern as Step 1's tables, but a rep's session
  could then write a design that does not match the calc it belongs to.
- **Side table, no API write grant except INSERT for the service role** (chosen): only server code
  writes, after its own checks, and the database refuses updates from every API role.
- **Enforcing "never update" with a trigger** vs **by privileges**: a trigger also blocks the SQL
  editor; withholding UPDATE and DELETE from the API roles is simpler and leaves the owner a way to
  repair a row by hand.

## Decision

- Table `public.submission_system_designs`: `submission_id` (primary key, references
  `submissions`, on delete cascade), `resolved_design` jsonb object, `rules_snapshot` jsonb object,
  `bom` jsonb array, `engine_version` text (1 to 40 characters), `created_by` (references
  `partners`, on delete restrict, like `submissions.partner_id`), `created_at`.
- **Write rule: insert once per submission, never update.** The primary key allows one row.
  `anon`, `authenticated` and `service_role` hold no UPDATE, DELETE or TRUNCATE. A row leaves only
  with its submission: the cascade runs with the table owner's rights, so it works although
  `service_role` cannot delete from this table. A changed design means a new save, which is a new
  submission row with its own design.
- **Reads:** `authenticated` has SELECT, and the policy lets active internal users and admins see
  rows. Partners, the contact's linked login included, and `anon` see nothing.
- **Writes:** only `service_role` has INSERT. Server code checks the caller owns the submission
  before writing, in one function (Phase B). A BEFORE INSERT trigger repeats the check for every
  role: `created_by` must be the submission's `partner_id` and an active internal user or an admin,
  or the insert fails with 42501.
- The trigger function is `SECURITY DEFINER` with an empty `search_path`, because `is_internal()`
  and `is_admin()` grant EXECUTE to `authenticated` only and the writer is `service_role`. In PGlite,
  without it every legitimate insert failed with "permission denied for function is_internal" when
  `service_role` lacked that grant. EXECUTE on the trigger function is revoked from `public`,
  `anon` and `authenticated`.
- **Revisions:** a revision of a project calc is a new submission row, so it gets its own banked
  design and its own `project_submissions` row as `'primary'`. The source's rows stay as they are.
  The current calc of a project is the newest row in its `parent_submission_id` lineage.
- Simpler of two equal options: `submission_id` is the primary key itself, as on
  `project_submissions`. A separate id plus a unique constraint would add nothing.

## Consequences

**Positive:** nothing a browser session sends can create, change or remove a banked design, and B1-S-2
does not reach it. The database refuses a design for a calc the writer does not own, or for a
partner's calc, even if the server code has a bug.

**Negative:** fixing a bad row needs the SQL editor as the owner. The service role cannot repair it.
Deleting a project calc deletes its banked design, so the rollback and any delete lose the record of
what that quote was sized with. The trigger adds one lookup per project save.

**When to revisit:** if calcs ever need to be edited in place, or partners need to read their
project calc's design directly (today Step 6 reaches them through server-rendered quotes).
