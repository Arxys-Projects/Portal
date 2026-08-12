# Calculator Math Audit — Phase 1 findings

- **Date**: 2026-08-12
- **Scope**: every numeric constant, formula, and unit conversion in the path from camera specification to recommended appliance count. Modules: [`src/lib/calculator/compute.ts`](../../src/lib/calculator/compute.ts), [`src/lib/calculator/tables.ts`](../../src/lib/calculator/tables.ts), [`src/lib/recommend/algorithm.ts`](../../src/lib/recommend/algorithm.ts), [`src/lib/recommend/candidates.ts`](../../src/lib/recommend/candidates.ts), [`src/lib/capacity-utils.ts`](../../src/lib/capacity-utils.ts), the calculator server action, Quick Calc, and every downstream consumer of these numbers.
- **Status**: read-only audit. No coefficient, formula, or logic changes. The only code write is the golden-file regression harness ([`src/lib/calculator/golden.test.ts`](../../src/lib/calculator/golden.test.ts) + [`__golden__/`](../../src/lib/calculator/__golden__/)), committed before any analysis so every future change diffs visibly.
- **Method**: full code trace; live-pool capture (18 SKUs, 2026-08-12); quantitative probes against the real engine; six parallel web-research passes against primary vendor documents, measured third-party tests, and standards. Every external figure below carries a URL. Figures that could not be sourced are labeled NOT FOUND rather than filled in.
- **Fixture**: all dollar/TB impacts are stated on the **five-scene / 300-camera mixed project** (30-day retention), frozen in [`__golden__/fixture-mixed-project.json`](../../src/lib/calculator/__golden__/fixture-mixed-project.json). Baseline: **546.4 TB quoted storage → 1× VX5-V800-864 = $117,054**.

---

## 0. Headline summary

1. The engine is **internally coherent and deliberately conservative**, and its two central anchors (the H.265 coefficient and the complexity curve) genuinely trace to a live audit of Milestone's calculator (ADR 0049/0050). But that audit **conflated binary and decimal kilobits**: Milestone reports decimal kbit/s (verified from its own tool bundle), and the engine's storage/bandwidth math bills the matched figure in binary — so the effective anchor sits **+4.07% above Milestone** (+1.63% documented rounding, +2.44% undocumented unit slip). §C4.
2. The three margins genuinely stack: ×1.2 overhead × ×1.2 floor × RAID parity (×1.2 on RAID 60) ≈ **×1.73 before ceil rounding**; on the fixture, 455.4 TB of raw video buys 864 TB of drive nameplate (**×1.90**). No VMS vendor documents anything near a 20% database/filesystem overhead — documented reserves top out at 5–15%. §C5.
3. The costliest modeling gap is **C3**: there is no way to represent H.265 + smart compression, which is what nearly every modern camera ships. Choosing "smart" instead of "h265" *adds* exactly 20% storage; the evidence says smart-on-H.265 should *subtract* 20–67% depending on scene. On the fixture this one gap is worth −64 to −96 TB and one SKU tier (−$14,656).
4. Two corrections push quotes the other way: frame-rate scaling is really sub-linear (12 fps quotes are under-sized ~5–9%, §C1), and audio/metadata streams are unmodeled (+2–8%, §Q3). **The corrections partially cancel**: fixing everything documented would move the fixture roughly −1% to −12% depending on decisions in §7.
5. None of the stop-and-flag conditions triggered: no schema change is required for any finding, the Project Quote path does **not** compute capacity independently (§Q7), and no correction alters already-issued quotes (all documents render from banked values).

---

## 1. How the math flows (reference)

```
pixels × CODEC_BITRATE[codec] × complexity ÷ 8 ÷ 1024            = frameKb   (binary KB/frame)
frameKb × (0.2 + 0.8·motion)                                      = motion-weighted frameKb
frameKb × 1024 × 8 × fps × cams ÷ 1e6                             = bandwidthMbps (decimal Mbit/s)
frameKb × 1024 × fps × cams × days × 86400 × rec% ÷ 1e9           = rawStorageGb  (decimal GB)
rawStorageGb × 1.2 (STORAGE_OVERHEAD)                             = storageGb (quoted)
frameKb × 8 × fps ÷ 1024                                          = bitrateMbps (display — see C4)
units = max(1, ceil(TB·1.2 / usableTb), ceil(VSR·1.1 / maxCam))   (per SKU; cheapest wins)
usableTb = rawTb × (n − parity)/n                                  (RAID 5/6/60/1/JBOD)
```

---

## 2. Provenance table

Labels per the audit standard: **VERIFIED** = traced to a primary source and reproduced; **INHERITED** = carried from another tool/version, provenance documented, not independently validated; **UNSOURCED** = no traceable origin.

