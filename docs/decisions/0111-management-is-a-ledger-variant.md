# 0111 — The management sheet is a Ledger variant, and its capacity figures are columns

- **Status**: Accepted
- **Date**: 2026-07-31
- **Related**: closes the management half of 0110's deferral on its own named revisit
  condition; contrasts with 0109 (Rail is a second template, not a variant); reads on 0096
  (the admin form is the only write path), 0090 (`sheet_group` pairs the two-CPU variants),
  0105 (Ledger renders at three pages), 0104 (a reviewed import, not invented values)

## Context

ADR 0110 shipped datasheet generation with five of fourteen models unrenderable, and was
careful to keep two different reasons apart. The ACM line has **no template designed** — the
handoff puts it out of scope in writing. The V250/V255 management servers have a template
**designed but not built**: the handoff's screenshots 03 and 04 are a finished two-page
design that is *not* a differently-populated Ledger. It replaces the Max Video Stream Rate
table with a Management Capacity table of Role / Cameras / Recording / Notes and no parameter
strip, orders by Part Number / Model / Configuration / Cameras Managed instead of by drive
capacity, and merges two SKUs into single spec values. 0110 named the revisit condition
plainly: *"when the management template is built, at which point the two deferral reasons in
`catalogue.ts` reduce to one."*

Building it forced three decisions.

Two were foreseeable: whether this is a third template or a variant of the first, and how two
SKUs become one set of spec values. The third surfaced while reading the phase-2
transcription: **the two headline figures on the design mockup are not on the real
factsheet.** The transcription of all twelve V5 sheets records `max_bandwidth_mbps` as *"not
found on any server sheet — only SW10/SW20 print a Maximum Bandwidth block"*, and transcribes
no camera count for either variant. The mockup's "1,000 Mbit/s" and "250 / 250+" are the
designer's illustration, not published specifications.

## Options considered

**Template.** A third template beside Ledger and Rail, following 0109 · a Ledger variant with
the two differing page-2 blocks passed in as data · one template with a boolean flag read at
half a dozen points.

**Merging the variants.** Reuse the NVR canonical-row rule (pick one SKU, discard the rest) ·
compose per-variant values, stating a shared value once · store a pre-merged display string
in a column.

**The two missing figures.** Author them in `copy.ts` from the mockup · seed them in the
migration from the mockup · add spec columns and render an em dash until someone enters them ·
omit the blocks entirely.

**Cameras managed, if a column.** One text column holding the sheet's phrase ("Up to 250") ·
one integer plus a qualifier · two nullable integers carrying a floor and a ceiling.

## Decision

**A Ledger variant, not a third template.** The test that decides it is how much is
genuinely different, and the answer is two blocks on one page: the sheet shares page 1, page
3, the header, the footer, the ladder, the warranty band, the photo slots and every styling
rule. `DatasheetContent.performance` is now a discriminated union (`vsr` with its parameter
strip, or `capacity` without one) and `DatasheetContent.orderable` carries its own columns,
weights and per-cell emphasis. Nothing else in `DatasheetPdf.tsx` asks which kind of sheet it
is rendering — that is the test of whether this was the right call.

This is the opposite conclusion to 0109 and for a consistent reason. Rail is a *different
page*: one page, no page padding, a fixed 214px rail down the left, the whole content model
rearranged. Management is the *same page with two blocks swapped*. Forking the template would
have meant a fix to the warranty band or the ladder being made twice, which is the cost 0109
judged worth paying for Rail and is plainly not worth paying here.

**Compose the variants, never pick one.** `variantValue()` states a value both SKUs agree on
once, and composes a differing one as `"5th Gen Zen5 AMD EPYC · V250 = 4245, 6C/12T · V255 =
4465, 12C/24T"`, hoisting the shared leading words out so the family name is not repeated.
The NVR canonical-row rule is deliberately *not* reused: there, three drive capacities of one
chassis share every non-capacity column and a difference is transcription noise, so
discarding siblings is safe. Here **a difference between siblings is the product** — the
whole reason both SKUs exist is that their CPU, cache, RAM and SSD capacity differ — and
discarding one would delete half the sheet's content. The source factsheet composes them the
same way, which is the strongest evidence this is right.

