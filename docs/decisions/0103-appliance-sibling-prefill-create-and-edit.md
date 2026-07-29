# 0103 — The sibling prefill extends to the appliance create form, on a corrected chassis premise

- **Status**: Accepted
- **Date**: 2026-07-29
- **Related**: reads on 0102 (the mechanism this reuses; **not** superseded — its `/admin/specs`
  edit-form prefill is unchanged), 0097 (decision 3, the appliance form; §8, no seed), 0092 / 0094
  (the silent-overwrite failure the copy-set boundary guards against)

## Context

Build step 5 left `appliance_specs` live and empty. The plan was to hand-enter all seven rows —
V250, V255, V260, V265, V150, SW10, SW20 — through `/admin/appliance-specs/new`. ADR 0102 built a
copy-from-sibling prefill for exactly this kind of redundancy on `product_specs`, and its scope note
deliberately excluded this table, reasoning that "its seven rows are seven distinct chassis; only
V250/V255 and V260/V265 share a sheet, and those differ in exactly the CPU and RAM fields a prefill
would copy wrongly."

Verified hardware facts corrected that premise. V250 / V255 / V260 / V265 are **one chassis**
differing only in CPU, RAM and the two drive sizes — four config points on a shared platform, not
four platforms. SW20 differs from SW10 only in a second GPU, bandwidth, monitor count, display ports
and camera matrix. V150 shares the platform block but has its own power and cooling. So most of a
row *is* invariant across a chassis family, and the redundancy ADR 0102 removed on the rack side is
present here too — the difference is only which columns are shared, not whether any are.

Two things also differ from 0102's setting. The table is **empty**, so every row is *created*, which
makes `/new` the primary surface rather than an afterthought. And a chassis family spans **sheet
groups** (V250 and V260 are different sheet groups but the same chassis), so the source list cannot
be the sheet-group siblings the edit page already computes.

## Options considered

- **Leave the scope note as written; type all seven unaided.** No code, all cost — and the cost is
  now known to be larger than 0102 assumed, because the shared block is 30 fields, not zero.
- **Extend 0102's mechanism to the appliance edit form only.** Matches 0102 exactly, but misses the
  primary surface: with an empty table the entry happens on `/new`, where 0102 offered nothing.
- **Extend it to both `/new` and `/[sku]`, with a corrected copy set and a cross-sheet-group source
  list.** The full fix. **Chosen.**

## Decision

**1. The mechanism is reused verbatim, including the property that makes it safe.** The control
links to `?prefillFrom=<source>`; the page re-renders with the source's copyable fields as the
form's `defaultValue`s; the editor reviews them and presses the same Save button, through the same
`createApplianceSpec` / `updateApplianceSpec` action, the same zod parse and the same RLS policy.
Following the link writes nothing — the GET *is* the safety argument, one table over unchanged — so
there is no second write path and the audit trigger stamps the admin who saved.

**2. The copy-set boundary is the load-bearing part, exactly as in 0102.**
`APPLIANCE_PREFILL_FIELD_NAMES` is an explicit **allowlist** of the 30 fields invariant across a
chassis family — the platform, power, physical, environmental, regulatory and warranty block. A
field is copyable **only** if it is the same across siblings. Everything else is excluded and
hand-entered: identity, the compute block (the CPU/RAM that separate the four V-siblings), both
drive strings and `storage_summary` / `drive_bays` (sizes vary — the V255 OS drive is 960GB not
480GB), `raid_level_display`, `display_ports` (differs SW10/SW20), the whole SW block
(`max_bandwidth_mbps`, `monitor_support`, the `gpu_*` fields, `front_io`, `rear_io`,
`camera_matrix`), `revision_date` and `notes`. Copying any of those from a neighbour would overwrite
a real difference with the wrong value — ADR 0092's failure mode, one table over. A boundary test
asserts the copy set and an explicit excluded set are **disjoint and together cover every form
field**, so a column added later cannot silently escape the copy/no-copy decision.

**3. Prefill on both surfaces, with the source list every OTHER row.** `/new` and `/[sku]` both
honour `?prefillFrom=`. The candidate list is every other `appliance_specs` row, cross-sheet-group
included, because the chassis is shared across groups. Each candidate is labelled with its archetype
and its copyable count (*"VX5-V250-MGM — management — 28 of 30 copyable"*), because not every row is
a valid source for a given target — a workstation's platform block does not belong on a management
server — and the prefill does not decide that; the label plus review-before-Save does. On `/new`
with an empty table there are no sources, so the offer is simply absent until the first row exists.

**4. Loud banner and a remount key, both from 0102.** A prefilled render shows values the database
does not have, so a banner names the source, the count, *"Nothing is saved yet"*, and a discard link
(to the empty create form, or back to the unprefilled row). The form is keyed on the prefill source:
every field but the live ones is uncontrolled, so without the remount key React keeps the previously
rendered `defaultValue` and the copied values never appear — the exact detour 0102 hit. A failed
source query logs and drops the offer rather than failing the page.

## Consequences

**Positive:** entry becomes two from-scratch rows plus five prefill-assisted, not seven from
scratch, without a seed, a migration, a second write path or an ADR-superseding change to 0102. Every
row still carries a real `updated_by`. The copy set documents, in code and tests, which appliance
columns are per-chassis and which are per-SKU — a distinction that previously lived only in the
sheets. The feature stays useful past build step 6: when a chassis sheet is revised, these 30
columns change together for the whole family.

**Negative:** a prefilled form displays values not in the database, the state the banner mitigates
but does not eliminate; someone ignoring it could save a wrong-chassis source's platform block onto
a row. The source list is intentionally permissive (every other row, not just the same chassis), so
the archetype label is the only guard against copying a workstation onto a server — deliberate,
because the app cannot know the chassis grouping and the sheet-group panel does not span it.
`APPLIANCE_PREFILL_FIELD_NAMES` is a second hand-maintained list beside `APPLIANCE_SECTIONS`; the
partition test catches an ungoverned column, but only once someone runs it.

**When to revisit:** if a future chassis genuinely varies one of the 30 across its siblings (moving
that field out of the copy set); if the permissive source list produces a wrong-chassis copy in
practice (constraining candidates by inferred chassis family); or if the discard-unsaved-edits
behaviour of the remount key bites once rows are actively edited rather than freshly created.
