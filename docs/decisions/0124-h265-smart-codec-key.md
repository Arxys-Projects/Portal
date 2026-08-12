# 0124 — H.265+Smart is a NEW codec key; H.264-Smart is retired, not redefined

- **Status**: Accepted. Amends [#0050](./0050-codec-bitrate-reanchor.md), which set `smart`'s coefficient.
- **Date**: 2026-08-12

## Context

`CODEC_BITRATE.smart` was `0.0444` = `0.70 × H.264`, inherited from the legacy
calculator's unsourced `0.084/0.12` ratio. Against the H.265 coefficient it sat at
**exactly 1.20** — so choosing the "smart" option *added* 20% storage versus plain
H.265, and the picker labeled it "H.264-Smart".

The audit called this the largest modeling gap found (§C3). Nearly every modern
camera ships smart compression on H.265, and there was no way to express it. What
smart compression actually delivers on top of plain H.265: Hikvision claims 66.8%
average, Axis Zipstream "50%+", Hanwha WiseStream 30–80%. Independent measurement
is much lower and scene-dependent — IPVM measured 20–30% on H.265+, and Benchmark
measured 47% in good weather collapsing to **7–18% in rain**.

**No source anywhere supports smart compression producing more storage than plain
H.265.**

The obvious fix — point `smart` at a lower coefficient — is a trap. The codec
value is persisted per group in `groups_payload` on every submission ever taken.

## Options considered

- **Redefine `smart` in place** at a new coefficient — one-line change, and every
  already-banked `smart` row silently starts reading as H.265+Smart when it was
  quoted as H.264-Smart. Rejected.
- **Add `h265smart`, delete `smart`** — old rows fail to resolve their codec and
  fall through to an index, which now points at a different codec entirely.
- **Add `h265smart`, retire `smart`** — keep it resolvable and labeled, hide it
  from the picker.
- Coefficient: **40–50% below H.265** (the typical mixed-scene figure) — matches
  the evidence's centre, risks under-spec on busy scenes and in bad weather.
- Coefficient: **20% below H.265** — the measured floor for constant-motion scenes.

## Decision

**`h265smart` is a new key at `h265 × 0.80`. `smart` is retired, not reused.**

20% is the deliberately conservative **end** of the evidence, not its midpoint —
the measured floor for constant-motion scenes. Rationale: never risk under-spec.

`smart` keeps its definition (`0.70 × H.264`) and is re-anchored along with the
rest of the table, since the +4.07% slip (ADR 0123) was an error on every key, not
just the live ones. It is:

- resolvable in `compute.ts`, so a revived pre-Phase-A quote still computes on the
  coefficient it was actually quoted at;
- labeled **"H.264-Smart (retired)"** everywhere a stored submission renders, via
  `codecLabel()`;
- hidden from the picker — except when the group's own codec *is* the retired one,
  in which case it renders with an inline warning pointing at H.265+Smart. A fresh
  group never sees it; a revived old quote shows what it was, rather than silently
  switching codec on the partner.

**`CODECS` is one array and one index space** — `[h265, h265smart, h264, smart]` —
with a `retired` flag rather than two arrays whose indices diverge. Because
`h265smart` was inserted at index 1, `INPUT_STATE_VERSION` goes to 2 and
`migrateCodecIdx` remaps the v1 index space (`[0,1,2] → [0,2,3]`) on the raw-index
fallback path. Rehydration already preferred the banked codec *value* over the
index; the remap covers the rows where no value was banked.

The golden matrix sweeps an explicit `["h265", "h264", "h265smart"]` — deliberately
not the picker's order — so slots 0 and 1 stay directly comparable with the
pre-Phase-A file and only slot 2 changes identity. The fixture moved from codec
indices to codec **values** for the same reason.

## Consequences

**Positive:** the commonest real-world camera configuration is expressible for the
first time; picking a smart codec now reduces storage instead of increasing it; no
banked row changes meaning; the 20% floor means the number is defensible in rain.

**Negative:** −20% on groups that select it versus plain H.265, and −36% for a
group moving off the retired key (0.0444 → 0.0284) — the single largest movement
in the Phase A diff. Carrying a retired key forever is a small ongoing tax on the
codec list. 20% almost certainly *under*-credits smart compression in typical
mixed scenes, so those deals stay conservatively sized.

**When to revisit:** if bench measurement on real Arxys deployments gives a
scene-specific figure, the 20% floor could become a range or a per-group setting.
If `groups_payload` is ever migrated wholesale, the retired key could be rewritten
and dropped — but not before.
