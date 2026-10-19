**Model:** Opus 5.5 (re-check the current Opus tier before starting) · **Effort:** xhigh
**Why Opus:** failover sizing judgment, recommender changes that must stay bit-identical on the partner path, and rules-snapshot design.

# Claude Code prompt: Project Portal backend, Step 3 (pure engines)

Read `docs/Portal-Project revamp/claude-code-brief-project-portal-backend.md` in full, then `AGENTS.md` and the files the brief lists under "Read first". Execute **Step 3 only**: the pure engines. Previous step: JOURNAL 2026-10-16 "Project Portal backend, Step 2: company and contact sync" (ADR 0157). Steps 0 to 2 are done and live. Do not start Step 4.

## Scope

Pure TypeScript, no I/O, fully unit-tested. No migrations, no database writes, no Pipedrive calls, no UI, no server actions. The engines receive rules, candidates and calc inputs as arguments.

Deliver these four things:

1. `resolveSystemDesign(calcInputs, projectDefaults, rules)` returns resolved inputs plus a **rules snapshot**. The snapshot carries each rule's key, value and plain-language description as they were at call time. `rules` is shaped like the `system_design_rules` rows (value is jsonb). Seeds: `failover_days_fraction = 0.5`, `default_primaries_per_failover = 2`, `suggest_dedicated_mgmt_above_servers = 3`. The last one produces a **suggestion flag** only. It never sets "Dedicated?" for the rep.
2. `recommendFailover(primary, groupsTotals, failoverDays, ratio, candidates, { excludeOneU })`, a new function using the same candidate pool and filters as the primary recommender.
3. Primary recommender: add an `excludeOneU` filter that applies **only** when SFP+ is on, keyed on `product_specs.rack_units = '1U'`.
4. `buildBom(primary, failover, mgmt, gpu, sfp, workstations, bomRules)` returns lines `{ sku, qty, role, ruleId }`. **No prices anywhere in this function or its output.**

## Locked behavior to implement exactly

- **Failover days default:** half of the calc's longest retention, rounded up (`failover_days_fraction` from the rules, not a literal).
- **Failover count:** `ceil(primary units / ratio)`.
- **Failover qualification:** `max_cameras` >= the primary SKU's `max_cameras`, and usable storage >= (total recorded load / primary units) x failover days. Pick the cheapest qualifying SKU. Return a warning object when none qualifies. Never throw and never silently fall back to the primary SKU.
- **SFP+ (yes/no):** per recorder and per failover, 1 x `VX5-NIC-SFP28` plus 1 x `VX5-NIC-SFP28x10`. Both lines always appear together. 1U models are excluded from primary and failover selection. Management servers (V250/V255, both 1U) and workstations are unaffected.
- **GPU (yes/no):** 1 x `VX5-GPU-A1000` per recorder and per failover. No model exclusion (V200 takes a GPU).
- **Management / Directory:** "Dedicated?" yes/no, "Failover pair?" yes/no (1 or 2 units), SKU supplied by the caller from the active management SKUs (V250-MGM, V255-MGM today).
- **Workstations:** count plus SKU (SW10-100, SW20-200 today). Zero workstations emits no lines.
- **BOM lines come from `bom_rules` rows** (`design_item`, `applies_to_role`, `sku`, `qty_per_server`, `active`). Do not hard-code SKUs in `buildBom`. Each output line carries the `ruleId` that produced it. Seed rows apply to both `recorder` and `failover` roles, so expect two rows per design item per role.
- **Do not duplicate eligibility data.** SFP+ eligibility reads the existing `product_specs.rack_units`. `sfp_addon` is free text with two spellings, so it is a cross-check in a test only.

## Two decisions to make and record (ADR, numbered from 0158, check the number is free right before writing)

1. **Failover sizing basis.** Recommended: the primary's basis (required capacity including the utilization buffer and binary charge), so primary and failover are compared like for like. The alternative is recorded data with no buffer. Pick one, state why, record the other as rejected.
2. **Daily load on a mixed-retention calc.** Recommended: each group's storage divided by its own retention, summed, then multiplied by failover days. Confirm against how `groupsTotals` is actually shaped in `src/lib/recommend/algorithm.ts` before committing to this, and say so in the ADR if the shape forces a different formula.

