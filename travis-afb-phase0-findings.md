# Travis AFB Dorm Camera Project — Phase 0 Discovery Findings

**Solicitation**: FA442726Q1131, 60 CONS, via VastGlobe Logistics (federal procurement broker).
**Scope**: Read-only investigation only. No migrations, inserts, seed changes, or calculator
edits were made. This document answers the seven questions in the brief and recommends
which of the five deferred phases (P1–P5) are actually needed.

**Reading note**: The brief's cited ADRs (0049, 0050, 0068, 0069) are the right starting
point but are **partially superseded** by later work not listed in the brief: ADR 0123
(bitrate re-anchor + sublinear fps), 0125 (motion duty cycle), 0129 (fps curve verified),
0132/0140 (retention per camera group), and 0133 (VSR rating basis). `CALC_VERSION` is
currently 3, not the version those four original ADRs describe. Everything below is checked
against the current code, not against 0049/0050 alone.

---

## Q1 — Is the fps-to-bitrate relationship linear or curved?

**Curved, confirmed sublinear, exactly as ADR 0123 states.**

`src/lib/calculator/compute.ts:137-143`:

```ts
export const FPS_EXPONENT = 0.9;
export function effectiveFps(fps: number): number {
  const f = Math.max(0, fps);
  if (f === 0) return 0;
  return ANCHOR_FPS * Math.pow(f / ANCHOR_FPS, FPS_EXPONENT);
}
```

`effective_fps = 15 × (fps/15)^0.90`. This is the *only* fps path in the codebase — grepped
exhaustively, zero other call sites. It feeds both storage (`computeRawStorageGb`,
`compute.ts:291-311`) and bandwidth (`computeBandwidthMbps`, `compute.ts:271-277`) via the
same `frameKb` term, computed once per group with no motion input in it at all.

Codec constant is derived, not hardcoded: `H265_BPP = (1966 × 1000) / (2560×1440×15) =
0.03555411` bits/pixel/frame (`compute.ts:80-117`), anchored live against Milestone XProtect.

**Computed bitrates** (H.265, complexity tier 2 "Medium detail, low motion" ×2.25 — the
calculator's actual default, `calculator-form.tsx:112`, and Quick Calc's pinned value):

| fps | 5MP (2592×1944) | 4K (3840×2160) |
|---|---|---|
| 5 | 2.2495 Mbps | 3.7029 Mbps |
| 7.5 | 3.2402 Mbps | 5.3336 Mbps |
| 10 | 4.1977 Mbps | 6.9098 Mbps |
| 15 | 6.0464 Mbps | 9.9529 Mbps |

**Important product constraint not in the brief: fps is integer-only.** Submit schema
`actions.ts:43`: `fps: z.number().int().min(1).max(60)`. **7.5 fps cannot actually be entered
in the product.** A 25%-motion blended-fps value has to round to 7 or 8, which swings the
error from the continuous-math figure below.

### The blended-fps substitution — magnitude of error

Comparing true dual-rate storage (`(1−m)·S(5fps) + m·S(15fps)`, computed through the real
code path) against the proposed single-blended-fps substitution (`S(5 + m×10)`):

| Motion % | Storage error (both resolutions — structurally identical) | Bandwidth error |
|---|---|---|
| 25% (7.5 fps, not enterable → 7 or 8) | −4.8% (round to 7) or +7.4% (round to 8) | **−49.6% or −43.2%** |
| 25% (continuous math, not product-reachable) | +1.3% | −46.4% |
| 50% (10 fps, enterable) | **+1.2%** | **−30.6%** |

The storage error is small and *resolution-independent by construction* — resolution, codec,
and complexity all cancel out of the ratio, so the error depends only on the curvature of
`effectiveFps` between 5 and 15 fps. **The bandwidth error is the real problem**: 31–50%
under-statement. This isn't a rounding artifact — it's structural. See the next paragraph.

### Why the substitution is a category error, not just a curve-fitting error

Set the curve aside — even if `effectiveFps` were perfectly linear, blending fps by motion%
would still be modeling the wrong thing, because **motion% never touches fps, bitrate, or
bandwidth in this codebase.** `dutyCycle()` (`compute.ts:247-256`) returns a pure scalar
time-fraction that multiplies storage only:

