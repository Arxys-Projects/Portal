# 0133 — The VSR rating basis is complexity tier 2, and the Quick Calc conflict is open

- **Status**: Accepted as a record of the basis. **Contains one open question for Andy** (see "Open"). Amends [#0068](./0068-storage-first-sizing-and-vsr-camera-check.md); does **not** supersede [#0082](./0082-quick-project-calculation.md), whose conflict it documents rather than resolves.
- **Date**: 2026-08-17

## Context

Audit §7.9 recorded that "no document traces these ratings" — the published Max VSR
stream counts had no stated recording profile. That is now answered: the profile is
in-repo, in `LEDGER_VSR_PARAMETERS` / `LEDGER_VSR_CAPTION`
([`src/lib/datasheet/copy.ts`](../../src/lib/datasheet/copy.ts)) — 4MP · 2560×1440 /
15 fps / H.265-20 "Good" · ~3.2 Mbit/s / on motion, VMD + metadata / 75% motion
activity / 30 days. What genuinely has no trace is the *measurement* behind the
platform-validation claim, which is a bench question, not a documentation one.

The published **3.2 Mbit/s** is the reliable part of that strip, because the tier
*labels* predate the ADR 0049/0050 retier and the retier moved what each label
means. Against the re-anchored table (ADR 0123):

| Tier | Complexity | Re-anchored rate | 3.2 Mbit/s sits |
|---|---|---|---|
| 1 | Low detail, low motion (1.0) | 1.97 Mbit/s | +62.6% above |
| **2** | **Low detail, high motion (1.5)** | **2.95 Mbit/s** | **+8.5% above** |
| 3 | Medium detail, low motion (2.25) | 4.42 Mbit/s | −27.6% below |

Tier 2 is the only tier within 10%, and the +8.5% is conservatism in the camera
floor's favour.

This phase is deliberately **not** a math change. `vsrLoad` is
`cameras × MP/4` and varies with resolution only (ADR 0068), and whether stream
capacity scales with bitrate at all is a bench question — the bottleneck could be
decode-bound, write-bound, or bitrate-bound, and those three imply different
corrections. Inventing a derate coefficient would be exactly the kind of unsourced
factor this whole rework exists to remove.

## Options considered

- **Leave the basis unrecorded** — the ratings stay undefensible to an integrator
  who asks what they were measured at.
- **Record tier 2 as the basis** — states what the evidence supports, changes no math.
- **Record tier 2 *and* derate higher tiers now** — needs a coefficient nobody has
  measured.
- For the profile copy: leave the price book's own wording, or point it at the
  canonical values.

## Decision

**Record complexity tier 2 (Low detail, high motion, multiplier 1.5) as the basis
the published VSR ratings were established at.** No change to `vsrLoad`, the
complexity table, or `VSR_FLOOR`.

**Consolidate the profile copy to one source.** The price book stated its own
version of the profile in two separate places, and both had drifted — from the
canonical values and from each other. Both said *"h.264.20 & h.265.20 CODEC (~3–5 Mb
video file)"*, which names a codec pair and a bitrate range that appear nowhere in
`LEDGER_VSR_PARAMETERS` (canonically "H.265-20 (Good) · ~3.2 Mbit/s"), and neither
stated the resolution at all — the one parameter the ratings are most sensitive to.
Both now render from `LEDGER_VSR_PARAMETERS`: the KPI tooltip as label/value lines,
the fine print via a derived `ledgerVsrProfileSentence()`. Stream ratings are only
defensible if every surface quoting them quotes the same profile.

## Open — needs Andy's decision, deliberately not resolved here

**ADR 0082 pins Quick Calc to this same profile except complexity 2.25 (tier 3).**
So the default sizing profile bills **4.42 Mbit/s** per stream while the published
stream ratings were established at **3.2** — Quick Calc presents streams ~38% heavier
than the ratings were measured at, while producing an identical VSR load, with
`VSR_FLOOR` ×1.1 the only cushion between.

Two ways out, and this ADR picks neither:

1. **Move Quick Calc's pinned complexity to 1.5.** Aligns the tool with the rating
   basis. Costs: Quick Calc storage drops ~33% (1.5/2.25), and 2.25 was chosen as
   the *realistic typical scene* — so this trades sizing realism for rating
   consistency, and Quick Calc is the tool with the least scene information to
   justify the optimistic end.
2. **Derate the ratings for higher tiers.** Keeps 2.25 as the sizing default and
   fixes the camera-capacity side instead. Costs: it needs a measured derate curve,
   which does not exist yet — see the bench note below.

**Recommendation: neither until the bench note is answered**, because option 2's
feasibility is entirely a function of what the measurement shows, and option 1 is
only clearly right if stream capacity turns out *not* to be bitrate-bound.

### Bench note — what needs measuring

On one representative appliance, hold the profile fixed and vary only the complexity
tier (1.0 / 1.5 / 2.25 / 3.375), recording to the array as configured:

- Streams sustained before frame loss at each tier.
- Which resource saturates first at each tier: decoder utilization, array write
  throughput, or ingest bitrate.

If the sustained stream count is flat across tiers, capacity is decode-bound and the
ratings need no derate — take option 1 or nothing. If it falls roughly as 1/bitrate,
capacity is bitrate-bound and option 2 is both available and correct, with the
measured curve as the derate. A mixed result means the bound moves within the range,
and the rating needs to state the tier it holds at.

## Consequences

**Positive:** the ratings have a stated basis for the first time, and it is a
sourced one. The profile has a single home, so a parameter change propagates instead
of leaving three copies to disagree. The Quick Calc conflict is written down with
both options costed, rather than living in an audit finding nobody has to act on.

**Negative:** the conflict is documented but still live — Quick Calc keeps billing
streams 38% heavier than the ratings basis until it is resolved, and this ADR makes
that explicit without fixing it. The +8.5% between 3.2 and tier 2's 2.95 is
unexplained conservatism rather than a derived figure. And the profile-copy
consolidation changes customer-visible price-book text, so the new wording states a
single codec and a single bitrate where the old text hedged across two of each.

**When to revisit:** as soon as the bench measurement exists. Also if the datasheet
profile itself changes — `LEDGER_VSR_CAPTION` already warns that a recording
parameter change invalidates every published stream count, and this ADR's tier-2
finding is derived from the 3.2 Mbit/s figure in that strip.
