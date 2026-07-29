# 0104 — The seven appliance_specs rows are seeded by a reviewed import, not hand-entered

- **Status**: Accepted
- **Date**: 2026-07-29
- **Related**: revisits ADR 0097 §8 (no seed migration, no seed script) on that ADR's own named
  revisit condition; makes the ADR 0103 sibling-prefill moot as the *initial-entry* mechanism (it
  stands for revisions); reads on 0096 (form-as-canonical-write-path)

## Context

ADR 0097 §8 held that the seven `appliance_specs` rows would be hand-entered through
`/admin/appliance-specs/new`, and ADR 0102/0103 built a sibling prefill to cut the retyping down to
two rows plus five prefill-assisted. Immediately after 0103 landed, Andy pushed back: **all seven
rows are already fully transcribed** in `datasheets/datasheet-phase2-step6-entry-reference.md` (build
step 6, 62 fields × 7 rows). Given that, even the prefill still requires hand-typing every per-SKU
field seven times off the reference — which is slower and more error-prone than loading the
already-structured data in one reviewed pass.

The no-seed principle (0097 §8, tracing to 0096) was guarding two specific things: that every write
goes through **one validated path**, and that writes carry **honest audit attribution**
(`updated_by` from `auth.uid()`, null for a `service_role` script). 0097 §8 named its own escape
hatch in the same breath — *"a reviewed import path with audit attribution"* — as the sanctioned way
to revisit this if hand-entry proved the wrong cost. That condition is now met.

Andy also stated explicitly that **attribution correctness does not matter on this first seed**: a
later real edit through the form will stamp a real editor, and the audit trail from that point is
honest.

## Options considered

- **Hold 0097 §8; hand-enter 2 + 5 via the 0103 prefill.** Honours the principle, but pays the
  transcription cost seven times over when the data is already structured.
- **Raw `service_role` seed of the row objects.** Fastest, but bypasses the form's zod entirely — a
  bad RAID level or malformed camera matrix would land in the table unchecked.
- **Reviewed import: `service_role` write, but every row first parsed through
  `parseApplianceForm`.** Keeps the validation half of the principle; drops only attribution, which
  Andy explicitly waived for the seed. This is 0097 §8's named revisit door. **Chosen.**

## Decision

**A one-time script, `scripts/seed-appliance-specs.mts`, seeds the seven rows.** It keeps the two
properties that made the no-seed principle worth having, minus the one Andy waived:

1. **Validated.** Every row is run through `parseApplianceForm` — the *same* zod the form and the
   round-trip use — before anything is written. The script refuses to write if any row fails.
2. **No surprise writes.** Dry-run by default (parses and prints, writes nothing); `--write` inserts
   only into an **empty** table (it reads the count first and aborts if any row exists), so it
   cannot double-insert or partially clobber. One atomic insert of all seven.
3. **Attribution waived for the seed only.** The write uses `service_role`, so the
   `appliance_specs_stamp_updated` trigger records `updated_by = null` on all seven rows. Accepted
   by Andy for the first seed; the next form edit stamps a real editor.

**Where the reference left a value open, the seed made the conservative, no-information-lost call,
recorded in code and here** (all editable afterward through the form): V250/V255 `raid_level_display`
blank (the sheet contradicts itself, §2b-viii; `raid_support` carries the RAID-5 prose);
`battery_raid`/`os_redundancy` blank on the four server rows (the strings already live in
`raid_support`/`os_drive_desc`, and splitting invites drift); V260/V265 `raid_level_display` = `1`
(the sheet says "Mirroring" plainly); the reference's proposed `model_name` on all seven.

Acceptance is `scripts/roundtrip-appliance-specs.mts`: 7 rows, all parse clean, 62/62 fields
preserved, sheet groups V250 and V260 paired and V150/SW10/SW20 solo — all green.

## Consequences

**Positive:** the table is populated in one reviewed pass instead of seven form sessions, from data
that already existed; validation is identical to the form's, so nothing malformed can land; the
round-trip confirms every row. The 0103 prefill is not wasted — it remains the mechanism for
*revisions*, when a chassis sheet changes and its shared block moves across a family.

**Negative:** all seven rows carry `updated_by = null` and an unattributed audit row until first
edited — a real but accepted gap for a seed. The `id` (SKU) is the one field not correctable through
the app (no DELETE grant; `id` is read-only on the edit form), so a wrong SKU in the seed would need
`service_role` to fix — mitigated by the dry-run, the zod parse, and the empty-table guard. This is
a genuine reversal of 0097 §8's letter, justified only because that ADR pre-authorised exactly this
door and the data was already transcribed and reviewed.

**When to revisit:** if a future table is tempted to seed *without* the validation pass (don't — that
is the raw-seed option this rejected); or if attribution ever needs to be correct at seed time, in
which case the script signs in as a real admin (email/password) instead of using `service_role`, and
the trigger stamps that user.
