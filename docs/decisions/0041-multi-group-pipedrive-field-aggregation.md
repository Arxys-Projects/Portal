# 0041 — Multi-group aggregation of Pipedrive per-stream deal fields

- **Status**: Accepted
- **Date**: 2026-05-28

## Context

A submission can contain several camera groups, each with its own resolution, frame rate, codec, scene complexity, recording duty cycle, and motion estimate. The Pipedrive deal carries one row, so the original sync ([`0020`](./0020-pipedrive-deal-creation-on-submission.md)) surfaced only the *primary* group (the one with the most cameras) on the per-stream fields — `buildDealFields` read `submission.primaryGroup`. To sales this looked like the deal was "averaging" or hiding the other groups: a project with 15/10/20 FPS groups showed just "15".

The ask: every per-stream field should list **all** the distinct values actually used, human-readably, on both new submissions and revisions. This is not a revision-specific change — it's how `buildDealFields` builds the per-stream portion for every deal write.

The complication is field *type*. The Pipedrive deal fields are a mix: Frame Rate / Motion Activity % / Resolution / Recording hours are free-text (`varchar`), Scene Complexity is a multi-select **set**, and Recording and CODEC are single-select **enums** that hold exactly one option ID. "List them all" is trivial for free-text and set fields, but structurally impossible for a single-select enum.

## Options considered

- **Keep surfacing only the primary group.** Status quo; hides real data sales needs. Rejected.
- **Average numeric fields.** What sales *thought* was happening; loses the spread and is meaningless for codecs/complexity. Rejected.
- **List distinct values, sorted ascending, per field type.** Free-text fields get a comma-separated distinct-sorted list; the set field gets all distinct option IDs comma-joined; the two enums collapse deterministically. Chosen.
- **Force CODEC/Recording to free text too.** Would let them list all values, but these are admin-curated enums with option taxonomies — writing free text to an enum field is rejected/dropped by Pipedrive and we don't own those field types. Rejected.

## Decision

`buildDealFields` aggregates **across all groups** (`submission.groups`), per field type:

- **Free-text lists — Frame Rate, Motion Activity %, Recording hours:** distinct values, sorted ascending, comma-separated (`distinctSortedNumberList`). e.g. groups at 15/10/20 FPS → `"10, 15, 20"`. Recording hours is the distinct set of `round(recordingPercent/100 × 24)` per group.
- **Resolution → uniform megapixels.** Every resolution label is forced to an MP number via `resolutionLabelToMp`: parse the `(W×H)` suffix every label carries, compute `round(W·H / 1e6)`, floor at 1MP so sub-megapixel modes don't render `0MP`. Distinct, sorted ascending, suffixed `MP` → `"2MP, 4MP, 8MP"`. Marketing labels and pixel dimensions are deliberately dropped; two labels that round to the same MP (e.g. the two 4MP variants) collapse to one entry.
- **Scene Complexity (multi-select set):** all distinct tier option IDs, comma-joined and sorted → `"287,289"`. This is the one field type that can genuinely hold the full set.
- **Recording (single-select enum):** can't list multiple, so it collapses deterministically — if **any** group records below 100% duty cycle the whole deal flips to "On Motion" (119); all-continuous stays "Continuous" (118).
- **CODEC (single-select enum):** holds one option, so send the **dominant** codec — the one used by the most cameras summed across groups; ties resolve to first-seen. Minority codecs are not shown on this field.

`actions.ts` passes a `groups` array (one entry per `computed` group, each carrying its `cameras` count) in place of the old single `primaryGroup`. The create and revision paths both flow through `buildDealFields`, so the aggregation is identical for new submissions and revisions ([`0040`](./0040-pipedrive-deal-update-on-revision.md)).

## Consequences

**Positive:**
- Sales see the full spread of every per-stream characteristic, not one group's value.
- Resolution is uniform and comparable (MP only), no mixed marketing-label/pixel noise.
- Field-type-correct: set fields list everything, enums hold a single valid option, so no write is silently rejected by Pipedrive.

**Negative:**
- CODEC shows only the dominant codec; a mixed-codec project loses the minority codec on that field. Accepted — the field type can't represent more, and the dominant codec is the most representative single value.
- The MP rounding can make two distinct sensor resolutions look identical (e.g. both 4MP variants → `"4MP"`). Intended — sales care about the MP tier, not the exact pixel grid.
- Recording's "any-motion ⇒ On Motion" is lossy: a deal that's mostly continuous with one motion-only group reads as On Motion. Accepted as the conservative, deterministic collapse.

**When to revisit:**
- If sales need the minority codec or per-group detail, move that breakdown into the deal note rather than fighting the enum field type.
- If a Pipedrive admin converts CODEC or Recording to a multi-select set, switch them to the same distinct-list treatment as Scene Complexity.
