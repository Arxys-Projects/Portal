# Calculator math — Phase 2 implementation plan

- **Date**: 2026-08-12
- **Status**: Decisions made, not built. This document is the authority for what Phase 2 implements.
- **Source**: [`docs/audits/calculator-math-audit.md`](./audits/calculator-math-audit.md) — Phase 1 findings (read it before writing code; §7 is the decision list this plan answers, §8 is the live Milestone re-audit that supplies most of the target numbers).
- **Phase 1 landed**: the golden regression harness ([`src/lib/calculator/golden.test.ts`](../src/lib/calculator/golden.test.ts) + `__golden__/`). Every change below must be diffed through it.

## Governing principle

**One deliberate buffer. Everything else models reality as accurately as the evidence supports.**

The Phase 1 audit found the engine carried at least four overlapping margins (a +4.07% bitrate bias, a ×1.2 "database overhead", a ×1.2 hardware floor, and an unsourced 0.2 motion floor), none individually stated and none multiplied together anywhere. Phase 2 removes all of them and replaces them with a single user-visible buffer slider. Accuracy corrections must not be repurposed as hidden margin, and margin must not be hidden inside accuracy.

Net effect on the required-nameplate multiplier over accurately modeled video: **×1.499 today → ×1.306** at the new default. Individual deal shapes move much more (see "Expected movement").

---

## Decisions

### D1 — Codec table: H.265+Smart replaces H.264-Smart

`CODEC_BITRATE.smart` (0.0444) is retired. It was `0.70 × H.264` — smart-on-H.264, from unsourced legacy factors — and sat **20% above plain H.265**, so choosing it *added* storage. No source anywhere supports that.

- New key **`h265smart` = `h265 × 0.80`** (a 20% saving on plain H.265).
- 20% is the deliberately conservative end of the evidence. Vendor claims run 30–80% (Hikvision 66.8% avg, Axis Zipstream "50%+", Hanwha 30–80%); independent measurement is much lower and scene-dependent (IPVM 20–30% on H.265+; Benchmark measured 47% in good weather collapsing to 7–18% in rain). 20% is the measured floor for constant-motion scenes. Rationale: never risk under-spec.
- **Add a new key; do not redefine `smart` in place.** The codec value is persisted per group in `groups_payload`. Redefining it would make every already-banked `smart` row read as H.265+Smart when it was quoted as H.264-Smart. Drop `smart` from the picker, keep it resolvable in `compute.ts` so historical rows stay interpretable, and label it "H.264-Smart (retired)" anywhere old submissions render.

### D2 — Motion becomes a duty cycle; the codec carries the damping

Delete `applyMotionAdjustment`'s `0.2 + 0.8·m`. It was unsourced, matched no vendor model, and was wrong in *direction* for CBR cameras (idle CBR pads to 100% of target, so a CBR camera on "Motion-only 50%" was under-sized ×0.6).

Three orthogonal controls, no blended coefficient anywhere:

| Control | Multiplies | Values |
|---|---|---|
| Operation Hours | hours of day recorded | existing 1–24 |
| Recording mode | fraction of those hours written | Continuous = 1.0 · Motion-triggered = motion% **exactly, no floor** |
| Codec | bitrate per pixel | `h265` · `h265smart` · `h264` |

- Milestone bills motion exactly this way — confirmed first-party in audit §8 (×0.70 at motion 70%, data rate invariant to motion %, an exported proposal reproduced to five digits).
- **Do not build a separate smart-damping slider.** D1's codec coefficient *is* the damping. A second knob would express the same physical effect twice and multiply — the compounding this phase removes.
- Keep the existing 20% UI clamp on the duty cycle. With no floor in the math it becomes the only limit on how aggressive a user can be.
- Default stays Continuous. Constant mode no longer needs to pin motion server-side — the mode means 1.0.
- Consequence to expect in the golden diff: motion-triggered groups get **smaller** (×0.60 → ×0.50 at motion 50%; ×0.36 → ×0.20 at motion 20%).

### D3 — One buffer slider replaces both ×1.2 constants

Delete `STORAGE_OVERHEAD` ([`tables.ts:77`](../src/lib/calculator/tables.ts)) and `STORAGE_FLOOR` ([`algorithm.ts:44`](../src/lib/recommend/algorithm.ts)). Together they were ×1.44, in two files, documented as "distinct" but both partly margin against the same estimate uncertainty.

Replace with **one per-project slider using Milestone's utilization-cap arithmetic**:

