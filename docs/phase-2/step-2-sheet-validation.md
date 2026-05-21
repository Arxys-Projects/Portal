# Phase 2 Step 2 — Master Sheet validation (scoping brief)

> **For a fresh chat session OR the same Sonnet session that did Step 1.** Reads cold. Self-contained.
>
> **Model recommendation**: Sonnet, no extended thinking. This is fetch-CSV + parse + validate + report. Standard plumbing.

## What Step 2 is

The push script (Phase 2 Step 5) will assume the Master Sheet's data satisfies certain invariants. **Step 2 confirms those invariants hold on the Sheet today** before any push-script code is written. Two deliverables:

1. **`scripts/validate-prices-sheet.ts`** — a standalone CLI script that fetches the Sheet as CSV, validates every row, and prints a structured report. Step 5 will later import the validation function into the push script; Step 2 establishes it.
2. **A validation report** in the JOURNAL entry documenting the outcome — row count, derived Product Groups, any prefix violations, any unexpected MSRP values, Andy's decisions on open issues surfaced by the report.

If validation surfaces a real problem (prefix violation, duplicate SKU, malformed MSRP), **stop and ask Andy** rather than pushing through. The Sheet is Andy's working master; fixes go in his Sheet, not in script workarounds.

## What Step 2 is NOT

- Not the push script itself. That's Step 5.
- Not Google Sheets API setup. The Sheet is publicly readable via `?usp=sharing`; Step 2 fetches via the `/export?format=csv` URL. Service-account auth is a Step 5 concern (and may not even be needed if public-CSV export stays sufficient).
- Not modifying the Sheet. PQ2(ii) is locked: script adapts to the Sheet's actual shape. The Sheet stays Andy's.
- Not designing the Supabase schema. Step 3.
- Not parsing the sheet into a Supabase upsert. Step 5.

## Context to read before touching code

1. **[`AGENTS.md`](../../AGENTS.md)** — three-doc discipline + Next.js 16 caveat (not directly relevant to this CLI but good baseline).
2. **[`docs/phase-2-plan.md`](../phase-2-plan.md)** — Phase 2 work-unit table; Step 2 row.
3. **[`docs/decisions/0030-phase-2-scope-and-locked-decisions.md`](../decisions/0030-phase-2-scope-and-locked-decisions.md)** — particularly the PQ2(ii) decision: script adapts to the Sheet, not the other way.
4. **[`docs/proposals/phase-2-pricing-pipeline.md`](../proposals/phase-2-pricing-pipeline.md)** — top banner first; then the body for the original Sheet-schema spec (now known to diverge from reality).
5. **[`scripts/test-rls.ts`](../../scripts/test-rls.ts)** — example of an existing CLI script in this repo. Follow the same shape: imports from `src/lib/...` as needed; runs via `node --env-file=.env.local --import tsx scripts/<name>.ts`.
6. **[`scripts/bootstrap-admin.ts`](../../scripts/bootstrap-admin.ts)** — second example; uses `process.argv` parsing if you need CLI args.

## Master Sheet location

```
https://docs.google.com/spreadsheets/d/12zwFhDynV6T4ehxui7y-i6F-8XjEYFRBPgsAicpksmk/edit?usp=sharing
```

CSV export URL (publicly readable):

```
https://docs.google.com/spreadsheets/d/12zwFhDynV6T4ehxui7y-i6F-8XjEYFRBPgsAicpksmk/export?format=csv
```

Sheet has ~36 lines (1 header + ~35 data rows) at time of brief writing. "Valid as of 5/5/2026" header annotation.

## Andy's prereqs / decisions

These are all confirmations or short decisions — no data entry, no Sheet edits.

1. **Confirm the Sheet ID is canonical.** The Sheet at the URL above is the *single* master. No rival Excel/Sheet/Drive copy is authoritative. Andy ack.

2. **Confirm SKU naming convention going forward.** All new products added in future will follow `VX5-<GROUP>-<TIER>` where `<GROUP>` is alphanumeric (e.g. `V200`, `SW10`, `GPU`) and `<TIER>` is alphanumeric with optional lowercase suffixes (e.g. `64`, `A1000`, `SFP28x10`, `MGM`, `ACM`). The push script's validation pass will refuse to push any row that breaks this convention. Andy ack.

3. **`VX5-PP5-V100` (5-year warranty extension) decision.** The Pricing Pipeline proposal listed this as one of four required Sheet additions; the Sheet today doesn't have it. Three options:
   - (a) Add `VX5-PP5-V100 / 5 Year Protection Plan ... / 1995` to the Sheet now.
   - (b) Accept the gap — it's not in the price list and won't be in Pipedrive Products / Supabase / portal.
   - (c) Decide later — Step 2 reports the absence and moves on.
   - **Andy decision needed.**

