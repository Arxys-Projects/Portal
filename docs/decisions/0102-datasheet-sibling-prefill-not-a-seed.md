# 0102 — Bulk datasheet entry is a sibling prefill on the form, not a seed

- **Status**: Accepted (chosen by Andy 2026-07-28; built and verified same day)
- **Date**: 2026-07-28
- **Related**: 0096 (form-as-canonical-write-path, whose revisit condition this answers), 0097
  (decision 5 — no seed migration, no seed script; §8 named this prefill as the mitigation),
  0092 (the silent-capacity-overstatement failure the copy-set boundary guards against), 0094
  (the same shape of failure one layer down)
- **Reference**: [`datasheets/datasheet-phase2-step6-entry-reference.md`](../../datasheets/datasheet-phase2-step6-entry-reference.md)

## Context

Build step 6 is 28 rows of factsheet data typed through two admin forms. On the `product_specs`
side that is 21 rack rows × 22 additive columns, and the values are highly redundant: a factsheet
describes a *chassis*, so all three capacity SKUs in a family share one identical value-set. One
V400 sheet covers the 128, the 160 and the 192.

ADR 0097 §8 stated the cost honestly — "21 hand edits… the one-time price of the no-seed
principle" — and named the escape hatch in the same paragraph: *"If it proves painful in practice,
a 'copy from sibling SKU' prefill on the edit form is a cheap later nicety — a UI convenience, not
a second write path."* With the transcription reference finished and the redundancy visible in it,
Andy asked whether the data could simply be seeded instead.

That question is the live one, because ADR 0096 exists precisely to end migration- and
script-populated columns, and ADR 0097 decision 5 was accepted the same morning. A seed would also
break provenance in a way neither ADR discusses directly: `updated_by` is stamped from
`auth.uid()`, which is null for a migration or a `service_role` script, so the audit row would
record the change with no actor.

## Options considered

- **Seed migration or `service_role` script** — fastest; the exact practice 0096 and 0097 closed,
  and leaves `updated_by` null with no audit actor on all 21 rows.
- **A reviewed import script authenticating as a real admin session** — ADR 0097's own named
  revisit condition ("a reviewed import path with audit attribution"). Honest provenance, but it
  is genuinely a second write path and needs its own validation surface to stay in step with the
  form's.
- **Copy-from-sibling prefill on the edit page** — the mitigation 0097 §8 pre-blessed. Cuts 21
  entries to 7 plus 14 reviewed copies, adds no write path, keeps attribution exact.
  **Chosen.**
- **Type all 21 unaided** — no code, no risk, all cost. The fallback if the prefill had turned out
  to be more work than it saved; it did not.

## Decision

**1. The prefill is a GET, not a write.** The control renders links to
`/admin/specs/[sku]?prefillFrom=<sibling>`. The page re-renders with the sibling's datasheet values
as the form's `defaultValue`s; the editor reviews them and presses the same Save button, through
the same action, the same zod parse and the same RLS policy as any other edit. Following the link
writes nothing. This is what makes "not a second write path" a property of the mechanism rather
than a promise in a comment — there is no code path by which a prefill can reach the database
without an admin pressing Save, and the audit row therefore records that admin.

**2. The copy set is the 22 factsheet columns, named as `DATASHEET_FIELD_NAMES`, and the boundary
is the load-bearing part.** Its definition is *the columns a factsheet supplies* — which is why
every member is per-chassis rather than per-capacity. `storage_raw_tb`, `hdd_count`,
`raid_level_display`, `max_cameras`, `max_cameras_h265`, `drive_bays` and `model_name` are
excluded: copying any of them from a neighbour would publish one sibling's net-usable figure on
another's Price Book page, silently, through the very preview built to catch that — ADR 0092's
failure mode re-entering one layer up. Five unit tests hold the boundary, including an explicit
per-capacity denylist and an assertion that `id` is absent (it is the update's WHERE clause).

The other 43 fields are also excluded even where they happen to match across siblings today: they
are populated and correct, so copying them buys nothing and risks clobbering a legitimate future
difference.

**3. The prefilled state is announced loudly, not subtly.** A prefilled form shows values the
database does not have — the one genuinely confusing state this introduces. A banner names the
source SKU, says how many of the 22 were copied, states *"Nothing is saved yet"*, and offers a
discard link back to the unprefilled row. Each sibling in the offer is labelled with how many of
the 22 it holds, so the editor copies from a filled row rather than discovering afterwards that
they copied 22 blanks.

**4. Scope held deliberately narrow.** Edit form only — not the create form (a new SKU has no
sibling worth trusting yet), and not `/admin/appliance-specs` (its seven rows are seven distinct
chassis; only V250/V255 and V260/V265 share a sheet, and those differ in exactly the CPU and RAM
fields a prefill would copy wrongly). A failed sibling query logs and renders the page without the
offer rather than failing an edit.

## Consequences

**Positive:** entry drops from 21 from-scratch edits to 7 plus 14 reviewed copies without
reopening ADR 0096 or 0097 decision 5, and without an ADR-superseding change to either. Every row
still carries a real `updated_by` and a real audit entry. The feature stays useful past build step
6 for exactly the reason it works now: when a factsheet is revised, those 22 columns change
together for all three siblings. The named copy set also documents, in code and in tests, which
columns are per-chassis and which are per-capacity — a distinction that previously lived only in
the sheets.

**Negative:** a prefilled form displays values that are not in the database, which is a state the
form did not previously have; the banner is mitigation, not elimination, and someone who ignores
it could save a sibling's values onto the wrong row believing they had reviewed them. The remount
key means following a prefill link discards any unsaved edits in the other 43 fields without
warning — acceptable while those 22 columns are empty and there is nothing in progress to lose,
and worth revisiting if the prefill is used on rows being actively edited. `DATASHEET_FIELD_NAMES`
is a second hand-maintained list beside `SPEC_SECTIONS`, so a 23rd factsheet column would need
adding in both places; the length assertion catches the omission but only after someone notices
the count is wrong.

**When to revisit:** if the appliance form needs the same treatment for the V250/V255 and
V260/V265 pairs, which would require a per-field copy set rather than one list (their CPU, RAM and
drive-size fields differ on a shared sheet); if the prefill is wanted on the create form; if the
discard-unsaved-edits behaviour bites; or if a reviewed import path is ever genuinely needed for a
larger table, in which case ADR 0097's revisit condition is still the right door and this decision
does not block it.