Include in the ADR: why a failover sized on one primary's load is correct when the ratio is above 1 (one failover covers one failed primary at a time), and what the warning path means to the rep.

## Gotchas to handle up front

- **Bit-identical default path.** `excludeOneU` must default to off and must not alter ordering, tie-breaks or the candidate pool when off. Run the golden tests (`src/lib/calculator/golden.test.ts`) and `src/lib/recommend/*.test.ts` **before** touching anything and again after. Report both results.
- **Do not refactor the primary recommender beyond the filter.** If sharing code with `recommendFailover` needs an extraction, make the extraction first in its own commit with the golden tests green, then add the new behavior.
- **`sfp_addon` agreement test.** A test must assert that for every SKU in the recorder pool, `rack_units = '1U'` coincides with `sfp_addon = 'No'`, so the two cannot drift apart silently. The engines take pool data as input, so this test needs a fixture. Build it from the seeded product specs file in the repo. Do not query the live database. If no seed file carries `rack_units`, stop and tell Andy instead of inventing values.
- **Cheapest means cheapest by the same price field the primary recommender already ranks on.** Do not introduce a second price source. This is selection inside a server-side engine and not price math in the portal UI. Prices stay out of the BOM.
- **Rules snapshot immutability.** The snapshot must be a deep copy. A test edits the rules object after `resolveSystemDesign` returns and asserts the snapshot still holds the old values. Add a second test that re-resolving from a stored snapshot reproduces the original result, since Step 4 rehydrates from it.
- **Storage tiers.** Every family has three storage tiers at one `max_cameras` (V200 100, V400 150, V500/V600 275, V700/V800 325). The `max_cameras` check therefore passes for the same family and the storage check does the real work.
- **Edge cases that need explicit tests:** ratio larger than the primary unit count (failover count 1); a ratio of 1; a single primary unit; failover days of 0 or fractional input (decide, document, test); SFP+ on a calc that would have picked V200; GPU on V200; no qualifying failover SKU; failover-pair management (2 units); zero workstations; a `bom_rules` row set inactive; a rule edited after save.
- **Acceptance sanity check** from the Step 0 findings: 18 x V800-864 primaries at uniform retention should yield 9 failovers, and on the primary's basis the cheapest qualifying SKU should come out near V700-480. Treat this as a smoke check against fixture data. Recompute from the fixture and report the actual result. Do not assert a number the fixture does not support.

## Standing rules that apply here

- No `git push`. Commit locally at the end of the step. Andy reviews and pushes.
- No `supabase db push`, no live Pipedrive calls, no database writes.
- Partner self-serve path (full calculator, Quick Calc, Register a Deal) stays bit-identical.
- JOURNAL entry for the step. ADR for every non-obvious choice (failover sizing basis, mixed-retention load, any `excludeOneU` design choice, and the snapshot shape).
- No em dashes and no "not X, but Y" constructions in any prose you write (JOURNAL, ADRs, comments).

## Out of scope for this session

- Step 4 (`submitCalculation` integration, `input_state` v4, banking the BOM) and anything after it.
- Deleting the leftover "RLS Hijack Co" test persona (`rls-test-a-1792186404373@arxys-rls-test.invalid`). That is a database write. Remind Andy in your report and leave it.
- Adding a `company_sync_includes` row for Relativity Space. Andy skipped it for now.

## Finish

1. Update the brief: mark Step 3 done with the date, add a "Step 3 results" section (what was built, ADR numbers, decisions made, what is unverified), and update the Status line and next free ADR number.
2. Write the JOURNAL entry (Work done, Detours and fixes, Decisions captured).
3. Commit locally.
4. Report: what changed, tests run (full unit suite and `tsc`, plus golden and recommender results before and after), and what is unverified. The brief lists no formal gate after Step 3, so stop here and wait for Andy before Step 4.