```ts
if (input.recordingMode === "constant") return 1;
return Math.max(0, Math.min(100, input.motionPercent)) / 100;
```

`computeBandwidthMbps` takes no duty argument at all (`compute.ts:271-277`) — it is
structurally incapable of being reduced by motion. This is deliberate: ADR 0125's entire
point is that bandwidth must reflect the event peak, because the network has to carry it
the instant an event starts, regardless of how rarely that happens.

A "50% motion → 10fps continuous" substitution collapses two independent axes (rate, and
time-fraction-recording) into one. It happens to land close on storage because storage is a
time-integral and 5–15fps is a gentle enough range for linear interpolation to nearly work.
It fails badly on bandwidth because bandwidth was never a function of motion% to begin with
— discarding the 15fps peak into a blended 10fps figure erases the number ADR 0125 exists to
protect.

**One more standing, independent finding that compounds with this RFQ specifically**: ADR
0129 records an *already-accepted* bias — the engine under-sizes 5fps content by ~20–32%
relative to a keyframe-floor model, because it has no GOP/I-frame structure. The RFQ's 5fps
baseline sits squarely in that accepted-exposure zone. This is not a defect to fix here — ADR
0129 explicitly decided not to correct it — but it means the honest baseline-stream number is
already conservative-low by design, on top of anything the dual-rate question does.

---

## Q2 — Can the calculator express a dual-rate profile at all?

**No — confirmed XOR, and the gap is a named, pre-anticipated one.**

`GroupInput` (`compute.ts:338-354`) has exactly one `fps` field and a two-member
`recordingMode: "constant" | "motion"` union, used identically in five places across the
codebase (`compute.ts`, `calculator-form.tsx`, `rehydrate.ts`, `pdf/types.ts`,
`project-quote/snapshot.ts`). There is no second fps field anywhere. A test at
`rehydrate.test.ts:111` proves this was deliberate, not an oversight — it asserts that
`recordingMode: "speedup"` collapses to `"constant"` on load, i.e. a Milestone-style
two-rate mode was named and explicitly excluded.

ADR 0125 itself flags exactly this gap as a future item, unprompted by this RFQ:

> "When to revisit: if Milestone's Speedup mode (a low baseline FPS auto-raised during
> events) is worth modeling, that is a genuine second rate and would need its own control
> rather than a floor bolted back onto this one."

**Current semantics of "motion percent"** (verbatim UI tooltip, `calculator-form.tsx:1126`):
"Expected share of the operating hours that something is actually happening. Storage scales
with it exactly — 50% stores half, 20% stores a fifth. Bandwidth does not change, because the
network still carries the full rate during an event. Only applies to Motion-triggered
recording." Confirms: it is a time fraction, never a bitrate weight. Under "Continuous," it's
disabled and pinned to 100 — meaningless in that mode.

### Scope of a real fix (P1), if pursued

No DDL required — `groups_payload` is a bare `jsonb` column, and the 2026-08-17 precedent
migration for adding `retentionDays` was comments-only. Roughly:

- **Engine (1 file, small)**: `compute.ts` — widen `recordingMode` to add `"dual"`, add
  `baselineFps?: number`, add a blend function that operates on **effective** fps (`(1−m)·
  effectiveFps(baseline) + m·effectiveFps(event)`), not on nominal fps.
- **Design recommendation from the research**: keep the existing `fps` field as the
  **event/peak** rate and add `baselineFps` as the new field, not the reverse. This means
  `computeBandwidthMbps` needs zero changes (it already reads `input.fps` at duty 1.0, which
  is correctly the peak) and every existing banked row is untouched by construction.
- **Form + write path (2 files)**: `calculator-form.tsx` (Group type, `newGroup()`, a third
  Recording option, a conditional Baseline FPS input), `actions.ts` (schema, pin logic,
  `groups_payload` write).
