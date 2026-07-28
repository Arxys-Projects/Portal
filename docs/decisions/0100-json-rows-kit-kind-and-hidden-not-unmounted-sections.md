# 0100 — Structured jsonb editing is a spec-form kit kind, and archetype sections hide rather than unmount

- **Status**: Accepted
- **Date**: 2026-07-28
- **Related**: 0097 (the surface this implements — §4d the camera-matrix editor, §4e the
  conditional sections, decision 4 the shared kit), 0090 (the jsonb shape, and the
  "unvalidated JSONB" negative this closes), 0096 (the one-field-list-drives-everything pattern)
- **Design**: [`datasheets/datasheet-phase2-admin-surface-design.md`](../../datasheets/datasheet-phase2-admin-surface-design.md)

## Context

ADR 0097 §4d specifies a structured five-key editor for `appliance_specs.camera_matrix`,
serialised through one hidden input and validated by zod. §5 lists the shared kit's contents and
names the matrix editor, in passing, as the second instance of the kit's per-table `extras` slot
(the first being the product_specs net-usable preview). Building it surfaced a conflict between
that placement and the design's own §3, which lists `camera_matrix` as a field of the Workstation
section alongside the GPU columns.

The two cannot both hold. `extras` renders above the fields, outside the section walk. A field
that is in the field list but rendered outside it would still need a rendered input, or its value
would not submit; and the round-trip's COVERS check reads the field list, so leaving it out of
the list is not an option either.

§4e has an adjacent problem. It calls the workstation sections' show/hide "client presentation
only" and requires that "hidden-but-filled values are preserved, never silently dropped". A
React form gets that wrong by default: the natural implementation is conditional rendering, and
an unmounted input is absent from `FormData`, which every action here reads as `null`. Switching
a row to `management` and saving would then blank eleven GPU columns and the matrix, with the
warning that was supposed to protect the values having been the thing that hid them.

## Options considered

**Where the matrix editor lives**

- **Bespoke component in the `extras` slot**, as §5's aside suggests — matches the letter of that
  sentence; puts the editor above the form, away from the section it belongs to, and leaves
  `camera_matrix` in the field list with no renderable kind.
- **A `json-textarea` kind** (raw JSON in a textarea, zod-validated) — smallest change; leaves
  ADR 0090's "unvalidated JSONB" negative substantially open at the human end, which is the end
  that matters when the form is the only write path.
- **A generic `json-rows` kit kind** with a declarative column spec per field — the kit owns the
  mechanism (typed cells, add/remove row, one hidden input, an array-of-objects zod builder), the
  per-table field list owns the columns. **Chosen.**

**How archetype-specific sections disappear**

- **Conditional rendering** — the obvious React idiom; silently blanks whatever was filled.
- **Hidden but mounted** (`hidden` on the fieldset and the field wrapper) — inputs keep
  submitting, so the values survive and the warnings can name them. **Chosen.**
- **Render always, warn only** — no hiding at all; a 62-field form asks an editor to ignore
  twelve fields that do not apply, which is what the archetype split exists to avoid.

## Decision

**1. `json-rows` is a kit field kind, not a per-table extra.** `SpecJsonRowsField` carries
`columns: {key, label, kind: text | int-positive | enum, options?}[]`; the kit builds the zod
`z.strictObject` array from them and renders the table of typed cells. `appliance_specs`'
`fields.ts` declares the five camera-matrix columns and nothing else about the mechanism. The
field renders inside the Workstation section like every other field, so the invariant ADR 0096
built the pattern on — one field list drives the schema, the inputs and the coverage check —
holds for the jsonb column too.

Two details are load-bearing. Rows are `strictObject`, so an unrecognised key is *refused* rather
than stripped: stripping would silently discard whatever a previous write put there, which is the
failure this kind exists to close. And nested zod issues are re-keyed onto the field with the row
number moved into the message (`Row 2: Cameras must be greater than 0.`) — a `camera_matrix.1.cameras`
key matches no input, so the shell would render "fix the highlighted fields" with nothing
highlighted. The same re-keying now applies to `string-list` entry errors, which had that defect
and no way to show it.

**2. Hidden form sections stay mounted.** `<SpecFormShell>` takes `hiddenSections` /
`hiddenFields` predicates over the live values and sets the `hidden` attribute; it never unmounts.
Only nullable fields may be hidden (a hidden `required` input makes the browser refuse to submit
with nothing to focus). The appliance form hides the Workstation section on non-workstation rows
and `db_drive_desc` on workstation rows, and `applianceWarnings` names any value sitting out of
view — the value is saved as entered, and the editor is told it is there.

**3. The `extras` slot stays, unused by this form.** It remains the right home for a treatment
that is not a column — the net-usable preview computes from four fields and writes none. The test
of whether something belongs in `extras` is whether it *is* a field: the matrix is one.

## Consequences

**Positive:** ADR 0090's standing "the camera matrix's internal shape is unvalidated JSONB"
negative closes at both ends — a typed editor at the human end, a strict array-of-objects schema
at the only write path. The kit gains the kind `camera_specs.sensor_detail` will want, at no
extra cost when that surface is built. Nested list errors are visible in the form for the first
time, `security_features` included. An archetype switch can no longer blank a dozen columns.

**Negative:** the kit now owns a widget, not only kinds and builders — a bigger surface than "data
+ zod + a renderer", and a third table wanting a *differently shaped* jsonb editor will have to
either generalise `json-rows` further or take the bespoke route after all. Hidden-but-mounted
fields mean a save always carries values the editor cannot see, so the warnings are the only
signal that they exist; they are worded to say the values will still be saved, but a warning is
weaker than a visible input. `hidden` also removes the fields from the tab order without removing
them from the DOM, so an assistive technology reports the form as shorter than it posts.

**When to revisit:** if a third jsonb column needs a shape `json-rows`' flat typed columns cannot
express (nested objects, per-row optional keys), at which point either the kind grows a proper
sub-schema or that column takes a bespoke editor; if hidden-but-filled values turn out to confuse
editors in practice, which would argue for surfacing them read-only in the warning rather than
only naming them; or if a future field genuinely needs to be absent from a submission, which this
arrangement deliberately makes impossible.