4. **`Partner Discount Price` column.** Sheet has this column (column D), populated from a sheet-level discount %. PQ3 locked that the partner XLSX download is MSRP-only and the HTML price book defers tier-discount UX. So the column is **non-canonical going forward**. Three options:
   - (a) Leave the column in the Sheet (informational; ignored by all push-script logic).
   - (b) Remove the column from the Sheet to avoid future confusion.
   - (c) Repurpose: keep the column in Sheet AND surface it on the HTML price book as a "Reference Partner Price" until per-user tier UX exists.
   - **Andy decision needed.** Doesn't affect Step 2 code (validation ignores the column either way) but affects how Step 8's HTML page handles partner pricing.

5. **Product Group taxonomy decision (likely surfaced by the report).** The proposal grouped `SW10`, `SW20`, `SW25`, `SW30`, `SW35` under a single `SW` group; the SKU-prefix derivation would treat each `SW10`/`SW20`/etc. as a distinct group. The validation report will list all derived groups; Andy decides whether the script needs a collapse rule (`SW*` → `SW`) before Step 5, or whether the granular grouping is fine.

## Code work — file-by-file task list

### 1. `scripts/validate-prices-sheet.ts` — new file

A standalone CLI that:

1. Fetches the Sheet via the CSV export URL using `fetch` (Node 20+ has it built in).
2. Parses the CSV — use a small dependency like `csv-parse` (preferred; standards-compliant) or implement a minimal parser (CSV has quirks with embedded commas in product names; don't naive-split on `,`).
3. Skips the header row + any blank trailing rows.
4. For each data row, extracts: `sku`, `productName`, `msrpRaw`, `partnerDiscountRaw`.
5. Validates each row:
   - **SKU non-empty.**
   - **SKU matches** `^VX5-[A-Z0-9]+-[A-Z0-9a-z]+$` (case allows lowercase suffixes like `x10`, `x25`).
   - **Product Group derivation** = second dash-segment of SKU; never empty.
   - **MSRP classification**: numeric (parse via `Number()`), or `MKT`, or `Call for Quote`, or empty. Anything else is a violation.
   - **No duplicate SKUs.**
6. Builds a report with:
   - Total data rows.
   - Distinct Product Groups (derived from SKU prefix).
   - Per-group row counts.
   - Per-group MSRP min/max (numeric rows only).
   - MKT row list.
   - CFQ row list.
   - Any violations: prefix violations, duplicate SKUs, malformed MSRPs, empty fields.
7. Prints the report to stdout, exits with code 0 on clean validation, code 1 on any violation.

Example shape — match the style of `scripts/test-rls.ts` (sectioned output, `[PASS]` / `[FAIL]` markers):

```
=== Sheet validation ===
[PASS] Fetch CSV (HTTP 200, 35 data rows + 1 header)
[PASS] All 35 SKUs non-empty
[PASS] All 35 SKUs match VX5-<GROUP>-<TIER>
[PASS] No duplicate SKUs
[PASS] All MSRPs are NUMERIC, MKT, or CFQ
[INFO] Derived Product Groups: GPU, NIC, RAM, SW10, SW20, SW25, SW30, SW35, V100, V150, V200, V250, V255, V260, V270, V400, V500, V600, V700, V800
[INFO] Group row counts: { V200: 3, V400: 3, V500: 3, ..., MKT: 1, CFQ: 2 }
[INFO] MSRP ranges per group:
  V200: $15,657 - $18,139
  V800: $64,922 - $87,971
  ...
[INFO] MKT rows: [VX5-RAM-32GB]
[INFO] CFQ rows: [VX5-SW30-300, VX5-SW35-300]

All Sheet validations passed.
```

Run via:

```bash
node --import tsx scripts/validate-prices-sheet.ts
```

(No `--env-file=.env.local` needed — public CSV; no Supabase or Pipedrive credentials touched in Step 2.)

### 2. `package.json` — add `csv-parse` dep (if you go that route)

If you choose `csv-parse`:

```bash
npm install --save-dev csv-parse
```

`--save-dev` is correct because the script is dev-time only; it's not bundled into the portal app. If you implement a minimal CSV parser inline (~30 lines), skip this step.

**Recommendation**: use `csv-parse`. The Sheet's header row has an embedded `<-- Enter Partner discount % here` cell that includes spaces; product name cells have commas (e.g. `"VideoX V100 32TB, 1U 2Bay Rack"` — actually no, the dump showed no commas in names, but there could be in future). Standard parser handles edge cases for free.

### 3. Don't touch anything else

No changes to `src/app/...`. No changes to `src/lib/...`. No changes to migrations. No changes to the proposal doc or the plan doc.

## Tailwind v4 / Next.js / app code reminder

None of this applies to Step 2. The script is Node-only CLI. No JSX, no Tailwind, no Next.js APIs.

## Verification gates

In order:

1. `npm run lint` — clean (the new script shouldn't introduce lint errors).
2. `npm test` — 19/19 still passing.
3. `npm run build` — clean (scripts directory is outside the app build; this should be unaffected, but verify).
4. `node --import tsx scripts/validate-prices-sheet.ts` — runs cleanly, exits 0, report printed.
5. Read the report. **If any `[FAIL]` line appears, stop and surface to Andy.** Don't write the JOURNAL entry yet — fix the underlying issue (sheet-side via Andy, or script-bug via you) and re-run.

## Definition of done

- [ ] `scripts/validate-prices-sheet.ts` exists and runs cleanly with exit code 0.
- [ ] All 35 (or current N) Sheet rows pass validation.
- [ ] Andy confirmations recorded for the five decisions in "Prereqs" section above (Sheet canonical, SKU convention, PP5-V100 outcome, Partner Discount Price column outcome, Product Group taxonomy).
- [ ] If `csv-parse` was added: `package.json` + `package-lock.json` reflect it as a devDependency.
- [ ] All four verification gates pass.
- [ ] JOURNAL entry written (see "Docs check" below).
- [ ] Working tree clean; commit message in `feat(scripts):` or `docs:` scope.
- [ ] **Don't push without Andy's nod.**

## Open questions to lock before starting

1. **CSV parser**: `csv-parse` dep, or inline minimal parser?
   - **Recommendation**: `csv-parse` devDep. Future-proof against embedded commas, quoted fields, escapes.

2. **Sheet ID hardcoded or via env var?**
   - **Recommendation**: hardcode in the script as a constant `SHEET_ID = "12zwFhDynV6T4ehxui7y-i6F-8XjEYFRBPgsAicpksmk"`. The script is one-purpose; an env var adds setup friction. If the Sheet ever moves, edit the constant.

3. **Validation regex strictness for TIER segment**.
   - The Sheet today has `SFP28x10`, `SFP28x25` with lowercase x — the TIER part needs to accept lowercase.
   - **Recommendation**: regex `^VX5-[A-Z0-9]+-[A-Z0-9][A-Za-z0-9]*$` — GROUP is strictly uppercase/digit; TIER starts uppercase/digit then allows mixed case.

4. **SW10/SW20/etc. group collapse decision** — open Q5 in the Prereqs section. Don't pre-decide; let Andy choose after seeing the report.

## Docs check (per AGENTS.md three-doc discipline)

- **`docs/JOURNAL.md`**: append a `Phase 2 Step 2 — Master Sheet validation` entry at the top. Include:
  - The validation result summary (rows validated, groups derived, MSRP ranges).
  - Each of Andy's five decisions and their outcome.
  - Any "Detours & fixes" if violations surfaced and were fixed.
- **`docs/RUNBOOK.md`**: probably no change. The validation script is a one-off helper; it doesn't change the recreate-from-zero recipe. *Possible exception*: if you add `csv-parse` as a devDep and the `npm ci` step in §1 of RUNBOOK is meaningfully affected, no — `npm ci` already pulls all devDeps.
- **`docs/decisions/`**: probably no new ADR unless a non-obvious choice surfaces. Examples that *would* justify an ADR: Andy decides to collapse SW10/20/etc. to a single SW group via a script-side rule (vs. Sheet-side rename) — captures the "why" for the future. Don't write speculative ADRs.

## Out of scope reminders (don't drift)

- No Supabase schema work. No new migration. No `products` table changes.
- No Pipedrive work.
- No portal UI changes.
- No push to Supabase or Pipedrive. Step 5 owns that.
- No Sheet editing.
- No Google Sheets API auth (Service Account JSON, etc.). Step 5 may need it; Step 2 doesn't.
- No `googleapis` dep. The Step 5 brief will add that.

## Effort estimate

~1-2 hours of focused work. Most of it is CSV parsing + report formatting; the actual validation logic is ~20 lines. Andy's confirmations are a 5-minute review of the report once it's printed.

## When you finish

1. All four verification gates passed; validation report clean.
2. Andy's five decisions recorded in the JOURNAL entry.
3. Commit with scope-prefixed message (`feat(scripts): add prices-sheet validation` or similar).
4. **Don't push without Andy's nod.** Same cadence as Step 1.
5. Surface a brief summary back to Andy noting: row count, group breakdown, any anomalies, and the outcomes of the five decisions.
