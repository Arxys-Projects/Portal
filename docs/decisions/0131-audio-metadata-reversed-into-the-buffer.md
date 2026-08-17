# 0131 — The audio/metadata term is reversed; a storage-only cushion goes into the buffer default

- **Status**: Accepted. **Supersedes [#0128](./0128-audio-metadata-counted.md)** (which is now withdrawn, not merely amended). Amends the default and range in [#0126](./0126-one-buffer-max-disk-utilization.md).
- **Date**: 2026-08-17

## Context

ADR 0128 added a per-group "records audio / analytics metadata" toggle applying
**+5% to the stream rate** — bitrate, bandwidth and storage alike — defaulting ON.
Verification with Andy found it conflates two separate errors, and neither is
fixable by tuning the 5%.

**It is the wrong shape.** Audio and analytics metadata are **fixed kbit/s
add-ons**, not a percentage of video bitrate. G.711 audio is 64 kbit/s flat; AAC
runs ~16–128 kbit/s; analytics metadata runs 4–100 kbit/s. A flat percentage
therefore errs in **both directions at once**: on a small low-resolution stream
the real add-on is a much larger share than 5%, and on a large 4K/H.265 stream a
much smaller one. ADR 0128's own "When to revisit" note had already spotted this
("it is a roughly fixed kbit/s in reality, so its *percentage* is larger on
low-bitrate streams") and shipped anyway.

**It should never have touched bandwidth.** Audio/metadata bandwidth impact is not
worth modeling at all — it is noise against the event peak, and it does not earn a
UI control. ADR 0128 reasoned its way to the stream rate from a consistency
argument (keeping the storage↔bandwidth identity of audit §C4 intact), which is
sound in the abstract but answered the wrong question: the right move was not to
apply it consistently, but not to apply it.

**Even confined to storage, 5% overstates the common case.** At realistic rates
the combined magnitude is roughly **0–4%, skewed low** — many deals record no
audio at all.

No vendor calculator — Genetec, Milestone, Axis — exposes this as a line item.
All three treat it as unmodeled variance, which is the same judgment reached here.

## Options considered

- **Keep the toggle, retune 5% → ~2%** — still the wrong shape, still on bandwidth,
  still a checkbox on an already dense group card.
- **Keep it on storage only, as a modeled kbit/s term** — correctly shaped, but it
  needs a per-stream audio/metadata bitrate input to be worth having, which is more
  knob than any partner will fill in accurately.
- **Remove it and add a second small storage toggle** — reintroduces a second
  buffer concept, which ADR 0126 explicitly forbids.
- **Remove it and fold a fixed cushion into the existing buffer** — no new control,
  no second multiplier.
- For the cushion mechanism: **move the utilization default** vs **a fixed
  multiplier ahead of the utilization division**.

## Decision

**Remove the toggle and the +5% entirely, from both bandwidth and storage.** No
replacement toggle, no modeled term. The field stops being written to
`groups_payload`; already-banked rows keep whatever they recorded and are not
stripped or backfilled, per the `calc_version` pattern D5/D7 established.

**Fold a +2% storage-only cushion into the buffer by moving its default: 90% → 88%.**
ADR 0126 decided this in advance — *"if field data shows deals routinely running
above the chosen cap, the default moves rather than a second constant
reappearing… Any proposal to add a second storage multiplier anywhere in the stack
should be read as a regression of this ADR."* A fixed multiplier would have been
that regression. ÷0.88 against ÷0.90 is **×1.0227, a +2.27% cushion** — the "~2.2%,
close enough" Andy asked for. It reaches storage only, because that is the only
thing the utilization cap divides.

**`UTILIZATION_MAX_PCT` moves to 88 with the default, not just the default.**
ADR 0126 made the default sit at the least-margin end of the range deliberately, so
that "every adjustment a user can make adds margin, never removes it" and "a
partner cannot make a quote more aggressive than the default." Leaving the ceiling
at 90 while moving the default to 88 would have broken exactly that property, and
in the most likely way: a partner comparing against a Milestone proposal nudges the
slider to match its 90% and silently deletes the cushion this ADR just added.

Two consequences of that were checked rather than assumed. The slider **step moves
5 → 4**, because a range input clamps to the largest step-aligned value at or below
max, so a 60–88 range at step 5 would have stopped at 85 and made the default
unreachable. And `clampUtilizationPct` now returns 88 for a banked 90, so
**revising a version-2 quote reopens it at 88** — which moves storage *up*, never
down. A clamp change is only acceptable in that direction, and this one is.

**Quick Calc stays at 80%** (`QUICK_CALC_UTILIZATION_PCT`, unchanged). It needs no
share of the cushion: at ÷0.80 = ×1.25 against the calculator's ×1.136 it already
carries more than double the margin, for the reason ADR 0126 gave — a stream count
and a retention period is all that tool gets. So Quick Calc takes the full −4.76%
of the removed uplift with nothing added back, and remains the more conservative of
the two tools.

**The `rawStorageGb` / `recordedStorageGb` split is collapsed to one field.** The
+5% term was the only difference between them; with it gone they were the same
number under two names, which is a trap rather than a distinction.
`recordedStorageGb` survives as the single "footage" figure every surface already
reads. If a properly measured kbit/s term ever arrives, the split comes back then.

## Consequences

**Positive:** the estimate no longer contains a figure that is wrong in both
directions by construction. Bandwidth loses a 5% pad it should never have carried,
so the quoted Mbit/s is now the modeled event peak exactly. The margin is again
**one number in one place** — the whole point of ADR 0126 — and the slider's
one-directional property is intact. Golden-verified movement: stream rate and
footage ×0.952381 (= 1/1.05) exactly, storage-to-buy ×0.974026
(= 1/1.05 × 90/88) exactly, across all 112,320 matrix rows; every recommended unit
count that moved moved **down** (2,560 rows, none up).

**Negative:** the cushion is now invisible where the toggle was visible — nobody
reading the form can see that 2 of the 12 spare points are an estimate-uncertainty
allowance rather than a disk-utilization policy, so the copy has to say it and does.
The buffer default no longer equals Milestone's and Genetec's stated 90%, which
costs the direct number-to-number comparison ADR 0126 valued; the slider copy now
states the 90% both tools use and that we hold 2 points tighter. Partners can no
longer reach 90% at all. And 0–4% of real variance is still absorbed rather than
modeled — this ADR asserts that is the honest place for it, not that it is zero.
The canonical golden fixture drops a SKU tier on the −2.6% move
(VX5-V800-720 → VX5-V700-576, **−$16,632**), so deals near a boundary will reprice.

**When to revisit:** if per-stream measurement on real deployments ever gives a
defensible **kbit/s** figure for audio and for metadata separately, model it as
kbit/s in the stream rate — never as a percentage, and never again on a toggle
whose default decides the answer. If Milestone or Genetec move their own defaults,
the 88 should move with them, keeping the 2-point offset.