| # | Constant / formula | Value | Where | Label | Source / notes |
|---|---|---|---|---|---|
| 1 | `CODEC_BITRATE.h265` | 0.037 | compute.ts:16 | **VERIFIED**¹ | Live Milestone XProtect Solution Designer audit 2026-06-05 (ADR 0050); locked by gate test. ¹Caveats: +1.63% deliberate rounding; the match was made in binary Kbit while Milestone reports decimal (verified from the archived XSD bundle: `bitPerSec: 2702e3` ↔ `to_kbps: 2702`), so the effective anchor is +4.07% (§C4); the source tool is now login-walled and scheduled for decommission 2026-10-01 — **this audit could not re-drive it**, so the anchor is no longer externally reproducible (§C6). |
| 2 | `CODEC_BITRATE.h264` | 0.0634 | compute.ts:17 | **INHERITED** | = 0.037 × (0.12/0.07). The 0.12/0.07 ratio comes from the legacy calculator ([`reference/Arxys-React-calculator.clean.html`](../../reference/Arxys-React-calculator.clean.html) line 252), whose factors are themselves unsourced. The implied H.265-is-42%-smaller-than-H.264 ratio is consistent with industry claims ("30–50% more efficient") but never validated. |
| 3 | `CODEC_BITRATE.smart` | 0.0444 | compute.ts:18 | **INHERITED** | = 0.037 × (0.084/0.07), i.e. smart = 0.70 × H.264 — a "30% off H.264" Zipstream-era figure from the legacy tool, unsourced. Sits **+20% above H.265** (§C3). |
| 4 | Legacy codec factors | 0.07 / 0.12 / 0.084 | reference/…clean.html:252 | **UNSOURCED** | No citation anywhere. They live on only through the ratios in #2–3. |
| 5 | `estimateFrameKb` formula | px·bpp·cx/8/1024 | compute.ts:52 | **INHERITED** | Ported verbatim from legacy `eFK`. Dimensionally standard. |
| 6 | `applyMotionAdjustment` | 0.2 + 0.8·m | compute.ts:74 | **UNSOURCED** | Legacy was 0.3 + 0.7·m (also unsourced); lowered to 0.2 in ADR 0050 by judgment. No vendor uses this form (§C7). |
| 7 | `computeBandwidthMbps` | fk·1024·8·fps·n/1e6 | compute.ts:89 | **INHERITED** | Legacy `cBW`. Internally consistent (binary KB in, decimal Mbit out). Uses motion-weighted frameKb → reports **average**, not event-peak, bandwidth (§Q1). |
| 8 | `computeRawStorageGb` | fk·1024·fps·n·d·86400·r/1e9 | compute.ts:111 | **INHERITED** | Legacy `cST`. Same convention as #7 — consistent. Matches the DHS handbook's `bitrate × hours × days` shape. |
| 9 | `bitrateMbps` (display) | fk·8·fps/1024 | compute.ts:148 | — | **Unit-inconsistent with #7/#8** — binary Mibit labeled Mbit; 4.63% below the figure the engine actually bills (§C4). |
| 10 | `STORAGE_OVERHEAD` | 1.2 | tables.ts:77 | **INHERITED** | Legacy `OH=1.20`, unsourced. No VMS documents 20% DB/index/filesystem overhead; documented analogs: Milestone AWS calculator 5% archive margin, Nx/WAVE ~10% free-space reserve, Exacq ≤85% fill (§C5). |
| 11 | `COMPLEXITIES` multipliers 1–5 | 1.0/1.5/2.25/3.375/5.0 | tables.ts:57–61 | **VERIFIED**¹ | Milestone live audit (1966/2950/4424/6637/9832 Kbit/s at 4MP/15fps/H.265); gate-test locked. Same caveats as #1. The steps are 1.5000/1.4997/1.5002/**1.4814** — the last is Milestone's own, pinning floor-to-top at exactly 5.0× (§C6). |
| 12 | `COMPLEXITIES` multiplier 6 | 7.0 | tables.ts:62 | **UNSOURCED** | In-house edge-case extrapolation (ADR 0049), deliberately below the pure 1.5⁵ = 7.59. The "Avigilon ~6.25× cumulative" it was benchmarked against is itself unverifiable (§C6). Documented as intentional. |
| 13 | Complexity example scenes | labels | tables.ts | — | Avigilon-style UX convention (ADR 0049). Display only. |
| 14 | `RESOLUTIONS` dimensions | 26 entries | tables.ts:14–41 | **VERIFIED** | Standard raster definitions; spot-checked. |
| 15 | `vsrLoad` | cams × MP/4 | compute.ts:34 | — | In-house definitional unit (4MP ≈ 1 VSR, ADR 0068). Not a claim about the world; the claim lives in #16. |
| 16 | `product_specs.max_cameras` (VSR ratings) | 100/200/275/325 per family | DB | **UNSOURCED** | Data, not code — but the camera floor divides by it. No ADR or document traces how these VSR capacities were established. Open question §7. |
| 17 | `STORAGE_FLOOR` | 1.2 | algorithm.ts:44 | **UNSOURCED** | In-house hardware-headroom policy (ADR 0068). Covers the strongest documented vendor reserves (~10–15%) with room to spare (§Q4). |
| 18 | `VSR_FLOOR` | 1.1 | algorithm.ts:45 | **UNSOURCED** | In-house policy (ADR 0068). Explicitly the only camera margin — no double count found. |
| 19 | `GB_PER_TB` | 1000 | types.ts:57 | **VERIFIED** | Decimal vendor convention (ADR 0092); matches drive nameplates and Milestone's own decimal-GB chain. Used consistently everywhere (§C4). |
| 20 | RAID parity model | 5/6/60/1/JBOD | capacity-utils.ts:33–56 | **VERIFIED** | Standard RAID arithmetic; span rule confirmed against hardware config (Andy, 2026-07-24, ADR 0092); reproduced against all 18 shipping SKUs this audit (§Q5). |
| 21 | `RAID60_SPAN_DRIVES` | 12 | capacity-utils.ts:9 | **VERIFIED** | ADR 0092, hardware-confirmed. |
| 22 | `recordingPercent` encoding | round(h/24·100) | actions.ts:40, form | — | Definitional (Operation Hours). Round-trip error ≤2% except the 1 h/day corner (−4%) (§Q1). |
| 23 | Motion clamp 20–100 | UI + zod | actions.ts:43 | — | Policy; math floor (#6) is the backstop. |
| 24 | Retention bounds 1–730 | zod | actions.ts:70 | — | Policy. Flat per-submission day count (§Q2). |
| 25 | Quick Calc pinned profile | 4MP/15fps/H.265/cx2.25/m75/24h | quick-calc.ts | — | In-house standard (ADR 0082); composed entirely of audited constants above. |
| 26 | Recommend tie-break & MKT/CFQ filter | — | algorithm.ts | — | Policy (ADR 0032), not math. |
| 27 | `product_specs.max_bandwidth_mbps` | per SKU | DB | — | Display only (price book, datasheets); never used in sizing. Provenance not audited here. |

---

## 3. Claim verification (C1–C7)

### C1 — "Frame rate is modeled linearly and real codecs are not" → **CONFIRMED** (direction and approximate magnitude)

The engine multiplies by `fps` — exponent 1.0. The evidence says inter-frame codecs emit sub-linearly:

- **Academic, measured** (Ma et al., IEEE TCSVT 2011 / [arXiv:1206.2625](https://arxiv.org/pdf/1206.2625)): bitrate follows R ∝ (fps/fps_max)^b with b **0.38–0.84** by content and GOP structure; average **0.63** across canonical test set; **~0.77 for single-layer IPPP** (the structure surveillance encoders actually use).
- **Measured, surveillance-specific**: IPVM's frame-rate guide ([ipvm.com/reports/frame-rate-surveillance-guide](https://ipvm.com/reports/frame-rate-surveillance-guide)), measured at the 1-I-frame/second setting: 1→10→30 fps exponents **0.57–0.59**, with the exact mechanism the claim proposed (fixed I-frame budget, shrinking P-frames). A Bosch-integrator measurement ([MidChes](https://blog.midches.com/blog/frame-rate-resolution-how-do-they-impact-bandwidth-bitrate-and-storage-cost)) gives 0.52–0.58.
- **Vendor prescriptive tables cut the other way**: Dahua/IC Realtime, SCW, GW Security *recommended-setting* tables are roughly linear 15↔30 fps with a flat floor below ~10 fps ([IC Realtime](https://knowledge.ic.plus/ic-realtime-resolution/bit-rate/frame-rate-reference-guide), [GW](https://gwsecurityusa.com/2022/09/23/recommended-bit-rate-for-your-security-system/)). If the tool models what installers *configure* (CBR caps), linear is defensible; if it models what encoders *emit* (VBR/smart), it is not.

Claimed magnitudes check out at b≈0.6: linear overstates the 15→12 fps saving by **7.5 points** (claim said ~8) and 15→5 by **18.4 points** (claim said ~20, slightly high). Is a single exponent the right model? No — b is scene- and GOP-dependent (0.38–0.84 span), and smart codecs decouple bitrate from fps almost entirely in quiet scenes. But any fixed b in 0.5–0.8 is strictly less wrong than 1.0 for emitted bitrate.

**Anti-conservative note**: this is the one lever where the tool errs *low*. Nearly all deals run 12–15 fps (ADR 0068); a 12 fps quote is under-sized ~5–9% relative to the tool's own 15 fps anchor. Fixture impact of correcting: **+46.7 TB (+8.5%) at b=0.6, +26.0 TB (+4.8%) at b=0.77** — $0 at the fixture's position, but upward.

### C2 — "Resolution is modeled linearly and that is approximately correct" → **CONFIRMED**

Across four vendors with published multi-resolution tables, end-to-end pixel exponents: Hikvision **0.97–1.00** ([securitycamcenter transcription of NVR defaults](https://securitycamcenter.com/hikvision-recommended-video-settings/)), Reolink **1.00** ([reolink.com](https://reolink.com/blog/ip-camera-bandwidth-calculation/)), GW **~0.92**, neutral industry guide **~0.95** ([cctvhelpdesk](https://cctvhelpdesk.net/cctv-encode-settings/)), Dahua-family **0.63–0.70** ([IC Realtime](https://knowledge.ic.plus/ic-realtime-resolution/bit-rate/frame-rate-reference-guide)) — the one strongly sub-linear outlier, concentrated in the 1080p→4K step (their tables imply 2× where linear says 4×). **Measured spread: exponent ≈0.6–1.0, typical ≈0.9.** Pairwise exponents are noise (0.0–2.5) because vendors quantize to power-of-two bitrate steps. Where linear errs, it errs conservative (overstates high-resolution bitrate). No vendor documents a scaling law explicitly; Axis rejects fixed per-resolution bitrates entirely (scene-driven). Linear is the right first-order choice for a planning tool.

### C3 — "The codec table cannot represent H.265 with smart compression" → **CONFIRMED** (the largest modeling gap found)

Arithmetic: `smart`/`h265` = 0.0444/0.037 = **exactly 1.20** — selecting the smart option produces 20% *more* storage than plain H.265. ADR 0050 anchored `smart` by preserving the legacy ratio 0.084/0.12 = 0.70 × H.264 — i.e., the option models **smart-on-H.264** (as its label "H.264-Smart" says), a 30% saving on H.264 that is itself unsourced.

What smart compression actually delivers **on top of plain H.265**:

| Technology | Vendor claim vs plain H.265 | Measured / third-party |
|---|---|---|
| Hikvision H.265+ | **66.8% avg** (53.8% busy street – 76.2% static) — vendor's own six-scene test ([white paper](https://www.ubitech.fr/telechargements/hikvision/Hikvision%20codec%20H265(+).pdf)) | IPVM measured **20–30%** in at least one scenario ([ipvm.com](https://ipvm.com/reports/hikvision-h265-plus)) |
| Axis Zipstream (runs on H.265/AV1) | "50%+ average", codec-agnostic; components 0–50% each, scene-dependent ([white paper](https://whitepapers.axis.com/en-us/axis-zipstream-technology)) | Benchmark Magazine measured **47%** at Medium strength, good weather; comparable smart codecs collapsed to **7–18% in rain** ([benchmarkmagazine.com](https://benchmarkmagazine.com/cctv-test-dynamic-video-encoding/)) |
| Hanwha WiseStream III | 30–80% by mode vs same codec Off ([white paper](https://www.hanwhavision.com/wp-content/uploads/2021/10/White-Paper_WiseStream%E2%85%A2-technology.pdf)) | vendor's own bench: 71% (single pedestrian, empty scene, H.264) |
| Avigilon HDSM SmartCodec | applies to H.265 (H5 datasheet); % vs H.265: NOT FOUND | — |
| Pelco Smart Compression | "up to 70%", low-activity best case ([pelco.com](https://www.pelco.com/products/technologies/smart-compression-technology)) | — |

**No source anywhere supports smart compression producing more storage than plain H.265.** Defensible planning range on top of H.265: **~40–50% for typical mixed scenes, ~20% floor for constant-motion scenes** (vendor 70–80% figures are static-scene ceilings). Fixture impact of a smart-on-H.265 option (warehouse group only): **−64.3 TB at a 20% saving, −96.4 TB at 40% — either flips the SKU: −$14,656**. A deal quoted entirely on modern smart-codec cameras is over-quoted far more.

### C4 — "A unit inconsistency exists between two outputs of the same function" → **CONFIRMED, and it reaches the calibration**

- `bitrateMbps = frameKb·8·fps/1024` vs `bandwidthMbps = frameKb·1024·8·fps/1e6` per camera: ratio **exactly 1024²/10⁶ = 1.048576** (probe-verified). The claim's ~4.9% is right.
- Which is the odd one out: the **storage and bandwidth paths agree with each other** (probe: storage-implied Mbit/s ≡ bandwidth path to 15 digits). Both treat frameKb as binary KB and output decimal GB / decimal Mbit — internally consistent. The display `bitrateMbps` is binary Mibit mislabeled Mbit, 4.63% **below** what the engine bills. (The form then multiplies it by 1000 to print "Kbit/s" for small values — [calculator-form.tsx:1040](../../src/app/(app)/calculator/calculator-form.tsx) — compounding the mislabel.)
- **The deeper finding**: the ADR 0050 gate test asserts `frameKb·8·fps = 1966 "Kbit/s"` — a binary quantity — against Milestone's reported figure, and Milestone's tooling is verifiably **decimal** (archived XSD bundle stores `bitPerSec: 2702e3` for a displayed "2702 Kbit/Sec"; its published AWS calculator uses explicit dual decimal/binary chains with labeled converters — [doc.milestonesys.com](https://doc.milestonesys.com/latest/en-US/portal/htm/chapter-page-aws-calculator.htm)). So at the anchor point the engine bills 1998 Kibit/s = **2,046 decimal kbit/s vs Milestone's 1,966** — **+4.07%** total (+1.63% documented rounding + +2.44% unit slip nobody chose).
- **Sweep of every other conversion**: GB→TB is `/1000` consistently (compute.ts formatters, [SubmissionPdf.tsx:365](../../src/lib/pdf/SubmissionPdf.tsx), [ProjectQuotePdf.tsx:240,1067](../../src/lib/project-quote/ProjectQuotePdf.tsx), Pipedrive `GB_PER_TB`, snapshot.ts) — all decimal, matching ADR 0092. Days→seconds `86400`, correct. Pipedrive banks storage rounded to whole TB (deal.ts:165, documented). **No other binary/decimal mix found.** The engine's only unit defects are the display `bitrateMbps` and the calibration slip above.

### C5 — "Conservative margins compound and nobody has multiplied them together" → **CONFIRMED**

What each factor is for, and what the evidence says:

| Factor | Value | Stated purpose | Evidence |
|---|---|---|---|
| Bitrate anchor bias | ×1.0407 | +1.63% intentional (ADR 0050); +2.44% unit slip (unintentional) | §C4 |
| `STORAGE_OVERHEAD` | ×1.2 | "database, indexes, filesystem" | **Not documentable.** Milestone documents no % (storage white paper has none; its AWS calculator uses **5%** archive margin + 8% *network* overhead). Genetec's own calculator applies **zero** overhead. Documented free-space reserves: Nx/WAVE **~10%**, Avigilon 5 GB, Exacq ≤85% fill, ext4 default 5%. Real DB+index+filesystem cost ≈ ≤10%; the other ≥10 points of the 1.2 are absorbing scene-estimate risk — the same risk the complexity curve and anchor bias already carry. |
| `STORAGE_FLOOR` | ×1.2 | hardware headroom (ADR 0068) | In-house policy. This is where rebuild/free-space/growth margin implicitly lives (§Q4). ADR 0068's claim that it is distinct from STORAGE_OVERHEAD is true *by intent*, but both are partly margin against the same estimate uncertainty. |
| ceil + SKU granularity | ×1.0–1.5 (fixture ×1.098) | integer boxes | structural |
| RAID parity (raw vs usable) | ×1.2 (RAID 60), ×1.14 (V600), ×1.33 (V200) | physics | correct, not a margin |
| `VSR_FLOOR` | ×1.1 | camera dimension only | no storage effect; no double-count found (probe: camera floor never bound on the fixture) |

**End-to-end multiplier, fixture**: 455.4 TB raw video → ×1.2 → 546.4 quoted → ×1.2 → 655.7 minimum usable → ceil → **720 TB delivered usable (×1.581)** → **864 TB drive nameplate (×1.897)**. Before ceil, the deterministic stack is ×1.44 to usable, ×1.728 to RAID-60 nameplate — and the bitrate side adds ×1.0407 on top of a complexity curve that is itself the steep end of vendor practice (ADR 0049 chose it as the conservative bound). Verdict on the sub-question: **STORAGE_OVERHEAD is not measurable against documented VMS overhead at 20%; roughly half of it is scene-uncertainty margin wearing a database-overhead label.**

### C6 — "Complexity tier selection dominates every spec lever" → **CONFIRMED**; provenance framing **CORRECTED**

- Dominance confirmed by probe: one complexity step = **+50% / −33%** on storage; the whole 15→12 fps decision = −20%; codec h265↔h264 = ±42/71%; one step dwarfs fps.
- Provenance: the six multipliers are **not** an aggregate of Milestone and Avigilon — ADR 0049 explicitly adopted Milestone's curve alone and rejected blending. The first four rungs are exactly 1.5ⁿ; the fifth step is **1.4814**, which is Milestone's own audited figure (9832/6637), pinning floor-to-top at exactly **5.0×** — so 5.0 is *not* a round-down from 5.0625; it is the source value. Only 7.0 is in-house (documented, intentional, ADR 0049), set below the pure-ladder 7.59. The implied bits-per-pixel of the audited levels (0.0356…0.1778, with level 3 = exactly the classic 0.08 bpp) supports the June audit's authenticity.
- How far above the source the tool sits: **+1.63% documented, +4.07% effective** (unit slip, §C4) at the audited reference point, uniformly across levels.
- **What could not be verified**: the Milestone tool audited in June was **replaced on 2026-07-06** by Milestone Solution Designer (login-only) and is being decommissioned 2026-10-01; its bitrate API now returns 0 anonymously; no public documentation of the levels exists. The Avigilon "~2.86× span / ×1.25 top step" figures are per-camera-family regression coefficients behind an authenticated API — structurally confirmed (6 scene types = 3 detail × 2 motion, log-linear model, decimal kbps — read from the live SDT JS bundle), numerically unverifiable. **The anchor is real but is about to become permanently un-reauditable.** Open question §7.

### C7 — "The motion adjustment is unvalidated" → **CONFIRMED**

`0.2 + 0.8·m` models a weighted-average bitrate between an idle floor and the event rate, hours unchanged. Findings:

- **No vendor models motion this way.** Axis Site Designer uses per-scene motion profiles with day/night split ([help.axis.com](https://help.axis.com/en-us/axis-site-designer)); Milestone's documented view of motion recording scales **recorded time with idle ≈ 0** ("VMD 20% of the time → load reduced by 80%", [storage white paper](https://doc.milestonesys.com/wp/pdf/en-US/XProtectStorageArchitectureAndRecommendations_2023-09.pdf)); the Seagate–Milestone reference architecture sizes by hours recorded ([seagate.com](https://www.seagate.com/files/www-content/solutions/partners/milestone/files/SB513.1-2101US-Seagate-Data-Storage-Infrastructure-Reference-Architecture.pdf)).
- **The 0.2 floor has no source.** For smart codecs it is conservative: measured static-scene reductions run 73–99.7% (Axis Zipstream white paper) — idle is commonly **<15%** of nominal, not 20%. For plain **CBR it is wrong in direction**: idle CBR = 100% of target by design (bit padding — [Axis bitrate-control white paper](https://www.axis.com/dam/public/a5/9b/95/bitrate-control-for-ip-video:-average-bitrate-abr,-variable-bitrate-vbr,-and-maximum-bitrate-mbr-en-US-342596.pdf)). A CBR camera on "Motion-only 50%" is under-sized by ×0.6 — the tool's second anti-conservative lever. (Constant mode pins motion to 100 server-side, which protects the common case.)
- The linear response between floor and event rate matches no measured curve — but no measured curve exists publicly either; scene profiles are how vendors dodge the question.
- Magnitude: at the default 50%, ×0.6 on everything — on the fixture, removing the discount entirely (the CBR reading) is **+140.2 TB / +$52,329**; dropping the floor to 0.1 (smart-codec reading) is −17.5 TB. It is simultaneously one of the largest factors in the tool and the least anchored.
- Curiosity for calibration: the DHS Digital Video Quality Handbook's storage examples assume a **20% event frequency** for event-triggered recording ([2013 handbook](https://its.ntia.gov/media/mk2db5jg/digital_video_quality_handbook-dhs-oic_06132013.pdf), Fig. 27/28) — numerically identical to the 0.2 floor but applied to *hours*, Milestone-style, not as a bitrate floor. If the 0.2 has an ancestor, it is likely this class of duty-cycle figure transplanted into the wrong dimension. That is inference, not provenance.

---

## 4. The seven additional questions

**Q1 — What does `recordingPercent` encode?** Operation Hours: `round((hours/24)·100)`, an integer percent of the day, entered as whole hours in the UI ([calculator-form.tsx:124–128](../../src/app/(app)/calculator/calculator-form.tsx)); the server multiplies storage linearly by it (compute.ts:111). Quantization error ≤2% (worst corner: 1 h/day → −4%). It is **cleanly separated from motion** in the math (hours × bitrate-weight — the two multiply, which is correct for "scheduled hours with in-hours motion weighting"). What the tool **conflates is naming, not arithmetic**: the mode named "Motion-only" does *not* model motion-triggered recording (which stores only event hours, idle ≈ 0, per Milestone) — it models continuous recording with VBR-style bitrate damping. Real event-triggered recording is only expressible by abusing Operation Hours. Also: bandwidth inherits the motion weighting, so the quoted Mbit/s is a time-average, not the event-peak a network must carry.

**Q2 — Retention beyond a flat day count?** No. One `retentionDays` (1–730) per submission, applied to every group (actions.ts:70; groups_payload banks it once). No per-group retention, no tiered (e.g. 30 days full + 60 days low-res), no event-vs-continuous split. Regulated verticals make this a real limitation: mandates range 7→15 days (Nevada gaming, [NGC Reg 5.160](https://www.gaming.nv.gov/siteassets/content/regs/regulation-5---surveillance-standards-as-of-04-26.pdf)) through 30–180 days for cannabis by state ([SIA compilation](https://www.pelicanzero.com/content/files/2024/11/SIA_CompGuide-VideoRetRegs-Cannabis.pdf)) and 90 days for PCI/PII environments (DHS handbook §6.11). Mixed-retention projects must today be quoted at the longest requirement across the board.

**Q3 — Audio, metadata, analytics streams?** Not accounted anywhere (grep-verified across the calculator path). Magnitude: audio 24–64 kbit/s per camera ([Axis audio technote](https://www.axis.com/dam/public/bf/aa/c6/audio-in-axis-network-video-products-v100-en-US-36502.pdf)) = 0.6–3.2% of a 2–4 Mbit/s stream; analytics metadata ~4–25 kbit/s (Bosch VCD spec) to 20–100 kbit/s (Axis-ecosystem partner doc) = 0.5–5%. **Combined ≈ 2–8% undercount** when those streams are recorded. On the fixture, a +5% adder = +27.3 TB (no SKU change at the fixture's position). Partially masked today by the conservatism stack.

**Q4 — RAID rebuild headroom, hot spares, VMS free-space?** No explicit term for any of them. Hot spares: none exist on any model (hardware fact, ADR 0092) — industry reference architectures do recommend them (Milestone white paper; Dell ships 2 hot spares in its validated Milestone config — [Principled Technologies](https://www.principledtechnologies.com/Dell/PowerEdge-R740xd2-Milestone-surveillance-0619-v2.pdf)), which is a product decision, not a calculator one. Rebuild: vendors handle it structurally (RAID 6 + throughput margin; measured 55-hour RAID 6 rebuilds and −41/−62% degraded performance in the Seagate/Milestone RA), never as a published capacity percent. VMS free-space reserves (5–10%, §C5) and any rebuild/growth margin are implicitly absorbed by `STORAGE_FLOOR` ×1.2 — adequately, since documented reserves top out ~10–15%. Nothing is missing in *capacity* terms; what is missing is any statement of what the 1.2 is spent on.

**Q5 — `usableCapacityTb` verification.** Reproduced against all 18 pool SKUs: V200 ×3/4 (RAID 5, 4 drives), V400 ×6/8, V500 ×10/12, V600 ×14/16 (RAID 6 at 8/12/16 drives), V700 ×20/24, V800 ×30/36 (RAID 60 = ×5/6) — all correct, matching ADR 0092 and the price book. **The 16-bay case is RAID 6, not RAID 60**, so the `round(n/12)` span rule is never exercised at 16 drives in the shipping line; if a 16-drive RAID 60 were ever configured, the code would charge 2 parity (one 16-wide "span") where real hardware (2×8) would charge 4 — the constant's name and ADR 0092's revisit clause already flag this. Fallback branch: RAID 5 and any unrecognized string charge 1 parity — behaves correctly (`"RAID10"`, `"jbod"`, `"NA"` → RAID-5 math; V100's `'NA'` rows give the right mirror figure only because n=2, documented in code). **Two footguns confirmed**: `hdd_count` null-or-0 (or n ≤ parity) returns **raw nameplate as usable** — a silent over-credit if a spec row is ever half-filled; and RAID 1 with odd n reports raw/2 (admin form refuses odd n, so latent).

**Q6 — Integer boundaries and sensitivity.** The winner changes eight times between 60% and 160% of the fixture's storage; consecutive quote steps are $9.8k–$35k. The fixture itself sits comfortably inside its band (−8% / +10% to the nearest flips). The sharpest cliff observed: at 109→110% of fixture storage the quote jumps **$117,054 → $151,990 (+$34,936 for a 1% input change)** as 1× V800-864 becomes 2× V700-480. Since one complexity step is ±50% and one motion-slider notch is ±7%, any deal sitting near a boundary can flip a five-figure amount on a judgment call the UI presents as minor. The recommend() alternatives list and the utilization bar are the existing mitigations; there is no "you are near a boundary" signal. Lever magnitudes (single-group probe): complexity step +50/−33%, motion ±33% (50↔75/25), codec ±20–71%, fps step −20% (15→12), resolution 4MP→8MP +125%.

**Q7 — Does anything else compute storage/bandwidth independently?** **No** — this was swept for explicitly. The Project Quote path ([snapshot.ts](../../src/lib/project-quote/snapshot.ts)) freezes banked values and imports the shared `usableCapacityTb`; the System Estimate PDF re-renders from the persisted `storage_tb`/`groups_payload.computed` — no recompute; Pipedrive sync reuses the totals (rounding storage to whole TB for display, documented); Quick Calc calls the same `computeGroup`/`recommend`; the datasheet system and admin spec preview import the same capacity-utils. The one non-computed source is the price book's hand-typed `skuExtraData` strings — **all 21 rack-SKU overrides currently match the computed values exactly** (probe-verified), but they are manual and will drift silently if a spec row changes; ADR 0092 already plans their retirement. **Stop-and-flag check: not triggered** — no independent math, no schema change needed for any finding, and no correction would alter numbers on already-issued quotes (all documents render from banked/frozen values; only new submissions would change).

---

## 5. The conservatism stack, end to end

On the fixture (455.4 TB of raw modeled video, 30-day retention):

| Stage | Factor | Cumulative TB |
|---|---|---|
| Raw modeled video (engine bitrates) | — | 455.4 |
| STORAGE_OVERHEAD | ×1.2 | 546.4 (quoted) |
| STORAGE_FLOOR | ×1.2 | 655.7 (minimum usable) |
| ceil + catalog granularity | ×1.098 | 720.0 (delivered usable) |
| RAID 60 parity | ×1.2 | **864.0 (drive nameplate)** |

**Single multiplier: ×1.581 raw-video → delivered-usable; ×1.897 raw-video → drive nameplate.** Behind the 455.4 itself sits the bitrate-side bias: ×1.0407 above the Milestone anchor (§C4) on a complexity curve deliberately chosen as the steep vendor bound (ADR 0049). Pulling against the stack: sub-linear fps reality (−5–9% under-sizing at 12 fps), the CBR motion mismatch (up to −40% on a mis-modeled group), and unmodeled audio/metadata (−2–8%). The stack is why those anti-conservative gaps have never surfaced as field failures.

---

## 6. Errors and gaps, ranked by quote impact

Dollar figures are on the fixture against the frozen 2026-08-12 MSRPs; "boundary deals" means any deal within one correction of a units/SKU flip (§Q6 shows steps of $9.8k–$35k). Direction is what the *correction* would do to new quotes.

| Rank | Finding | Quote direction if corrected | Fixture magnitude | Class |
|---|---|---|---|---|
| 1 | **C3 — no H.265+smart representable**; picking "smart" adds +20% vs H.265 | **Down** on every deal with modern smart-codec cameras | −64.3 TB (20% saving) to −96.4 TB (40%); **−$14,656** (SKU tier drop) — larger on all-smart deals | Modeling gap |
| 2 | **C7 — motion model unvalidated**; 0.2 floor unsourced; wrong-direction for CBR | **Up** for CBR/constant-bitrate deals modeled as Motion-only (to +67% on a group at motion 50); **down** slightly for true smart-codec deals (floor 0.2→~0.1: −3.2%) | +140.2 TB / **+$52,329** if the no-discount (CBR) reading applied fixture-wide; −17.5 TB for floor→0.1 | Unsourced model |
| 3 | **C5 — STORAGE_OVERHEAD 1.2 not documentable**; ~half is relabeled margin | **Down** if set to a documented 1.05–1.10 (−8.3% at 1.10, −12.5% at 1.05) | −45.5 TB / $0 at 1.10; −68.3 TB / **−$14,656** at 1.05 | Unsourced constant |
| 4 | **C1 — fps modeled linearly**; 12 fps quotes under-sized | **Up** for every sub-15 fps deal (~all deals run 12–15) | +26.0 to +46.7 TB (+4.8% to +8.5%); $0 at fixture position, flips boundary deals upward | Model shape |
| 5 | **C4 — calibration unit slip** (+2.44% unintended above Milestone) | **Down** −2.3% (unit fix only) or −3.9% (full re-anchor to 1966 decimal) | −12.8 / −21.4 TB; $0 on fixture; one SKU tier on ~boundary deals | Arithmetic error |
| 6 | **Q3 — audio/metadata unmodeled** | **Up** +2–8% where those streams record | +27.3 TB at +5%; $0 on fixture | Omission |
| 7 | **C4 — `bitrateMbps` display 4.6% low** (Mibit labeled Mbit) | No quote impact; per-camera figure partners see understates what the sizing bills | display only | Unit bug |
| 8 | **Q5 — null/undersized `hdd_count` returns raw as usable** | Prevents silent over-credit if spec data ever half-filled | $0 today (all rows populated) | Latent footgun |

**The honest net**: the documented *errors* (rows 3, 5) push quotes **down** at the exact moment drive prices have roughly doubled; the documented *gaps* (rows 1, 2 partially, 4, 6) push both ways. Applying the two clean-error corrections together (re-anchor + overhead 1.10) moves the fixture **−11.9% / −$14,656**; applying the upward gap-corrections (fps exponent 0.6 + 5% audio) claws back **+13.9%**. A full-correction calculator would quote the fixture within ~2% of today's figure — but individual deal types move a lot: all-smart-camera deals down sharply, CBR-motion deals up sharply, 12 fps deals up ~8%.

---

## 7. Open questions requiring an Andy decision

These are decisions, not findings. No coefficient was changed in this phase.

1. **Re-anchor or bless the +4.07%?** The unit slip (+2.44%) was never chosen. Options: (a) full re-anchor so storage bills 1,966 decimal kbit/s at the reference (−3.9% all quotes; gate-test expected values change); (b) keep the number, update ADR 0050/gate comments to state the true bias as intentional headroom. Either is defensible; today's docs claim +1.63% while the engine does +4.07%.
2. **Add an H.265+smart codec option** — and at what coefficient? Evidence supports 40–50% below plain H.265 typical, 20% floor for busy scenes. Also: rename "H.264-Smart" so nobody picks it for an H.265 camera, and decide whether the existing 0.0444 stays for legacy comparability.
3. **Motion model**: keep the bitrate-weighting formula but document it as a deliberate conservative hybrid; or split the knob into recording-mode (hours-based, Milestone-style, for event-triggered) vs smart-codec damping (bitrate-based)? At minimum: should Motion-only warn when the deal's cameras are CBR? And should quoted **bandwidth** use the event rate (motion=100) rather than the time-average, since networks must carry the peak?
4. **fps exponent**: adopt sub-linear (b≈0.6 measured emission, b≈0.77 IPPP) or keep linear (matches installer CBR-config practice and errs low only 5–9% in the 12–15 fps band the margins absorb)? If the frame-rate control is mostly cosmetic at 12–15 fps, linear + documentation may be the cheapest correct answer.
5. **STORAGE_OVERHEAD**: keep 1.2 but relabel honestly (part reserve, part estimate margin), or drop toward the documented 1.05–1.10 and consolidate margin into STORAGE_FLOOR? Related: state in one place what STORAGE_FLOOR's 1.2 is buying (VMS reserve ~10%, rebuild/growth, uncertainty).
6. **Milestone re-audit before 2026-10-01**: the anchor's source tool is being decommissioned. If parity with a partner-facing reference matters, the anchor should be re-audited against Milestone Solution Designer (login required) while comparison is still possible — after October the 1966-series numbers become historical and unfalsifiable.
7. **Retention presets / per-group retention** (Q2): worth exposing vertical presets (NV gaming 7→15, cannabis 30–180 by state, PCI 90) or per-group retention? Currently mixed-retention projects over-quote at the max.
8. **Audio/metadata adder** (Q3): a +3–5% toggle, or keep absorbing it in the margins silently?
9. **VSR ratings provenance** (`max_cameras` 100/200/275/325): no document traces these. Worth an ADR or a bench note — they gate the camera floor.
10. **Boundary visibility** (Q6): should the UI/PDF flag "within ±N% of the next configuration" so a $35k cliff isn't invisible behind a motion-slider notch?

---

## 8. Addendum (2026-08-12, same day): live re-audit of Milestone Solution Designer

Open question §7.6 was actioned immediately: the replacement tool (msd.milestonesys.com) was re-audited the same afternoon through Andy's authenticated session — Andy driving the UI with screenshots while the audit read the design's server-rendered state and client code from a second tab. Design used: fayetteville / Site Design 1. Results:

**The anchor survives the tool migration — all five values re-confirmed exactly.** At "4MP"/15 fps/H.265, the new tool produces Low **1966**, Medium-Low **2950**, Medium **4424**, Medium-High **6637**, High **9832** — identical to the June 2026 XSD audit values (provenance table #1/#11), with the 1.5× ladder ratios intact (2950/1966 = 1.5005). The tool's Complexity Wizard confirms exactly five levels with example-scene UX. The gate test in [`compute.test.ts`](../../src/lib/calculator/compute.test.ts) therefore remains anchored to a *live, verifiable* reference — §C6's "permanently un-reauditable" concern is resolved.

**Units re-confirmed decimal in live code.** The current client converts the UI's Kbit figure as `bitPerSec: value × 1000` (`toDataFlowFromKilobitsPerSecond`, camera-configurator-controller.js). Second independent confirmation of §C4's unit finding: the engine's binary-Kbit match against this decimal figure remains a +2.44% unintended bias.

**Milestone itself scales fps sub-linearly (C1, from the anchor vendor).** A four-point sweep at Medium/4MP/H.265 gives 10 fps → **3062**, 12 → **3620**, 15 → **4424**, 18 → **5188**: exponents vs the 15 fps anchor of 0.908 / 0.899 / 0.874 — a consistent **b ≈ 0.90** across the 10–18 fps band, reproduced independently on the Medium-Low tier (2041/2413/2950/3459 at 10/12/15/18 → 0.909/0.900/0.873) and holding on Low and High (1966→1609, 9832→8045 at 15→12). The Arxys engine applies linear 0.80 at 12 fps, under-sizing ~2.3% relative to its own reference tool — smaller than the 5–9% the measured-emission exponent 0.6 implies, but no longer hypothetical: the anchor tool is not linear. If Phase 2 adopts an fps exponent, **b = 0.9 is the value that preserves Milestone parity**; b ≈ 0.6–0.77 is what measured encoder emission supports (§C1) and quotes larger still.

**Resolution scaling in the anchor tool is linear (C2).** 8MP (6400×1200) at Medium/15 = 8709 vs 4MP at 4424 → pixel exponent **1.015**. Supports keeping the linear pixel model.

**The inherited H.264:H.265 ratio matches the live tool.** H.264/Low/12 fps = 2774 vs H.265/Low/12 fps = 1609 → ratio **1.724**, vs the engine's legacy-inherited 0.0634/0.037 = 1.714 (+0.6%). Provenance table #2 upgrades from "never validated" to "matches the live Milestone tool within 0.6% (2026-08-12)".

**Motion is duty-cycle, not bitrate damping (C7, first-party).** Event mode at motion 70% leaves the data rate unchanged at every fps tested (e.g. 4424 at Medium/15 in both Constant and Event mode); the tool's own help text: Motion-Based Recording "records only when motion or events occur — enter expected motion %", plus a separate **Speedup** mode (low baseline FPS, e.g. 1 FPS keyframe recording, auto-raised during events). Confirms §C7: the reference tool models motion as recorded-time fraction with an optional two-rate baseline — not a `0.2 + 0.8·m` bitrate blend.

**The capacity margin is an explicit, visible knob (C5).** MSD's server configuration exposes **Max. Disk Utilization**: default **70%** with a specific Husky IVO model selected and **90%** on auto-select, plus Max. System Utilization 80%. This buffer applies **on top of** net-usable capacity (RAID, formatting, and the decimal→binary conversion are charged separately in "available" — see the storage-formula paragraph below), so Milestone's total storage-side margin over drive nameplate is ×1.244 at the 90% default and **×1.60** at the 70% default. Arxys's stacked ×1.44 (1.2 overhead × 1.2 floor, over decimal RAID-net) sits **between Milestone's two default configurations** — inside the reference tool's normal operating range, more conservative than its auto-select default. What remains unsupported is only the "database/indexes/filesystem" label on the first 1.2, and the fact that the margin is invisible rather than a user-facing assumption.

**New caveat — the 4MP bucket moved.** MSD's "4MP" is now **2592×1520** (3.94 Mpx); the engine's table and the June audit anchor use 2560×1440 (3.69 Mpx). At bucket level the engine bills 2,046 decimal kbit/s where MSD says 1,966 (+4.1%, the known bias); per-pixel the gap is +11.2%. Any Phase-2 re-anchor should decide which "4MP" it means.

**Storage formula reversed from an exported MSD proposal — §7.6 fully closed.** A four-camera Event-mode design (Medium-Low/4MP/H.265 at 10/12/15/18 fps, 24 h, 30 days, motion 70%) printed "Total storage 2.46 TB · 68.97% of available 3.57 TB" on a Husky HE150D (1×4 TB). Reversing: Σ rates = 10,863 kbit/s → ÷8 ×86,400 ×30 ×**0.70** = 2.4637 decimal TB → "2.46 TB", and 2.4637/3.5722 = 68.970% — both displayed figures reproduce to five digits. Conclusions, each now numerically confirmed first-party: (a) Milestone adds **zero overhead to the storage figure** (like Genetec, §C5), and "available" is **net-usable capacity with no utilization buffer in it**: 3.5722 TB = 4 TB nameplate × 0.9095 (decimal→binary conversion charged as capacity loss) × 0.982 (formatting/reserve allowance, ~1.8%). The 90% Max Disk Utilization buffer applies **on top of** this net-usable figure as the design cap — the same data point proves it, since a buffer folded into "available" would print ~76%, not the observed 68.97% (and 68.97% < 90% is why the box validates). Corrected 2026-08-12 after review: an earlier revision of this paragraph wrongly attributed the haircut to the utilization default. A second exported proposal (400 cameras, 4× Husky HE1000R at 8×16 TB = 128 TB nameplate each) pinned the rule: "85.73 TB per server available" = 128 × 6/8 (two of eight drives to parity — RAID 6, or RAID 5 + hot spare; capacity alone can't distinguish) = 96 decimal TB → ÷1.024³ = 87.311 → × **0.9819** = 85.733 — the same proportional allowance as the single-drive box, so **available = RAID-net decimal × 0.8931** holds exactly on both configs, and the parity arithmetic matches the Arxys `usableCapacityTb(128, 8, "6") = 96` identically. The 400-camera proposal also reproduced the storage formula at scale (246.373 TB and 71.85% both exact; 71.85% < the 90% cap is why the design validates) and the full-event-rate bandwidth convention (271.58 Mbps/server = Σkbit ÷ 4 ÷ 1000); (b) motion is billed as an exact **duty cycle with no idle floor** — ×0.70 at motion 70%, where the Arxys engine bills 0.2+0.8m = ×0.76 (+8.6% at 70%, +80% at motion 20%) — the 0.2 floor is Arxys conservatism on top of the reference model, not part of it (§C7); (c) all units decimal end-to-end on the customer document ("10.86 Mbps" = 10,863 kbit ÷ 1000); (d) the proposal's per-server **bandwidth is the full event rate, not motion-weighted** — the opposite convention from the Arxys engine's averaged `bandwidthMbps` (Q1's peak-vs-average concern, confirmed as a real divergence from the reference tool).

## 9. Regression harness (what landed with this audit)

[`src/lib/calculator/golden.test.ts`](../../src/lib/calculator/golden.test.ts) + [`src/lib/calculator/__golden__/`](../../src/lib/calculator/__golden__/): a 112,320-row golden matrix (every resolution × fps 5/10/12/15/20/30 × 3 codecs × 6 complexities × motion 0/25/50/75/100 × retention 7/30/60/90 × recording 100/50, at 100 cameras), the five-scene fixture with full-pool recommendation, and the frozen 2026-08-12 SKU pool. Runs with `npm test`; any math change fails with a line-diff summary; deliberate changes regenerate via `UPDATE_GOLDEN=1 npm test` and the diff ships with the change. Phase 2, whatever is decided in §7, lands against this.

## Appendix — primary sources consulted

Codec/fps/resolution: [Ma et al. rate model](https://arxiv.org/pdf/1206.2625) · [IPVM frame-rate guide](https://ipvm.com/reports/frame-rate-surveillance-guide) · [IC Realtime/Dahua bitrate tables](https://knowledge.ic.plus/ic-realtime-resolution/bit-rate/frame-rate-reference-guide) · [GW Security tables](https://gwsecurityusa.com/2022/09/23/recommended-bit-rate-for-your-security-system/) · [Hikvision H.265+ white paper](https://www.ubitech.fr/telechargements/hikvision/Hikvision%20codec%20H265(+).pdf) · [Axis Zipstream](https://whitepapers.axis.com/en-us/axis-zipstream-technology) · [Axis bitrate control](https://www.axis.com/dam/public/a5/9b/95/bitrate-control-for-ip-video:-average-bitrate-abr,-variable-bitrate-vbr,-and-maximum-bitrate-mbr-en-US-342596.pdf) · [Hanwha WiseStream III](https://www.hanwhavision.com/wp-content/uploads/2021/10/White-Paper_WiseStream%E2%85%A2-technology.pdf) · [Pelco Smart Compression](https://www.pelco.com/products/technologies/smart-compression-technology) · [Benchmark dynamic-encoding test](https://benchmarkmagazine.com/cctv-test-dynamic-video-encoding/). VMS/storage: [Milestone storage white paper 2023-09](https://doc.milestonesys.com/wp/pdf/en-US/XProtectStorageArchitectureAndRecommendations_2023-09.pdf) · [Milestone AWS calculator](https://doc.milestonesys.com/latest/en-US/portal/htm/chapter-page-aws-calculator.htm) · [Seagate–Milestone reference architecture](https://www.seagate.com/files/www-content/solutions/partners/milestone/files/SB513.1-2101US-Seagate-Data-Storage-Infrastructure-Reference-Architecture.pdf) · [Genetec Stratocast NAS calculator](https://techdocs.genetec.com/r/en-US/StratocastTM-Integrator-Guide/Storage-calculator-for-NAS-volumes-in-StratocastTM) · [exacqVision manual](https://exacq.com/auto/specsheet/uploads/exacqVision%20Users%20Manual.pdf) · [Dell/Milestone validation](https://www.principledtechnologies.com/Dell/PowerEdge-R740xd2-Milestone-surveillance-0619-v2.pdf). Design tools: [Axis Site Designer help](https://help.axis.com/en-us/axis-site-designer) · Motorola/Avigilon SDT live bundle (sdt.motorolasolutions.com) · archived Milestone XSD bundle (web.archive.org, 2025 captures). Standards: [Axis on IEC 62676-4:2025](https://whitepapers.axis.com/download/wp_pixel_density_based_on_iec_62676_4_2025_t10228570_2604.pdf) · [DHS Digital Video Quality Handbook 2013](https://its.ntia.gov/media/mk2db5jg/digital_video_quality_handbook-dhs-oic_06132013.pdf) · [NV Gaming Reg 5.160](https://www.gaming.nv.gov/siteassets/content/regs/regulation-5---surveillance-standards-as-of-04-26.pdf) · [SIA cannabis retention guide](https://www.pelicanzero.com/content/files/2024/11/SIA_CompGuide-VideoRetRegs-Cannabis.pdf). Audio/metadata: [Axis audio technote](https://www.axis.com/dam/public/bf/aa/c6/audio-in-axis-network-video-products-v100-en-US-36502.pdf) · [Bosch VCD spec](https://media.boschsecurity.com/fs/media/pb/media/partners_1/integration_tools_1/developer/boschvcd640-live.pdf). Where a page was only reachable via search-index excerpts (Genetec techdocs, some vendor KBs, IPVM paywalled detail), the finding above says so.
