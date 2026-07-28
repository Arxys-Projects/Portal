# Datasheet Phase 2 — the two spec surfaces join the admin-editable pattern: design

- **Date:** 2026-07-28
- **Status:** Design written, not built. **Stop-and-review gate: nothing below is applied or
  coded until Andy signs off.**
- **Decision record:** [ADR 0097](../docs/decisions/0097-datasheet-surfaces-join-admin-editable-pattern.md)
- **Reads on:** [ADR 0090](../docs/decisions/0090-datasheet-spec-schema.md) (the schema shape,
  unchanged), [ADR 0096](../docs/decisions/0096-product-specs-canonical-admin-editable.md) (the
  pattern being extended), [`spec-admin-form-design.md`](./spec-admin-form-design.md) (the shipped
  §5.1 design this mirrors), [`datasheetplan.md`](./datasheetplan.md) (the paused project plan,
  now resuming), [apply-note 0090](../docs/apply-notes/0090-datasheet-schema.md) (now carries a
  do-not-apply-as-is banner pointing here).

## 0. The problem this session settles

Phase 1 (2026-07-23) delivered two unapplied migrations: `20260723000001` (new
`appliance_specs` table, 58 columns) and `20260723000002` (18 nullable additive columns on
`product_specs`). Both were written **before** ADR 0096 made `product_specs` canonical and
admin-form-editable. Applied as-is they would reintroduce exactly the problem SSOT closed: a
whole table and 18 columns with no admin write path, editable only by migration — the
26-migration-only-columns failure mode, rebuilt on day one.

This design brings both migrations onto the ADR 0096 pattern *before* they are applied, and
designs the `appliance_specs` admin surface that makes the new table's write path real.

## 1. Verification against the live factsheets (what this session checked, not assumed)

The Phase 1 field inventory was re-verified against six of the current Illustrator sheets —
V800 and V400 (local copies from Andy), V250/255, V260, SW10, SW20 (fetched from the arxys.com
URLs in `families.ts`). Findings:

