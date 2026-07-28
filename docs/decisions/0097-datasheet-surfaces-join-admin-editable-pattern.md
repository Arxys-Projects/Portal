# 0097 — The datasheet spec surfaces join the admin-editable pattern before they are applied

- **Status**: Accepted (approved by Andy 2026-07-28; build sequence unblocked)
- **Date**: 2026-07-28
- **Related**: 0090 (the schema shape — upheld, but its write-path/provenance stance is
  superseded in part, see Decision 1), 0096 (the pattern being extended), 0091 (the editability
  bar), 0094 (the delete-is-a-silent-footgun precedent), 0092 (the V100/override context the
  retirement path reads on)
- **Design**: [`datasheets/datasheet-phase2-admin-surface-design.md`](../../datasheets/datasheet-phase2-admin-surface-design.md)

## Context

Datasheet Phase 1 (2026-07-23) delivered two stop-and-flag migrations, still unapplied: the new
`appliance_specs` table (management/ACM/workstation archetypes, 58 columns) and 18 nullable
additive columns on `product_specs`. Both were written before ADR 0096, and both encode the
pre-0096 worldview: `appliance_specs` explicitly carries *no* provenance columns ("rows are
refreshed by a reviewed admin seed load, not edited row-by-row in the app") and grants admin
DELETE, mirroring `camera_specs`.

ADR 0096 then made `product_specs` canonical and admin-form-editable, shipped `/admin/specs`
(one declarative field list feeding the zod schema and the form), the audit-trigger pair, the
no-delete stance, and the live round-trip acceptance check. Applying the Phase 1 migrations
as-is would recreate on day one exactly what that closed: a table and 18 columns writable only
by migration or script, unreachable through the one supported write path.

This session also re-verified the Phase 1 field inventory against six live Illustrator
factsheets (V800, V400, V250/255, V260, SW10, SW20). The shape holds, but four per-SKU sheet
blocks have no column anywhere (Cooling, Max Power Consumption, Display Ports on rack, the
RAID prose block on appliances), one pre-pause known gap stands (`power_dc_input` on
`product_specs`, per `datasheetplan.md`), and the SW sheets' "Maximum Bandwidth" block is the
`bandwidth` skuExtraData override with nowhere to retire to.

## Options considered

- **Apply the Phase 1 migrations as-is, retrofit the pattern later** — fastest to apply;
  knowingly reopens the no-write-path problem and needs a second security-sensitive migration
  within weeks.
- **Amend both migrations to the full 0096 pattern before applying** — provenance + audit +
  no-delete + the verified missing columns, then build the admin surface. One apply cycle,
  no retrofit. **Chosen.**
- **Fold appliance rows into `product_specs` instead** — re-litigates ADR 0090; the
  `NOT NULL CHECK (> 0)` archetype constraints still make this wrong.
- **Seed the 7 appliance rows by migration after all** — re-litigates ADR 0096's core practice;
  rejected.
- **Form reuse**: copy `/admin/specs` wholesale / build a generic schema-driven admin editor /
  extract a shared kit of kinds + zod builders + renderer with per-table field lists. Middle
  path chosen — ADR 0096's own revisit condition ("a second archetype's form") has fired.

## Decision

**1. Both migrations are amended before apply; `appliance_specs` joins the 0096 pattern in
full.** Provenance columns (`updated_at`/`updated_by`), an insert-only `appliance_specs_audit`
table, the BEFORE-stamp + AFTER-audit (security definer) trigger pair, and **no DELETE grant or
policy** — deleting a row would silently blank the Price Book strings and datasheets that row
feeds, the same failure shape ADR 0094 documented for the recommender; `service_role` remains
the recovery path. This supersedes ADR 0090's "no created_at/updated_at, admin seed load"
stance for this table, for the same reason 0096 superseded it for `product_specs`: the table is
now edited row-by-row in the app, by design. The migration files are renamed to post-20260727
timestamps so filename order matches apply order.

**2. Six verified columns are added while the files are still unapplied.**
`product_specs` additive grows 18 → 22 (`power_dc_input`, `power_max_consumption`, `cooling`,
`display_ports`); `appliance_specs` gains `cooling`, `power_max_consumption`, `raid_support`,
`max_bandwidth_mbps`. Every addition traces to a per-SKU block on a live factsheet or to the
skuExtraData retirement path — no speculative columns.

**3. `/admin/appliance-specs` is built on the three-routes-one-field-list pattern**, admin-only
at RLS, action, and UI layers, with its own sectioned field list. Archetype-specific treatments
(design §4): `family_type` is a closed select matching the CHECK domain; `sheet_group` pairing
is checked cross-row by the action as a warning plus a grouped index view (single-row zod
cannot see it); `camera_matrix` gets a structured five-key row editor serialized through one
hidden input and validated by zod — closing ADR 0090's "unvalidated JSONB" negative at the only
write path; workstation-only sections show/hide on the live `family_type` with uniform
validation and mismatch warnings. There is **no net-usable preview** — nothing computes from
appliance rows; the preview's risk does not exist here and it is not cargo-culted over.

**4. The form mechanics are extracted into a shared kit** (`src/lib/spec-form/`): field-kind
vocabulary and zod builders, coercion helpers, a generalized enum kind (RAID, family_type,
codec), new `date-optional` and `string-list` kinds (for `revision_date` and
`security_features` — blank list coerces to `[]`, never null), and the section-walking form
renderer with a per-table extras slot. Field lists, rules, warnings, actions, and pages stay
per-table. `/admin/specs` migrates onto the kit in the same change, proven unchanged by its
schema tests and live round-trip.

**5. The admin form is the entry path for all seven `appliance_specs` rows and for the 22
additive columns' values on the 21 rack rows. No seed migration, no seed script.** Each entry
doubles as the end-to-end write-path validation. The three ACM SKUs are entered too (the
skuExtraData retirement needs their strings); ACM-specific schema and templates stay deferred
per `datasheetplan.md`. The V150 `acm`-vs-`management` call moves from "seed-time" to the
form's `family_type` select, made by whoever enters the row.

**6. Verification mirrors 0096**: a `roundtrip-appliance-specs.mts` live round-trip
(PARSES / PRESERVES / COVERS, deep-equality for jsonb and text[]), test-rls block 22 mirroring
block 21 including admin-DELETE-refused, and the product_specs round-trip updated for arrays
and the larger field count. Apply precedes form code: the round-trip's coverage check is
expected to name exactly the new columns during that window, and the reverse order would ship
a form whose saves fail.

## Consequences

**Positive:** the datasheet schema arrives already meeting the ADR 0091 bar — no
migration-only columns are ever created, so the 26-column failure mode has no second act. One
apply cycle instead of apply-then-retrofit. The factsheet verification means the template
phase won't discover missing per-SKU blocks after the data is entered. The skuExtraData
retirement gets every column it needs. The shared kit makes the third surface
(`camera_specs`) and the ACM phase cheap.

**Negative:** the amendment adds scope to a migration that was "ready"; Andy re-reviews ~250
lines of SQL instead of applying as-is. Two audit tables now grow unbounded (same accepted
cost as 0096). The kit extraction touches the shipped, working `/admin/specs` form — a
regression risk taken deliberately, gated by its round-trip. Hand-entering 21 × 22 additive
values through the form is tedious (bounded: 7 distinct chassis value-sets); accepted as the
one-time price of the no-seed principle. A 65-field and a 62-field form are large surfaces;
every future column still needs a field-list entry or it is unreachable — unchanged from 0096,
now on two tables, though the round-trips catch it mechanically.

**When to revisit:** if entry through the form proves error-prone enough that a
copy-from-sibling prefill (or a reviewed import path with audit attribution) is worth building;
if the ACM phase's fields arrive (its own ADR); if a third spec table makes even the kit feel
duplicative (the generic-editor option returns); if audit retention becomes a real cost; or if
`sheet_group` pairing errors actually occur despite the warning + grouped index, which would
argue for promoting the check to a refusal.
