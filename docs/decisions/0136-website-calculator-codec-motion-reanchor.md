# 0136 — Website calculator: re-anchor codec bitrate, motion becomes duty cycle, retire H.264-Smart

- **Status**: Accepted
- **Date**: 2026-08-18

## Context

The public marketing-site calculator (`reference/Arxys-React-calculator.clean.html`,
the source later copy-pasted into the WordPress custom-HTML block) is a separate
codebase from the Partner Portal's `src/lib/calculator/compute.ts`, which is
anchored against Milestone XProtect Solution Designer and validated across two
live audits. The website's codec constants were never anchored to anything and
ran roughly 2x hot; its motion slider scaled bitrate itself (with a 30% floor)
rather than modeling motion as a recording duty cycle, which is what the
portal's validated D2/D7 decisions settled on.

The website also carried a `smart` codec key doing double duty as the retired
H.264-Smart entry, while the portal already uses `h265smart = h265 × 0.80` for
the same lineage — a naming collision worth resolving even though the website
has no persistence layer to suffer banked-quote drift.

## Options considered

- **Full rewrite to match compute.ts exactly** (six-level complexity scale,
  sublinear FPS scaling, per-group retention) — rejected: out of scope, would
  touch UI surfaces this brief was explicitly told not to touch, and the
  website's simplified 3-level complexity model is an intentional product
  difference, not a bug.
- **Re-anchor only the three specific drift points (codec constants, motion
  model, h265smart naming)** — chosen: brings the website's numbers closer to
  validated ground truth without restructuring UI or the three protected
  integration surfaces (`sendEmail` FormData shape, `fm`/`fS`/`fB` formatters,
  `videoxServers`/`findRecommendedServer`).

## Decision

In `eFK`'s `b` object: `h265: .037`, `h264: .0634` (both from compute.ts,
anchored to Milestone's 1,966 Kbit/s reference point at 4MP/15fps/H.265/Low).
The `smart` key is retired; a new `h265smart: .037*.8` key replaces it,
expressed as a ratio (not the hardcoded `.0296`) so the 20%-saving relationship
stays legible in source, matching how compute.ts documents it. The `COD` array
entry is relabeled `"H.265 + Smart Compression"` / `v:"h265smart"`.

Motion is no longer a bitrate multiplier. `fk` (frame size) is now a pure
function of resolution/codec/complexity. Bandwidth is always quoted at the
full event-peak rate. Storage alone gets `dutyCycle = mot/100` as a straight
linear multiplier — no `0.3 +` floor. The motion tooltip copy was updated to
describe a duty cycle ("Fraction of time the scene is actively recording"),
not "scene motion level," since that's what the slider drives now.

FPS exponent scaling, the 3-level complexity scale, and per-group retention
are deliberately left as-is — website-specific product decisions, not bugs,
and out of scope for this brief.

## Consequences

**Positive:** Website bitrate/storage figures are no longer running ~2x hot
against Milestone-anchored ground truth; motion behaves consistently with the
portal's validated model (duty cycle, not a bitrate weight with an inflating
floor); the H.264-Smart/h265smart naming collision between website and portal
is resolved.

**Negative:** The `sendEmail` payload's `codec` field now sends the label
`"H.265 + Smart Compression"` instead of `"H.264-Smart"` for that option. The
PHP handler (`admin-ajax.php`, action `arxys_calc_send`) only ever displays
this string via `esc_html()` in the emailed PDF/report — verified no
string-matching on the old label exists there. However, the same handler also
forwards this label as the value of a **Pipedrive dropdown custom field**
(field key `30bdd73ed2f44f0293629099dfb19899c93fc2af`, "CODEC — first value")
with no local mapping. Pipedrive dropdown fields reject values that aren't
registered options, so this field will start failing (or dropping silently)
for that codec choice unless `"H.265 + Smart Compression"` is added as a valid
option on that field in Pipedrive. That's a Pipedrive-admin change, not a code
change, and is outside this brief's front-end-only scope — flagged for Andy
to action separately.

Website's 4MP/15fps/H.265/Low bitrate now computes to ~999 Kbit/s vs.
Milestone's 1,966 Kbit/s anchor (−49% — expected, since the website's 3-level
complexity scale (0.5/1/1.5) doesn't match the portal's six-level scale used
to derive that anchor; not a regression to fix in this brief).

**When to revisit:** If the website calculator is ever migrated onto the
portal's `compute.ts` directly (removing complexity-scale divergence and FPS
linearity), or if the Pipedrive CODEC dropdown option is added/renamed and
this note needs to be marked resolved.