- **Rehydrate (1 file)**: `rehydrate.ts` — widen `coerceRecordingMode`, new default, and the
  `rehydrate.test.ts:111` assertion needs to flip (it currently proves the feature's absence).
- **Display (6 files)**: `pdf/types.ts`, `pdf/render.ts`, `SubmissionPdf.tsx`,
  `project-quote/snapshot.ts`, `ProjectQuotePdf.tsx`, `submission-detail.tsx` — all need a
  third schedule-label branch.
- **Pipedrive (2 files)**: `pipedrive/deal.ts`, `pipedrive/relink.ts` — low risk, both target
  fields are free text, not dropdowns (contrast ADR 0136's dropdown problem).
- **Tests (~9 files)**: `compute.test.ts`, `golden.test.ts` (leave the 112k-row matrix alone,
  add a small separate dual-rate fixture), `rehydrate.test.ts`, plus PDF/Pipedrive/
  project-quote test files.
- **Not touched**: `project-quote/assemble.ts`, `config.ts`, `customer-proposal.ts`, and the
  submission-notification email — verified zero references to fps/motion/recordingMode.
- Quick Calc is unaffected and should stay a fixed 2-mode profile per ADR 0082 — it's the
  wrong tool for a dual-rate deal regardless.

**Total: ~14 source files + ~9 test files, no migration.** One design question genuinely
needs Andy's call before implementation: whether adding a purely-additive third mode (existing
two modes bit-identical) requires a `CALC_VERSION` bump. Leaning no, but it's a judgment call
worth its own line in the eventual ADR.

### The stopgap workaround, if P1 isn't built before this quote is due

Two motion-triggered groups covering the *same* physical cameras — Group A at 5fps /
`motionPercent = (1−m)×100`, Group B at 15fps / `motionPercent = m×100` — sums storage
**exactly** (duty is linear in the storage product, so this is not an approximation). Two
real costs: (a) **bandwidth would double-count** — each group prints its own event peak, so
the total needs manual correction to just Group B's peak; (b) the UI clamps motion% to
20–100 (`calculator-form.tsx:1146`), so this only works for 20% ≤ m ≤ 80%, which covers this
RFQ's 25%/50% tiers fine.

---

## Q3 — Do generic camera rows work? **Non-issue — no schema work needed.**

Confirmed definitively: neither `computeGroup` nor `vsrLoad` nor the recommendation engine
ever touch `camera_specs`. `GroupInput` (`compute.ts:338-354`) is purely numeric — no id,
vendor, or model field. The camera-model picker only exists to *pre-fill* a resolution index
into a hardcoded `RESOLUTIONS` table (`tables.ts:23-55`); the engine reads that table, not
the seed.

**The manual-entry path (no camera model selected) is not a gap to fill — it is the
pre-existing default path.** `calculator-form.tsx:82-84`: "null vendor/model = no model
loaded, in which case `cameras` is the direct editable input and the group behaves exactly as
before the feature." Every `newGroup()` starts this way. Multiple in-app tooltips instruct
users to "enter specs manually" when no model matches.

Both RFQ resolutions are **exact, zero-error entries** already in the resolution table:

| RFQ spec | `RESOLUTIONS` entry | index |
|---|---|---|
| Generic 5MP interior, 2592×1944 | `{ label: "5MP (2592×1944)", width: 2592, height: 1944 }` | 16 |
| Generic 4K exterior, 3840×2160 | `{ label: "4K/8MP (3840×2160)", width: 3840, height: 2160 }` | 19 |

**Recommendation: build the two camera groups with `cameraVendor`/`cameraModel` left null,
descriptive free-text group names ("Generic 5MP interior," "Generic 4K exterior"), and
`resolutionIdx` 16 / 19.** Zero rounding error, zero schema change.

**Adding generic seed rows (P2) would actively violate two standing conventions**: ADR 0062
requires every seed row be sourced from a real vendor datasheet, currently-shipping, with a
`source_url`/`as_of_date` ("fabricated specs are worse than no row" — ADR 0135 restates this
as live practice). And mechanically, `vendor` is a DB CHECK constraint restricted to `('Axis',
'Hanwha', 'Avigilon')` (`20260615000002_phase10_camera_specs.sql:15`), and
`scripts/validate-camera-specs.ts:19` hardcodes the same list — a "Generic" vendor row is
rejected by both the DB and the pre-load validator as written. **P2 should be dropped from
scope entirely.**

---

## Q4 — Can a partner record exist without an authenticated user? **Yes, via an existing mechanism — no schema/RLS work needed.**

`partners.id` is a primary key that is *itself* the foreign key to `auth.users(id)` (`on
delete cascade`), unconditionally, since the initial schema migration and untouched by any of
the 44 migrations since. **A standalone `partners` row with no linked auth user cannot exist.**

But the system already has a designed-for mechanism for a company with no portal user: the
**on-behalf-of free-text path** (ADR 0045/0054), distinct from the FK-based on-behalf picker.
An `is_internal` rep (Andy, or one of the other internal-flagged partners) runs the calculator
and types the company name into `on_behalf_of_company_name` (`calculator/actions.ts:222-229`,
max 120 chars, no FK, no auth requirement). ADR 0054, verbatim: "a company with no portal user
yet... no FK, no visibility, because there is no portal user to grant it to." This is exactly
VastGlobe's situation.

**This path was specifically designed to avoid the CRM-pollution problem the brief raises.**
Submission creation always auto-pushes to Pipedrive (`calculator/actions.ts:690-755`, no
opt-out), creating a search-first, idempotent **Organization** — but on the free-text path,
deliberately **no Person** is created (`pipedrive/deal.ts:274-303`, comment: "a free-typed
on-behalf target has no email to match/create a person on — creating a placeholder would
pollute Pipedrive, so we attach the org only"). The rep is credited via a pinned note instead.

Downstream, free-text targets are first-class citizens: grouped correctly in the Partner
Pipeline (ADR 0099), the admin grouped view, and the XLSX export.

**Two other options exist in the code but are worse fits, laid out for completeness:**
- **Real invited partner** (`invitePartner`, the only production partners-INSERT path):
  fires an email invite immediately, uncancellable, and there is no delete action anywhere in
  the portal (ADR 0023) — a wrong invite can only be suspended, not removed via the UI.
- **Script-created silent partner** (pattern exists in `bootstrap-admin.ts`/`test-rls.ts`,
  no email sent): possible but not wired for a non-admin role as-is, and critically, binding
  it via the FK-based on-behalf path *would* create a Pipedrive Person via
  `admin.auth.admin.getUserById` — reintroducing the exact CRM pollution the free-text path
  exists to avoid.

**Recommendation: use the free-text on-behalf-of path. No engineering work required — this is
a data-entry decision (which internal rep files it, what company name to type), not a schema
or RLS change.**

---

## Q5 — Is retention per-project? **No, it's per camera-group — but that solves a different problem than the one this RFQ has, so two submissions are still required.**

ADR 0132/0140 moved retention onto each camera group specifically so *one recording target*
covering physically different areas (perimeter at 15 days, PCI at 90) can be sized correctly
in one recommendation, with totals **summed** across groups. That's the opposite of what this
RFQ needs: the *same* 270 cameras, counted twice, for two *independent, non-summing* targets
(90-day primary vs. 30-day failover). Modeling both as groups in one submission would produce
540 double-counted cameras and one wrong combined recommendation — confirmed by tracing the
code: one submission always folds every group into one scalar total
(`calculator/actions.ts:323-331`) feeding exactly one `recommend()` call
(`recommend/algorithm.ts:62-90`) and one banked recommendation.

**No "scenario" or clone mechanism exists** (zero source hits for "scenario"). **Failover
support in the product is a checkbox with zero sizing impact** —
`addOnFailoverRecorder: z.boolean()` (`calculator/actions.ts:103`) feeds nothing but a
Pipedrive note ("Failover recorder: Yes"); there is no Milestone Failover Recording Server
sizing logic, no 30-day cap enforcement anywhere in code.

The `?revise=` duplicate path (the only lineage mechanism that exists) is actively wrong for
this purpose: it sets `parent_submission_id` and the pipeline view then marks the **parent
submission "Superseded."** Using it to spin off the failover submission from the primary would
falsely retire the primary in the pipeline view.

**Confirmed: this needs two independent submissions (not a revise/duplicate pair)** — matching
the brief's own P4 assumption. Two things worth flagging for P4 planning: the 30-day failover
cap is enforced by nobody but the person filling out the form, and `submissions.retention_days`
will bank 90 on the primary and 30 on the failover submission, so Pipedrive will show two
separate deals with different retention figures — worth deciding deliberately how that should
read in the CRM before P4 executes.

---

## Q6 — Price Book currency (24TB drive pricing)

**There is no 24TB drive price as a line item anywhere in this system — this needs
reframing.** The cost model is `units × wholeApplianceMsrp` (`recommend/algorithm.ts:89-90`)
with no BOM/drive rollup. `capacity-utils.ts` explicitly documents that specs are "built from
the REAL SKU rows, never synthesized from an assumed 16/20/24 TB drive ladder." Drive capacity
only appears as a *display* derivation (`storage_raw_tb / hdd_count`) for datasheet copy like
"36 × 24TB enterprise HDD" — never as a priced quantity.

What exists is the **24TB tier of whole-appliance SKUs**. From the most recent static
snapshot (2026-07-17 backup), the last actual **repricing** of the seven standard 24TB-tier
appliance SKUs was **2026-07-02** (`VX5-V100-48` through `VX5-V800-864`). Two new 24TB-tier
variants debuted 2026-08-18 (not a reprice — new SKUs). Whole-table census confirms nothing
else is later-dated.

**Flag as requested: the last repricing (2026-07-02) predates July's end and is roughly 8
weeks old as of today (2026-08-26).** Given HDD price volatility, this is worth a live check
before quoting.

**Caveat on data currency**: prices actually live in a Google Sheet fetched at runtime
(`scripts/validate-prices-sheet.ts`), not fully knowable from the static repo. The last commit
with real price numbers is 2026-08-20; anything after that requires a live, read-only check —
`scripts/validate-prices-sheet.ts` or `scripts/push-prices.ts --dry-run` are the safe options
already built for this. I did not query live Supabase or the live Sheet.

---

## Q7 — Is the `effective_date` staleness bug still open? **No — fixed 2026-08-20, and the PDF paths were never affected in the first place.**

The 2026-08-20 fix (`src/lib/projects/price-effectivity.ts`, `lastRepricingDate`) is live and
correctly wired into `queue.ts` and every downstream consumer of the false-positive flag: the
Projects board attention filter, row copy/badges, the by-partner rollup, and the verification
script.

**Direct answer to the brief's Travis AFB question**: generating a System Estimate or Project
Quote PDF off this project would **not** throw the false warning — not because the fix
propagated there, but because **neither PDF generator ever had a staleness check of any kind**
(`project-quote/assemble.ts`, `snapshot.ts`, `pdf/render.ts`, `SubmissionPdf.tsx`,
`ProjectQuotePdf.tsx` — zero hits for any price-staleness logic; `ProjectQuotePdf.tsx`'s only
date-adjacent function is the unrelated quote-validity expiry). The buggy query existed in
exactly one place (`queue.ts`), and it's the one place that got fixed. Separately, the flag is
also gated on `deal_status === "open"`, so it never fires on won/lost deals regardless.

**P5 can be dropped from scope entirely** — there's nothing left to fix.

**Caveat**: static-code-verified only; I did not query live Supabase to confirm no price push
has landed since the 2026-08-20 commit, or the current live false-positive count. If that
matters before quoting, `scripts/verify-project-queue.mts` is the existing read-only check.

---

## Summary — what actually needs to happen next

| Phase | Brief's framing | Finding | Recommendation |
|---|---|---|---|
| P1 — dual-rate profile | Needed only if Q1+Q2 confirm the gap | **Confirmed real gap.** ~14 src + ~9 test files, no migration. | Build it, or use the two-group storage workaround (with manual bandwidth correction) as a stopgap. |
| P2 — generic camera rows | Needed only if Q3 confirms proxies unacceptable | **Non-issue.** Manual entry is the existing default path; both RFQ resolutions are exact table entries. | **Drop from scope.** |
| P3 — internal-only partner | Needed after Q4 options reviewed | **Solved by an existing feature** (on-behalf-of free text), purpose-built to avoid CRM pollution. | **Drop from scope** — this is a workflow choice, not engineering. |
| P4 — project entry | Create Projects 1–4, reconcile | Confirmed: **requires 2+ independent submissions** (not a revise/clone pair); failover cap is unenforced by the tool. | Proceed once P1 is resolved one way or the other — the reconciliation numbers depend on how the dual-rate profile gets modeled. |
| P5 — effective_date fix | Blocking if P4 produces a PDF | **Already fixed**, and was never on the PDF path to begin with. | **Drop from scope.** |

The one item genuinely worth a decision before any code is touched is **P1**: whether to
implement the real dual-rate control now, or accept the two-group storage workaround (exact
on storage, needs manual bandwidth correction, works within the 20–80% motion range) for this
quote and revisit later. Everything else the brief scoped as conditional work turned out not
to be needed.