**The two figures are spec columns, and they ship empty.** `max_bandwidth_mbps` already
existed and is null; `cameras_managed_min` / `cameras_managed_max` are new. Neither is
authored and neither is seeded. `copy.ts`'s own header already forbids the first —
*"numbers do not belong here"* — and 0104's reviewed-import precedent does not extend to the
second, because that seed transcribed a real factsheet and there is nothing here to
transcribe. The sheet prints an em dash in the headline strip, the ladder cell and both
tables until someone enters the figures through the form (0096), and `/admin/datasheets`
names the gap in words meanwhile. A throughput or capacity number is a performance claim on a
customer-facing document; a plausible one nobody can source is worse than a visible blank.

**Cameras managed is two nullable integers, a floor and a ceiling.** The single-text-column
version was rejected on a concrete failure: the sheet needs *four* phrasings of this one fact
— `Up to 250` in the tables, `≤ 250 cameras` in the ladder cell, `250 / 250+` merged in the
headline strip, `For deployments over 250 cameras` in a capacity note — so one stored
sentence would have to be re-parsed into the other three. Regex-mining prose to produce a
capacity claim is what this pipeline avoids everywhere else. Two bounds carry the semantics
the sheet actually states (the V250 is a ceiling, the V255 is a floor) and every phrasing
derives from them, so they cannot drift apart.

## Consequences

**Positive:** twelve of fourteen models now reach a PDF, and the deferral note in
`catalogue.ts` reduces to the single ACM reason exactly as 0110 predicted. One entry per
*sheet* rather than per row, so V255 resolves to the V250 sheet through an alias instead of
404ing. 59 new unit tests, run against both states of the data — production's nulls and the
figures once entered — because "renders honestly with the column empty" is what actually
ships today. The picker gained a check with no NVR equivalent: V250 and V255 are one chassis,
so a column that differs between them on anything but CPU, cache, RAM and the OS drive is a
data-entry slip, and it would otherwise render as `"V250 = … · V255 = …"` looking deliberate.
It fired immediately on `raid_level_display`.

**Negative:** `DatasheetContent` gained a discriminated union, so every reader of the page-2
sections is a `switch` rather than a field access. The ordering table's Configuration cell
states cores, RAM and cache but **not** the SSD capacity the mockup shows, because that figure
exists only inside the free text of `os_drive_desc`; both capacities are stated in full on
page 3 instead. And the sheet is not yet sendable — its two headline figures are blank.

**Three things measured rather than assumed:**

*Page fit, again, and by a new route.* The management descriptor — "4 Bay · 1U Rack ·
Management / Directory Server" — is twelve characters longer than the widest NVR one and
cannot sit beside the compliance pills, so it wraps to two lines, exactly as the handoff's own
V250 render does. The first build had it running into the NDAA pill with no gap at all;
giving the hero row a gutter fixed that and immediately pushed the footer onto a **fourth
page**. Page 1's only flexible child is the feature grid and it sits at its content minimum,
so a wrapped descriptor has to be paid for out of the photo frame — the same lever ADR 0110
used for the V700, pulled for a different cause. The height is now `PAGE1_PHOTO_HEIGHT`, 240
for a one-line descriptor and **210** for a two-line one, both binary-searched against the
real template. All ten renderable sheets were re-measured at their specced page counts after
the change.

*The active ladder cell, which deviates from the mockup.* The handoff bars only the V250. The
mockup predates the merged sheet; a page titled "V250 / V255" that marks one of the two as
"where you are" reads as though the other belongs somewhere else. **Both are barred.**

*Two composed values that would have printed wrong.* `storage_summary` is literally `"NA"` on
these rows — the sheet's own way of saying there is no recording volume — and printed raw it
reads as a missing value rather than the deliberate statement it is; it is expanded to "Not
applicable — no video recording volume". And the RAID prose already names CacheVault, so the
NVR adapter's habit of appending the battery flag would have said it twice.

**When to revisit:** when the ACM line gets a design, at which point `catalogue.ts` has no
deferral reasons left and the `unavailableReason` machinery can go. Sooner, if a third CPU
tier joins the V250 sheet — the adapter handles it, but the four-column ordering table and
the "V250 / V255" title were laid out for two.
