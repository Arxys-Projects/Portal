# 0101 — Factsheet transcription conventions for hand-entered spec data

- **Status**: Accepted (conventions 1–5); four sheet-level questions open, listed below
- **Date**: 2026-07-28
- **Related**: 0097 (the form-is-the-entry-path decision this serves), 0090 (the schema shape the
  sheets are being mapped onto), 0096 (the admin-editable pattern), 0092 (the
  under-spec-by-silent-derivation failure this guards against in a different layer)
- **Reference document**: [`datasheets/datasheet-phase2-step6-entry-reference.md`](../../datasheets/datasheet-phase2-step6-entry-reference.md)

## Context

ADR 0097 decision 5 made the admin form the only entry path for 28 rows of spec data: the 22
additive columns across 21 `product_specs` rack rows, and all 62 fields across 7 new
`appliance_specs` rows. The values come from twelve V5 Illustrator factsheets, transcribed by
hand.

Preparing that transcription surfaced a problem the schema design could not have seen: **the
sheets and the columns are not one-to-one.** A factsheet block sometimes carries two or three
columns' worth of data in one printed paragraph (Power Specifications runs PSU → AC input → DC
input), sometimes carries one column's data under a heading naming two (*"Safety & Emission
Standards"* for `regulatory_safety` + `regulatory_emissions`), and sometimes labels a column
wrongly (the workstation camera matrix's "FPS" header holds codec values).

Each of those needs a consistent answer, applied the same way across all 28 rows, or the stored
data reads inconsistently and the round-trips pass while publishing a mess. The answers are not
derivable from the schema or the sheets — they are choices. Left undocumented, they are the kind
of thing that rotates out of head in weeks and gets re-decided differently on the next entry pass
or the first sheet revision.

Separately, transcription found four places where a sheet is internally contradictory or
disagrees with the Price Book. Those are not conventions — they need Andy's or the marketing
team's answer — and they are recorded here rather than resolved so they cannot be quietly guessed
away.

## Options considered

- **Transcribe verbatim into one field per sheet block, add columns where a block spans two** —
  no judgment needed, but reopens the schema after apply and leaves e.g. `power_ac_input` unfilled
  on every row while a `power_specifications` blob carries it.
- **Split blocks across the existing columns on a documented convention, accept the overlap** —
  no schema change, each column reads correctly on its own, one written-down rule per ambiguity.
  **Chosen.**
- **Let each row be entered on whatever reading looks right at the time** — the do-nothing option;
  guarantees drift between the 21 rack rows and makes a later diff meaningless.
- **Fix the sheets first, then transcribe** — correct in principle, blocks build step 6 on a
  marketing-asset revision cycle. The contradictions are recorded and transcribed as printed
  instead.

## Decision

**Five conventions, applied to all 28 rows.**

1. **The Power Specifications block splits four ways**: PSU descriptor → `power_wattage`,
   redundancy phrase → `power_redundancy`, AC line → `power_ac_input`, DC line →
   `power_dc_input`. `power_redundancy` deliberately repeats a phrase also inside
   `power_wattage`, so that neither field is misleading read alone.
2. **`regulatory_safety` takes the whole combined line; `regulatory_emissions` stays blank** on
   all 28 rows. No sheet separates safety from emissions, and splitting `CE`/`UL` from `FCC`/`RCM`
   would be invention presented as a sheet value.
3. **`security_features` splits the *Credential & Key Encryption* list on its `·` separators**
   into ten items, with `TPM 2.0 FIPS, CC-TCG certified` as one item (the comma is internal). The
   V400 sheet prints a comma where the others print a `·`; it is normalised to the same ten
   items — the one place transcription deliberately departs from verbatim.
4. **`revision_date` reads the page-1 `rev:` footer as MM/DD/YYYY**, and is left blank where the
   footer carries a version (`rev: 2.0`), nothing at all, or no stamp. Seven of twelve sheets get
   no revision date.
5. **Unlabelled GHz pairs split base-then-boost** into `cpu_base_ghz` / `cpu_turbo_ghz`. The
   sheets print `3.9Ghz/5.1Ghz` with no labels; the convention is the AMD one and the second
   figure is always the larger.

**Values absent from a sheet are entered as blank, never inferred.** This is the operative rule
behind every "not found on sheet — leave blank" in the reference document, and it is worth stating
as a decision because the tempting alternatives all exist: `gbe_1_ports` could be filled from
`families.ts` marketing copy, `drive_bays` could be counted off the drive blocks, `storage_temp`
could be copied from a sibling sheet. None of those is what the sheet says. A blank column is
honest and visible; a plausible wrong value is neither, which is the same argument ADR 0092 made
about derived capacity one layer down.

**Sheet contradictions are transcribed as printed and recorded in that row's `notes`**, not
silently corrected. `notes` is a real column on both tables and is the right home for "the sheet
says 36 drives on a 24-bay box" — it travels with the row.

## Consequences

**Positive:** the 28 rows are internally consistent and every value traces to a named sheet block,
so a later sheet revision can be diffed against the stored data. The conventions are one document
away rather than in whoever typed the rows. Blanks mark real gaps in the source material instead
of hiding them, which is what makes the round-trip's coverage check meaningful. Sheet errors are
captured at the point of entry rather than propagating into published datasheets.

**Negative:** `power_redundancy` duplicates text inside `power_wattage`, so those two columns are
not independent. `regulatory_emissions` is a column that will be null on every row for the
foreseeable future — a schema element earning nothing, kept because the sheets could separate the
two later. Several fields (`battery_raid`, `os_redundancy`, `hotswap_power` on the appliance rows)
are only reachable by re-splitting another field's block, so the reference document leaves them as
split-or-blank judgment calls rather than settling them — a small inconsistency accepted rather
than over-specified. And the V400 `security_features` normalisation means one row's stored value
does not match its sheet character-for-character.

**When to revisit:** if a sheet revision separates safety from emissions (convention 2 dies and
`regulatory_emissions` gets filled); if a future sheet prints a labelled base/boost pair or a
genuinely unordered GHz pair (convention 5); if the ACM phase adds `max_doors` and the certified-
platform list, which are on the sheets today with nowhere to go; or if a second entry pass finds
these conventions were applied inconsistently, which would argue for encoding them as form hints
rather than a document.

## Open questions, not decided here

These are sheet problems, not convention problems. They are listed so they are not lost, and the
reference document flags each at its point of use.

1. **`VX5-V265-ACM` has no V265 column** — the ACM sheet is titled *V260/V270* and its second
   variant is V270. Either the sheet is stale on the model number, or a V265 sheet exists that was
   not found. Every V265-only value is currently sourced from the V270 column, marked as such.
2. **V400's `rev: 05/12/2025`** is the only date genuinely ambiguous under convention 4 — May 12
   or 5 December. The other four dated sheets read as October either way.
3. **The V250 sheet contradicts itself on RAID level** — page 2 says *"Hardware RAID 5 Fault
   Tolerance"*, page 1 says *"HW RAID Mirrored SSDs"*, and the 2+2 SSD layout is mirroring.
   `raid_support` takes the page-2 prose verbatim; `raid_level_display` is left unset pending a
   decision.
4. **The V150 sheet shows one 480GB OS SSD; `families.ts` `skuExtraData` publishes `2x 480GB`.**
   This matters to the skuExtraData retirement, which plans to read `ssdStorage` off
   `os_drive_desc`.

Two further items are sheet corrections rather than entry decisions: the V700 sheet prints the
V800's *"W/ 36x HDDs = 72k/167lbs"* weight on a 24-bay chassis, and the V150 sheet calls its
single PSU *"hot-plug redundant"* in the Max Power Consumption block while page 1 says *"Single
Power Supply"*.
