# 0071 — Multisensor camera seed: uniform-sensor rows, highest-sensor mixed rule, conservative stitched-panoramic VSR

- **Status**: Accepted
- **Date**: 2026-06-23

## Context

The Phase 10 Step 6 single-sensor seed populated `camera_specs` with 68 rows. The multisensor extension adds multidirectional, multi-imager, PTRZ-combo, and stitched-panoramic models for Hanwha, Axis, and Avigilon. These devices raise three representation questions the single-sensor seed never had to answer, and the answers drive storage and bandwidth sizing, so they are recorded here rather than left implicit in the seed files.

The calculator already supports the math. A loaded model sets `cameras = units x sensor_count` (the source of truth), maps `max_width x max_height` to one RESOLUTIONS bucket via `mapPixelsToBucket` with ADR 0058 round-up, and `vsrLoad` plus the storage and bandwidth paths all read `cameras`. So per-sensor resolution rounds up to its bucket first, then multiplies by `sensor_count`. The schema stays fixed: one row per device, `sensor_count = N`, one per-sensor `max_width x max_height`, and the nullable `sensor_detail` jsonb carries any human-readable breakdown and approximation note.

## Options considered

- **Per-sensor array rows (Option B from ADR 0058).** Most precise for mixed-resolution devices. Rejected again for the same reason: it forces per-sensor granularity through the UI and persistence path for marginal phase-1 benefit. `sensor_detail` still holds the breakdown for later promotion.
- **Average the sensors on mixed-resolution devices.** Rejected. Averaging can under-size the high-resolution sensor, which violates the sizing philosophy.
- **Uniform representation at the highest sensor (chosen).** One row, `sensor_count = N`, every sensor sized at the model's highest-resolution sensor. Conservative and consistent with ADR 0058 Option C.
- **Stitched panoramics sized at the fused stream (1 camera).** Reflects what the VMS records, a single fused image. Rejected as the default because it sizes at the floor and gives up headroom. See the decision below for the conservative alternative chosen.

## Decision

1. **Uniform-sensor representation.** One row per device. `sensor_count = N`, with a single per-sensor resolution applied to all N sensors. No per-sensor array, no schema migration.

2. **Mixed-resolution devices size at the highest sensor.** For devices whose sensors differ in resolution (for example Hanwha PNM-9002VQ with 2MP and 5MP heads, the PTRZ-plus-PTZ combos PNM-C19183RVTP and PNM-C34404RQPZ, and Axis M5000-G with three 5MP overview sensors plus a 1080p PTZ), seed `sensor_count = N` at the highest per-sensor resolution and record the real per-head breakdown plus a conservative-approximation note in `sensor_detail`. Never average, never guess.

3. **Stitched panoramics size as N independent sensors, not as the fused stream.** Axis P38 and Q38 series panoramics (P3818-PVE, P3827-PVE, Q3839-PVE, Q3839-SPVE) stitch several physical sensors into one fused image that the VMS records as a single stream. They are seeded as `sensor_count = N` at per-sensor resolution under the same uniform rule as multidirectionals. This sizes slightly above the true VSR camera-count floor, which is deliberate and consistent with the rock-solid sizing philosophy of provisioning with headroom rather than at the edge. The rationale is captured in each row's `sensor_detail`.

4. **Single-lens panoramics stay single-sensor.** Hanwha PNM-9031RV, A13022RV, C9022RV, and 9022V produce one stitched-lens wide image from one sensor. They remain `sensor_count = 1` at native resolution and are out of multisensor scope.

5. **Roster is input, datasheet is authority.** The three model rosters established which models exist. Every `sensor_count` and per-sensor resolution was confirmed against a manufacturer datasheet or official product page before the row was written. Models that could not be confirmed were left out and listed in the JOURNAL.

## Consequences

**Positive:** conservative sizing that never under-provisions, including a deliberate margin on stitched panoramics. One bucket per model keeps the UI and persistence unchanged. The `sensor_detail` breakdown plus approximation note makes every conservative call auditable. Generous `model_aliases` (bare model number, spacing and case variants, and the self-describing Avigilon part numbers) serve the planned VMS-report import feature.

**Negative:** mixed-resolution and stitched-panoramic models are over-sized by design, so a deployment of these models reads heavier than a per-sensor or fused-stream model would show. `sensor_detail` is collected but still unused by phase-1 math, the small acquisition cost carried forward from ADR 0058.

**When to revisit:** if a customer needs per-sensor accuracy for mixed-resolution multisensor models, promote `sensor_detail` (Option B) into the math. If the stitched-panoramic margin proves too heavy in real quotes, switch decision 3 to size those models at the fused stream.