```
required_available_capacity = required_recorded_data / utilization_pct
```

- **Range 60%–90% utilization** (= 40%–10% buffer). **Default 90% (10% buffer).**
- Semantics are a *cap*, not an additive margin: 90% → ÷0.90 = ×1.111. Do not implement as ×1.10.
- Label it as Milestone labels it (Max disk utilization) so the number is directly comparable to a Milestone or Genetec proposal.
- Evidence for the 10% default: Milestone defaults Max Disk Utilization to **90% on auto-select** (70% when a specific Husky model is picked); Genetec Security Center applies **10%, partner-adjustable 10–30%** (field evidence from partner-supplied proposals — see the audit's §C5 correction). Both reference tools default to 10%, both cite price pressure.
- The default sits at the **floor** of the range deliberately: every adjustment a user can make adds margin, never removes it.
- Banked per submission and **propagated to every document, message and PDF** (see Propagation).

### D4 — Charge the binary conversion in sizing

The engine is decimal end-to-end and never charges the decimal→binary loss, so a quoted 720 TB delivers ~643 TB of VMS-visible capacity. Partners currently close that gap by hand ("multiply net usable by 10% to get approximate").

Adopt Milestone's exact formula, reversed from two exported proposals in audit §8 and confirmed on both:

```
available = RAID_net_decimal × 0.8931       (= 0.9095 decimal→binary × 0.982 formatting allowance)
```

- Apply it in sizing: `required_RAID_net_decimal = required_available / 0.8931`.
- Publish the `available` figure alongside the existing decimal net-usable per SKU, so a partner can match it against a Milestone proposal's "X TB of Y available" line. This closes ADR 0092 item 3, decided 2026-07-24 and never built.
- This is **physics, not buffer** — keep it separate from D3 in both code and copy.

The resulting single stack:

```
modeled raw video                    ← accurate: D5 anchor, D6 fps curve, D1 codec, D2 duty cycle
  + audio/metadata (D8)              ← counted data, not buffer
  = required recorded data
  ÷ utilization%  (D3 slider)        ← THE ONE BUFFER
  = required available capacity
  ÷ 0.8931        (D4)               ← physics
  = required decimal RAID-net capacity
  ÷ parity ratio  (existing usableCapacityTb, unchanged)
  = required drive nameplate → SKU selection
```

### D5 — Full re-anchor to Milestone's decimal figure

The ADR 0050 gate test matched a **binary** Kbit quantity against Milestone's **decimal** figure. At the reference point the engine bills 2,046 decimal kbit/s where Milestone says 1,966: +1.63% intended rounding plus **+2.44% nobody chose**. Re-anchor fully — the buffer slider is now the declared margin, so the bitrate must be accurate.

Derive from the anchor: 1,966 kbit/s at 2560×1440 / 15 fps / H.265 / complexity 1.0.

```
h265      = 1_966_000 / (3_686_400 × 15) = 0.0355487
h264      = h265 × 1.724                = 0.0612860
h265smart = h265 × 0.80                 = 0.0284390
```

- **Keep 4MP = 2560×1440.** MSD's "4MP" bucket moved to 2592×1520, but the published VSR ratings are defined at 2560×1440 (D10) — changing the bucket would desync the camera floor's rating basis from the storage math. Document the difference; don't adopt it.
- **H.264 ratio 1.724, not the legacy 1.714** — 1.724 is the live MSD measurement (2774/1609 at Low/12 fps, audit §8). Since we are anchoring to Milestone, use Milestone's ratio. *(Sub-decision, not explicitly ratified — flag it in the ADR and confirm with Andy.)*
- The `compute.test.ts` gate test's expected values change. Update them to Milestone's figures (1966 / 2950 / 4424 / 6637 / 9832 decimal at 4MP/15/H.265 across the five tiers) and keep them as the gate.

### D6 — fps exponent 0.90, anchor-preserving

Milestone's own tool scales sub-linearly: measured b ≈ 0.90 across a 10/12/15/18 fps sweep, reproduced on three complexity tiers (audit §8). Measured encoder *emission* supports 0.6–0.77, but 0.90 is what preserves parity with the anchor tool.

**Implement anchor-preserving, or the calibration breaks:**

```
effective_fps = 15 × (fps / 15) ^ 0.90
```

15 fps is unchanged; 12 fps bills 12.2756 instead of 12 (+2.30%). A raw `fps^0.9` would destroy the anchor — do not do that.

### D7 — Quoted bandwidth becomes the event peak

`bandwidthMbps` currently inherits the motion weighting, so the quoted Mbit/s is a time-average. Milestone's exported proposals quote the **full event rate** (271.58 Mbps/server = Σkbit ÷ 4 ÷ 1000, audit §8). Networks must carry the peak.

- Bandwidth: compute at duty cycle 1.0, always.
- Storage: keeps the duty cycle. These two now deliberately differ; say so in the copy next to the figure.
- Also fix the display bug while here: `bitrateMbps` ([`compute.ts:148`](../src/lib/calculator/compute.ts)) is binary Mibit labeled Mbit, 4.63% below what the engine bills, and [`calculator-form.tsx:1040`](../src/app/(app)/calculator/calculator-form.tsx) then ×1000s it to print "Kbit/s". Make both decimal.

### D8 — Audio and metadata are counted, not absorbed

Unmodeled today (grep-verified). Audio 24–64 kbit/s/camera = 0.6–3.2%; analytics metadata 4–100 kbit/s = 0.5–5%. Combined **2–8%** undercount where those streams record.

- Add a **per-group toggle** ("records audio / analytics metadata") applying **+5%**, **default ON**.
- Default ON because the published VSR rating profile itself specifies "On motion, VMD + metadata" (D10) — metadata is part of the profile the boxes were rated against.
- A toggle rather than a blanket adder keeps the math accurate when those streams genuinely aren't recorded. This is counted data; it is **not** a second buffer, and no other margin may be added alongside it.

### D9 — Per-group retention (Phase B)

Today one flat `retentionDays` (1–730) per submission applied to every group, so mixed-retention projects over-quote at the longest requirement. Regulated ranges make this real: Nevada gaming 7→15 days, cannabis 30–180 by state, PCI/PII 90.

Move retention to the camera group. Additive at the schema level; broad at the surface level. Sequenced second — see Sequencing.

### D10 — VSR rating basis (Phase C)

The rating profile is **already published in-repo**: [`LEDGER_VSR_PARAMETERS` + `LEDGER_VSR_CAPTION`](../src/lib/datasheet/copy.ts) — 4MP · 2560×1440 / 15 fps / H.265-20 "Good" · ~3.2 Mbit/s / on motion, VMD + metadata / 75% motion / 30 days. Audit §7.9's "no document traces these ratings" is answered; what has no trace is the measurement behind the platform-validation claim.

- **The rating basis is complexity tier 2 (Medium-Low, 1.5).** The labels predate the ADR 0049/0050 retier, so the bitrate is the reliable part: 3.2 Mbit/s is +8.5% above re-anchored tier 2 (2.95) and −27.6% below tier 3 (4.42). Tier 2 is the only tier within 10%. The +8.5% is conservatism in the camera floor's favour.
- **Open — Quick Calc's pinned complexity conflicts.** ADR 0082 pins Quick Calc to this exact profile except complexity **2.25**. So the default sizing profile bills 4.42 Mbit/s per stream while the published stream ratings were established at 3.2. Since `vsrLoad` ([`compute.ts:33`](../src/lib/calculator/compute.ts)) is `cameras × MP/4` and varies with resolution only, a tier-3 deal presents streams 38% heavier while producing an identical VSR load, with `VSR_FLOOR` ×1.1 the only cushion. **Needs Andy's decision**: move Quick Calc's pinned complexity to 1.5, or derate the ratings for higher tiers.
- **Whether stream capacity scales with bitrate is a bench question**, not a coefficient — it could be decode-bound, write-bound or bitrate-bound. Do not invent a derate factor. Phase C is an ADR recording tier 2 as the basis plus a bench note; the `vsrLoad` model change waits on measurement.
- Also: three hardcoded copies of the profile now disagree — the price book states "~3–5 Mb video file, h.264.20 & h.265.20", no resolution, at [`page.tsx:247`](<../src/app/(app)/price-book/[slug]/page.tsx>) and again at `:425`. Consolidate to one source.

---

## Sequencing — three separate sessions

Land these **separately**. If the coefficient changes and per-group retention land together, the golden diff can't attribute a movement to either.

| Phase | Scope | Migration |
|---|---|---|
| **A** | D1–D8 + D5's gate-test update | buffer column + `calc_version` on `submissions` |
| **B** | D9 per-group retention | retention moves into `groups_payload` |
| **C** | D10 VSR ADR + bench note, profile-copy consolidation | none |

## Propagation (Phase A and B both)

The buffer setting and the new `available` figure must reach every surface. From a repo sweep, twelve:

`submissions` schema · [`calculator-form.tsx`](<../src/app/(app)/calculator/calculator-form.tsx>) · [`quick-calc/actions.ts`](<../src/app/(app)/quick-calc/actions.ts>) · [`compute.ts`](../src/lib/calculator/compute.ts) + [`algorithm.ts`](../src/lib/recommend/algorithm.ts) · [`submission-detail.tsx`](<../src/app/(app)/_components/submission-detail.tsx>) + [`load-submission.ts`](<../src/app/(app)/_components/load-submission.ts>) · [`SubmissionPdf.tsx`](../src/lib/pdf/SubmissionPdf.tsx) + [`render.ts`](../src/lib/pdf/render.ts) · [`ProjectQuotePdf.tsx`](../src/lib/project-quote/ProjectQuotePdf.tsx) + [`assemble.ts`](../src/lib/project-quote/assemble.ts) + [`snapshot.ts`](../src/lib/project-quote/snapshot.ts) + customer-proposal · [`submission-notification.ts`](../src/lib/email/submission-notification.ts) · [`pipedrive/deal.ts`](../src/lib/pipedrive/deal.ts) · [`cell-value.ts`](../src/lib/price-book/cell-value.ts) + [`net-usable-preview.tsx`](<../src/app/(app)/admin/specs/_components/net-usable-preview.tsx>) · golden regenerate.

### `submissions.storage_tb` changes meaning

Today it banks raw video × 1.2, with the floor applied later in the recommender and the binary conversion never charged. Under the new model it banks required-available-capacity, buffer included, binary charged. Already-issued documents are safe (they render from banked values — audit §Q7 confirmed nothing recomputes), but the column stops being comparable across the boundary.

**Add `calc_version` to `submissions`; old rows are version 1.** Do not backfill a buffer value — no single setting reproduces the old ×1.44 under the new semantics.

## Verification

1. **`npm test` green**, and the golden diff reviewed line by line, not accepted blind. Regenerate with `UPDATE_GOLDEN=1 npm test`; the diff ships with the change.
2. **Reproduce Milestone's own exported proposals** — the strongest external acceptance test available, both reversed exactly in audit §8:
   - 4 cameras, Medium-Low/4MP/H.265 at 10/12/15/18 fps, 24 h, 30 days, motion 70% → **2.46 TB**, 68.97% of 3.57 TB available on a 1×4 TB box.
   - 400 cameras, 4× Husky HE1000R (8×16 TB) → **246.373 TB**, 71.85%, **85.73 TB available/server**, 271.58 Mbps/server.
   - `usableCapacityTb(128, 8, "6")` must stay `96`; `96 ÷ 1.024³ × 0.9819 = 85.733`.
3. **Gate test** re-anchored to 1966 / 2950 / 4424 / 6637 / 9832 decimal.
4. **Expected fixture movement**: multiplier ×1.499 → ×1.306. Deal-shape effects on top — H.265+Smart −20% on groups selecting it; duty cycle −6.3% at motion 75%, −17% at 50%, −44% at 20%; fps +2.3% on 12 fps groups; audio +5%. A motion-triggered all-smart-codec deal compounds to roughly **−35%**. If the diff shows something materially different, stop and reconcile before proceeding.

## Guardrails

- **Read the audit first.** §7 is the decision list, §8 supplies most of the target numbers, §C4 explains the unit slip, §Q7 establishes that nothing recomputes downstream.
- **Do not push to main until Andy has reviewed the golden diff.** Pushing main deploys to production immediately. This change moves every new quote.
- **Migrations are stop-and-flag**: hand-applied via the Supabase dashboard SQL editor, never `supabase db push` (several migrations here were applied by hand and never recorded in remote history). Write an apply note in [`docs/apply-notes/`](./apply-notes/) following the existing pattern.
- **No dev server, no browser tools** — they crash the machine. Verify with `tsc`, `npm test`, `npm run build`, and read-only `.mts` probe scripts (`node --env-file=.env.local --import tsx script.mts`; `.ts` fails on top-level await).
- **Check ADR numbers before allocating** — parallel sessions share this checkout and collide. ADRs supersede **0049** (complexity curve), **0050** (codec re-anchor), **0068** (floors and VSR), **0082** (Quick Calc pinned profile) where they conflict; amend rather than replace.
- **Never `git add -A`** here; stage explicitly and check `docs/JOURNAL.md` for another session's edits before staging it.
- Each phase gets a JOURNAL entry and its own ADRs, written as part of the work.