**The Phase 1 shape holds.** Page-2 blocks map onto the drafted columns nearly one-to-one:
`os_drive_desc` (VMS/OS Drive), `remote_mgmt` (Remote Management), `security_features`
(Credential & Key Encryption's `·`-separated list), the power/dimensions/weight/warranty/
environmental/regulatory groups, `storage_summary = 'NA'` on the V250, `power_dc_input` only on
the V250 sheet, the two-CPU-variant rendering (V250/V255 as per-variant lines inside shared
blocks — the `sheet_group` model is exactly how the sheet reads), and the SW10 camera matrix
(4 rows; the sheet's column header says "FPS" but holds codec values — the migration's
documented jsonb shape `{resolution, codec, fps, cameras, bandwidth_mbps}` is right, with fps
living in the sheet's footnote, "@15fps").

**Four per-SKU blocks render on the sheets with no column anywhere.** All verified to *vary*
across SKUs, so none can be a template constant:

| Sheet block | Evidence it varies | Column to add | Which table |
|---|---|---|---|
| Cooling | V800 "6 x 80x38mm", V400 "3 x 80x25mm", V250 "5 x 40x40x56mm (29,700rpm)"; absent on SW10 (tower) | `cooling text` | both |
| Max Power Consumption | V800 1200W, V400 800W, V250 800W, SW10 850W Gold | `power_max_consumption text` | both |
| Display Ports | rack sheets "VGA (…)"; SW10 a multi-line GPU-port list | `display_ports text` | `product_specs` (appliance already has it) |
| RAID (the prose block) | V800 "Hardware RAID 6 Double Fault Tolerance w/ HW XOR Engine…", V250 "Hardware RAID 5 Fault Tolerance…"; absent on SW10 | `raid_support text` | `appliance_specs` (product_specs already has it) |

**Plus two already-known gaps**, confirmed still real:

- `power_dc_input` on `product_specs` — the outstanding fix `datasheetplan.md` recorded before
  the pause (V100/V200 list a DC input line; the companion table already carries the column).
- `max_bandwidth_mbps integer` on `appliance_specs` — the SW sheets render a "Maximum
  Bandwidth" block (SW10 125, SW20 225), and it is exactly the `bandwidth` skuExtraData
  override (`"125 Mbit/s"`) that the override-retirement path needs a column for.
  `cell-value.ts` already formats `product_specs.max_bandwidth_mbps` as `` `${n} Mbit/s` `` —
  same name, same rendering, one substitution surface.

So: `product_specs` additive goes **18 → 22 columns** (`power_dc_input`,
`power_max_consumption`, `cooling`, `display_ports`); `appliance_specs` gains **4 columns**
(`cooling`, `power_max_consumption`, `raid_support`, `max_bandwidth_mbps`). All nullable text
except the integer. Adding them now costs one edit to unapplied files; adding them later costs
a third additive migration and another apply cycle.

The ACM sheets (V150/V260/V265) were *not* field-verified — the ACM archetype is deferred per
`datasheetplan.md`, and its known extra fields (`max_doors`, certified-platforms list) stay out
of the schema until that phase picks up. Nothing here forecloses them.

## 2. Migration amendments (design §1 of the build — hand to Andy, do not apply)

### 2a. `appliance_specs` (20260723000001) — joins the pattern fully

The migration's own header says: *"NO created_at / updated_at — … rows are refreshed by a
reviewed admin seed load, not edited row-by-row in the app."* ADR 0096 reversed that reasoning
for `product_specs`, and it is just as reversed here: **the admin form is this table's only
intended write path** (§8). Every element of the 20260727000001 pattern therefore carries over:

1. **Provenance**: `updated_at timestamptz not null default now()`, `updated_by uuid
   references partners(id)`, with the same column comments.
2. **Audit**: `appliance_specs_audit` (same shape: `spec_id, changed_at, changed_by, operation,
   before, after`), same `(spec_id, changed_at desc)` index, RLS SELECT-to-admin only, and the
   same two triggers — `appliance_specs_stamp_updated` (BEFORE, security invoker) and
   `appliance_specs_write_audit` (AFTER, security definer), empty `search_path`, EXECUTE
   revoked. Same one-AFTER-trigger-cannot-stamp reasoning as the 0096 apply-note records.
3. **No DELETE.** The drafted migration grants delete and creates a delete policy (copied from
   `camera_specs`). Remove both, matching `product_specs`. The rationale transfers: once the
   skuExtraData overrides retire, `appliance_specs` rows become the only source for the
   management/ACM/workstation Price Book strings (`ssdStorage`, `bandwidth`, `monitors`) and
   for the datasheet renderer — deleting a row silently blanks those surfaces with no error
   anywhere, the same failure shape as the recommender skip in ADR 0094. A 7-row hand-entered
   table has no steady-state use for delete; a mis-created row is corrected via `service_role`,
   the documented recovery path.
4. **The four new columns** from §1: `cooling`, `power_max_consumption`, `raid_support`,
   `max_bandwidth_mbps integer`.
5. **Header comment rewritten** — the "no timestamps / seed load" paragraph is now false and
   must not survive into an applied migration; it gets replaced with the ADR 0097 rationale.
   The "intended population (seeded in a LATER content phase)" comment changes to "entered
   through /admin/appliance-specs (ADR 0097 §8) — never seeded by migration."

### 2b. `product_specs` additive (20260723000002) — content extended, pattern already applied

The 18 drafted columns need no structural change: the admin write policies, both triggers, and
the audit table from 20260727000001 are row-level and `to_jsonb`-based, so new columns are
covered automatically the moment they exist (the 0096 apply-note verified this explicitly).
The amendment is only the four new columns (`power_dc_input`, `power_max_consumption`,
`cooling`, `display_ports`) plus their comments.

One column deserves a note: `security_features text[] not null default '{}'`. Because the form
action submits every field it owns, the form must send `[]` — not null — for a blank list, or
inserts violate the NOT NULL. That is a form-kind concern (§5), not a migration change.

### 2c. Renames, rollbacks, apply-note

- **Rename both files** to post-apply-order timestamps (`20260729000001` /
  `20260729000002` or the actual amend date): the files are local-only, so the rename is free,
  and it keeps filename order = apply order against the already-applied `20260727000001`.
  Dashboard applies never write the CLI history table (see the desync note in apply-note 0096),
  so this is documentation hygiene, not a functional need.
- **Rollbacks updated in step**: appliance rollback additionally drops the audit table, both
  trigger functions, and the provenance columns; additive rollback adds the four new column
  drops.
- **Apply-note 0090 rewritten** (it currently describes the pre-amendment files; a banner marks
  it do-not-apply-as-is until then). Verify section gains: audit table empty, a no-op update
  stamps + audits, non-admin write refused, **admin delete refused**, and the roundtrip-window
  caveat from §7.

## 3. The `appliance_specs` admin surface

Same three-routes-one-field-list shape as `/admin/specs`, in a sibling directory:

| Route | Purpose |
|---|---|
| `/admin/appliance-specs` | Index: rows **grouped by `sheet_group`** — SKU, model, family type, sheet group, last edited, edited by |
| `/admin/appliance-specs/[sku]` | Edit one row |
| `/admin/appliance-specs/new` | Create a row (the entry path for all 7 — §8) |

Admin-only at the same three layers, verbatim from the 0096 model: RLS is the enforcement
point (amended migration, `createSupabaseServerClient()` never the admin client); every page
and action checks `gate.isAdmin` (the `/admin` layout admits internal too); the nav entry
("Appliance specs", next to "Product specs") hides behind the existing `isAdmin` prop. Pages
404 for non-admins, matching `/admin/specs`.

Actions: `createApplianceSpec` / `updateApplianceSpec` in
`src/app/(app)/admin/appliance-specs/actions.ts` — same `{status}` state shape, same
zod-parse-then-RLS-write, same zero-rows-updated error check (an RLS-refused UPDATE is a
silent no-op), same 23505 message on create, **no delete action ever**. `revalidatePath` on
the index, `/price-book`, and the family page via the existing `productGroupToFamilySlug`
(works unchanged: appliance ids are `products.sku`s like `VX5-V250-MGM`, and the middle
segment is the product group).

Index grouping by `sheet_group` is deliberate and is the cross-row safety surface (§4b): a
V255 row typo'd into its own group, or a workstation row landing in 'V250', is visible at a
glance in a 7-row table.

### Field sections (one declarative list, three consumers — same as fields.ts)

Sections follow the migration's own comment groups. `(new)` = added by amendment 2a.

1. **Identity & sheet** — `id` (read-only on edit; hint: must equal `products.sku`, in-process
   join, no FK), `model_name`*, `product_group`* (hint: must match a `families.ts`
   productGroup), `family_type`* (enum select — §4a), `sheet_group`* (hint + warning — §4b)
2. **Compute** — `cpu_model`*, `cores_threads`, `cpu_cache`, `cpu_base_ghz`, `cpu_turbo_ghz`
   (both **text** here, unlike product_specs' numeric — ranges like "3.9/5.1" are the point),
   `ram_spec`*
3. **OS & storage** — `os_edition`*, `storage_summary` (hint: may literally be "NA" — the V250
   has no HDD array), `os_drive_desc`, `db_drive_desc` (hint: management/ACM only; null on
   workstations), `drive_bays`
4. **Availability & RAID** — `raid_support` (new; the prose block), `raid_level_display`
   (enum select over the shared RAID domain, optional — §4c), `battery_raid`, `os_redundancy`,
   `hotswap_power`
5. **Networking & management** — `network`, `gbe_1_ports`, `gbe_10_ports`, `sfp_addon`,
   `max_bandwidth_mbps` (new), `remote_mgmt`, `display_ports` (textarea — the SW10 value is a
   multi-line GPU port list)
6. **Form factor & power** — `form_factor`*, `rack_units` (hint: blank for towers),
   `power_wattage`, `power_redundancy`, `power_max_consumption` (new), `power_ac_input`,
   `power_dc_input` (hint: only the V250 sheet lists DC; blank elsewhere), `cooling` (new)
7. **Physical** — `dimensions_mm`, `dimensions_in`, `shipping_weight`
8. **Warranty** — `warranty_years` (hint: servers 5, workstations 3), `warranty_terms`
9. **Environmental** — `operating_temp`, `storage_temp` (hint: SW sheets carry none),
   `humidity`
10. **Regulatory & security** — `regulatory_safety`, `regulatory_emissions`, `ndaa_text`,
    `security_features` (string-list — §5)
11. **Workstation** (section note: leave empty unless family type is workstation) —
    `gpu_model`, `gpu_count`, `gpu_vram`, `gpu_cuda_cores`, `gpu_tensor_cores`, `gpu_rt_cores`,
    `gpu_encoders`, `gpu_decoders`, `monitor_support`, `front_io`, `rear_io`,
    `camera_matrix` (structured editor — §4d)
12. **Meta** — `revision_date` (date), `notes` (textarea)

`*` = NOT NULL in the table → required kind. `updated_at` / `updated_by` absent and must stay
absent (trigger-maintained), recorded in the roundtrip script's `INTENTIONALLY_UNSURFACED`.

## 4. Where the archetype model needs different form treatment than product_specs

These are the four places the flat-column form model from `/admin/specs` is not enough, called
out as the task asked:

**(a) `family_type` is a closed `<select>`, never free text** — the same reasoning as the RAID
select in design 0096 §4a, one layer up: the CHECK constraint would catch bad values, but the
*template* dispatches on exact strings (`management` / `acm` / `workstation`), and the
conditional form sections (§4e) key on it too. The select offers exactly the CHECK domain.
The V150's classification (`acm` per the migration comment, on access-control branding) is now
an **entry-time call made in this select** — what the migration called a "seed-time judgment"
lands on whoever types the row in, which is the intended consequence of the form being the
entry path.

**(b) `sheet_group` needs cross-ROW awareness, which single-row zod cannot give.** The pairing
rule (V250+V255 share 'V250'; single-SKU sheets use their own group) spans rows, and the form
parses one row at a time. Design: keep zod to "required text"; the **action** does one
follow-up SELECT of same-`sheet_group` rows after a successful save and returns a *warning*
(never a refusal) when the group holds rows of differing `family_type`, or more than two rows.
The index's sheet_group grouping is the second, always-on view of the same invariant. This is
the appliance analogue of the `max_cameras_h265` warning: wrong is possible, typo is likelier.

**(c) `raid_level_display` keeps the shared select, minus 'NA'.** Nothing computes capacity
from appliance rows (no `storage_raw_tb`, no `usableCapacityTb()` path), so the
silent-overstatement risk that made this select load-bearing on product_specs does not exist
here. But the datasheet template derives drive-failure tolerance from
`raid_level_display + drive count` (ADR 0090 decision 6), so the value domain still matters —
an unrecognized string breaks the derivation quietly. Same option list, offered as optional
(nullable column, blank = "— none —"), without the 'NA' legacy entry (that exists only so
pre-correction V100 rows round-trip; appliance rows start clean and never need it).

**(d) `camera_matrix jsonb` gets a structured row editor, not a JSON textarea.** ADR 0090's
stated negative is "the camera matrix's internal shape is unvalidated JSONB"; the form is the
only write path, so this is where that closes. A small client component renders the matrix as
editable rows with exactly the five documented keys — `resolution` (text), `codec` (select:
H.264 / H.265), `fps` (positive int), `cameras` (positive int), `bandwidth_mbps` (positive
int) — with add/remove-row controls, serialized into **one hidden input** as a JSON string so
the flat-FormData model is undisturbed. The zod side preprocesses `JSON.parse` and validates
`z.array(z.object({...}))` (nullable; refuses malformed JSON and wrong shapes with a readable
message). Verified against the live SW10 sheet: 4 rows, and the sheet's "FPS" column header
actually holds codec values — the documented shape is correct, fps comes from the footnote.

**(e) Conditional sections, uniform validation.** The Workstation section (and
`db_drive_desc`) show/hide on the live `family_type` value — client presentation only. The
schema stays uniform (all archetype-specific columns nullable, matching ADR 0090's "population
is a template concern, not a DB constraint"). Mismatches are *warnings*: workstation with no
`gpu_model` or `camera_matrix`; non-workstation with any GPU field or matrix set;
`db_drive_desc` on a workstation. Hidden-but-filled values are preserved, never silently
dropped — the warning tells the editor what's there.

**(f) No net-usable preview.** The preview was 0096's highest-value element *because*
`usableCapacityTb()` publishes computed figures across five surfaces. Appliance rows feed no
computation — every consumer renders stored display strings — so the preview has nothing to
compute and does not carry over. The matrix editor, the enum selects, and the sheet_group
warning are this form's equivalents, matched to this table's actual failure modes.

## 5. The product_specs form extension (the 22 additive columns) and the shared kit

**New sections appended to the existing `/admin/specs` form** (fields.ts sections 8–12):
Power (`power_wattage`, `power_redundancy`, `power_max_consumption`, `power_ac_input`,
`power_dc_input`, `cooling`), Physical (`dimensions_mm`, `dimensions_in`, `shipping_weight`),
Environmental (`operating_temp`, `storage_temp`, `humidity`), Regulatory & security
(`regulatory_safety`, `regulatory_emissions`, `ndaa_text`, `security_features`), Datasheet
meta (`revision_date`). Placed into existing sections: `warranty_years` + `warranty_terms`
into *Software & support* beside the legacy `warranty` (which stays NOT NULL and untouched,
per the migration's note); `remote_mgmt` into *Networking & power*; `os_drive_desc` and
`display_ports` into their natural sections. 43 fields become 65.

**Two new field kinds** (this is what "clean extension of fields.ts" turned out to require —
everything else fits the existing kinds):

- `date-optional` — `revision_date` (`<input type="date">`; blank → null; zod
  `z.iso.date()`-shaped string).
- `string-list` — `security_features text[]`: rendered one-item-per-line textarea; coerces
  blank → `[]` (**not null** — the column is NOT NULL DEFAULT '{}'), splits/trims/drops empty
  lines on the way in, joins on the way out. Round-trip comparison needs array equality.

**New warnings, same live checks pattern**: `warranty_years` set but contradicting the legacy
`warranty` string's leading digit (drift between the old and structured fields is precisely
what two warranty representations invite); one `dimensions_*` filled without the other
(pairing half-done — though note the live sheets currently print mm only, so blank `_in` alone
stays warning-free... the warning fires only when *neither* convention is followed
consistently: `_in` set without `_mm`).

**The shared form kit — ADR 0096's revisit condition fires now.** "If a second archetype's form
makes the duplication worse than a generic schema-driven editor would be": this is the second
form, and a straight copy would duplicate the kind vocabulary, the zod builders, the coercion
helpers, and the section-walking renderer (~700 lines) with drift risk in exactly the layer
that guards published data. The other extreme — a config-driven generic admin — is an
over-build for two tables. The middle path, chosen:

- Extract into `src/lib/spec-form/` (pure data + zod, no server imports): the `SpecFieldKind`
  union and builders (`requiredText`, `optionalInt`, `blankToNull`, `blankToNumber`, …), a
  generalized `enum-required` / `enum-optional` kind (per-field `options` — the RAID select
  becomes the first instance; `family_type` and the matrix codec the next), the new
  `date-optional` and `string-list` kinds, `initialValuesFromRow`, `specInputFromFormData`,
  and the section-walking `<SpecFormShell>` renderer with a per-table slot for extras (the
  net-usable preview on product_specs; the matrix editor on appliance_specs).
- Per-table and staying that way: each surface's `fields.ts` (sections, hints, rules,
  warnings), `schema.ts` assembly, actions, pages, and bespoke components.
- The existing `/admin/specs` form migrates onto the kit in the same change, proven unchanged
  by the existing schema tests plus the live roundtrip (its whole job is catching exactly this
  kind of refactor regression).

## 6. Verification plan

- **Unit tests**: the new kinds (`date-optional`, `string-list` blank→`[]`, enum), the
  camera-matrix zod shape (malformed JSON, wrong keys, negative fps), the appliance warnings
  (§4b/§4e both directions), and the existing product_specs schema tests still green after the
  kit extraction.
- **`scripts/roundtrip-appliance-specs.mts`** — same three assertions (PARSES / PRESERVES /
  COVERS) against production; deep-equality comparison for `camera_matrix` and
  `security_features`; `INTENTIONALLY_UNSURFACED = {updated_at, updated_by}`; tolerates an
  empty table with an explicit "0 rows — nothing to round-trip yet, coverage unchecked" exit 0
  **before** entry, and becomes the real acceptance check after each row lands (expected
  count: 7).
- **`scripts/roundtrip-product-specs.mts` updated**: comparator learns arrays (for
  `security_features`), the hardcoded `43/43` becomes `${SPEC_FIELD_NAMES.length}`, and the
  count note stays at 21 rows.
- **`scripts/test-rls.ts` block 22** mirroring block 21 a–n against `appliance_specs`:
  SELECT-open both roles, INSERT/UPDATE admin-only (internal refused), DELETE refused for
  partner *and admin* (the withheld grant), provenance stamped on admin write, audit table
  admin-SELECT-only and insert-refused, service_role cleanup.
- `tsc --noEmit`, full suite, eslint on changed files.
- **The roundtrip window** (§7 step ordering): after the migrations apply and before the form
  code lands, the product_specs roundtrip's COVERS check reports exactly the 22 new columns as
  unreachable — correct and expected; landing step 4 closes it. The reverse order would be
  worse (phantom fields → a form whose saves 400), which is why apply precedes code.

## 7. Build sequence (next session; mirrors ADR 0096 §7)

1. **Amend the two migrations** per §2 (provenance/audit/no-delete + 4 columns on
   `appliance_specs`; 4 columns on the additive; renames; both rollbacks; rewrite apply-note
   0090). **Hand to Andy; do not apply.**
2. **Extract the shared spec-form kit** and migrate `/admin/specs` onto it (§5). Pure
   refactor, no behavior change; ships independently of the migrations. Prove with schema
   tests + live roundtrip + tsc + suite.
3. **Andy applies both amended migrations** via the dashboard SQL editor (either order,
   independent), runs the apply-note verify list.
4. **Extend the product_specs form**: fields.ts sections 8–12, the two new kinds, the new
   warnings, roundtrip comparator + count fixes. Land after step 3 (see §6 window). Run the
   roundtrip: 21 rows × 65 fields green.
5. **Build the appliance_specs surface**: fields.ts + schema + actions + three routes + matrix
   editor + nav entry (§3–4); `roundtrip-appliance-specs.mts`; test-rls block 22. Run block 22
   against production.
6. **Entry, through the forms** (§8): Andy enters the 7 appliance rows and fills the 22
   additive columns across the 21 rack rows, from the physical sheets. Run both roundtrips
   after; they are the acceptance check.
7. **Resume `datasheetplan.md` Phase 2** (visual design) — the plan's own next phase, now
   unblocked with its data layer real and writable.

Step 2 is independent of 1/3. Steps 4–5 depend on 3 (and on 2 for the kit). Step 6 depends on
4+5. Step 7 depends on nothing here but sanity — it can start once 3 lands, since the visual
phase works from the PDFs, not the database (per the plan's own note).

## 8. Entry path — confirmed: the form, for all seven rows, and no seed migration

Restating what Phase 1 decided and this design keeps: **`appliance_specs` starts empty and
every row is entered through `/admin/appliance-specs/new`.** No seed migration, no script.
Seeding data inside a migration is the practice ADR 0096 exists to end, and this table is the
first one that gets to start clean. Each of the seven entries is itself the end-to-end
write-path validation — the appliance analogue of the V100 correction that closed §5.1.

Scope note: all **7** rows are entered (V150/V250/V255/V260/V265/SW10/SW20), including the
three ACM SKUs, because the skuExtraData retirement needs their `ssdStorage`-class strings
regardless of the ACM *datasheet* phase being deferred. What stays deferred is ACM-specific
schema (`max_doors`, certified platforms) and the ACM template — nothing about entering the
generic hardware rows now conflicts with that (per `datasheetplan.md`'s deferral).

The honest cost, stated rather than hidden: filling the 22 additive columns across 21 rack
rows through the form is **21 hand edits** (7 distinct chassis value-sets, since family
siblings share power/dimensions/cooling). That is the one-time price of the no-seed principle,
and it is bounded. If it proves painful in practice, a "copy from sibling SKU" prefill on the
edit form is a cheap later nicety — a UI convenience, not a second write path.

## Extension — what this leaves cheaper

- **`camera_specs`** (ADR 0091's flagged duplicate-UI cost): the kit from §5 plus a third
  fields.ts is now the whole build; its write policies already exist.
- **skuExtraData retirement**: after step 6, every override string for management/ACM/
  workstation SKUs has a computed-or-stored equivalent (`ssdStorage` from the drive
  descriptions, `bandwidth` from `max_bandwidth_mbps`, `monitors` from `monitor_support`) —
  the retirement slice becomes a pure consumer change plus the V100 half already shipped.
- **The ACM phase**: adds columns + a fields.ts section + a template variant; the surface,
  audit, and entry pattern are all in place.
