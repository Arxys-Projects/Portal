# 0132 — Retention moves to the camera group

- **Status**: Accepted. The "does not retroactively move groups the user has
  already set" rule was amended by [0140](./0140-retention-sync-until-group-touched.md) —
  a group only detaches from the project default once the user edits that
  group's own Retention box, not merely by existing.
- **Date**: 2026-08-17

## Context

Retention was one flat `retentionDays` (1–730) per submission, applied to every
camera group. A project whose areas have different requirements could therefore
only be quoted at its **longest** requirement, over-sizing every other group to
match.

That is not an edge case, it is the normal shape of a regulated deal. Nevada gaming
runs a 7→15 day statutory floor; cannabis is 30–180 days depending on the state;
PCI/PII work lands on 90. A single property routinely carries three or four of
these at once — perimeter at the gaming floor, point-of-sale sightlines at 90,
back-of-house on general policy, a count room at the longest hold.

The workaround partners had was to quote the project twice and add the results by
hand, which loses the single recommendation the tool exists to produce.

## Options considered

- **Leave it, document the workaround** — free, keeps over-quoting every mixed
  project, and the over-quote is largest exactly where the regulation is strictest.
- **A per-group multiplier on the project retention** — smaller change, but partners
  would have to compute 15/90 = 0.1667 to express a regulated figure, which is a
  worse interface for the same data.
- **Retention per group, project value becomes the inherited default** — one more
  field per group; the project figure keeps a job rather than disappearing.
- For the scalar `submissions.retention_days` column: bank the **project default**,
  or the **longest** group retention.

## Decision

**`retentionDays` moves onto each camera group.** The sizing math reads each
group's own value; totals are the sum across groups at their own retention, not one
retention applied uniformly.

**It is a required field of `GroupInput`, not an optional one with a default.** It
used to be a separate positional argument to `computeGroup`, and a defaulted field
would let a caller size a group at the wrong retention with nothing failing. Making
it required means every call site had to be updated for the code to compile, and
the old `computeGroup(input, retentionDays, utilizationPct)` arity now fails too —
both halves of the change are compile-caught rather than trusted.

**The submission-level value stays, as the value a NEW group inherits.** It is
resolved once, server-side, before anything computes or banks, so the engine,
`input_state`, `groups_payload`, the PDFs and the Pipedrive deal all state the same
figure by construction instead of each re-deriving it through its own `??` chain.
Changing the project field does not retroactively move groups the user has already
set — that is the point of the feature.

**`submissions.retention_days` banks the LONGEST group retention** from
`calc_version` 3 on, not the project default. The column feeds single-value
consumers — the admin list, the Pipedrive "Retention Days" field, a relink rebuilt
from the row — and the maximum is the only single figure that is never an
*under*-statement of what the system must hold. On a uniform project (every row
written before this change, and most after) the two are identical, so the change is
monotone and safe. The per-group values live in `groups_payload`.

**Surfaces that can show a range do.** One `retentionSummary()` helper returns
`{min, max, uniform, label}` and renders `"30 days"` when the groups agree and
`"7–90 days"` when they do not. Every renderer derives it from the **per-group**
figures rather than printing the row scalar, so a mixed project never states one
number as though it applied to everything. The calculator form, submission detail,
the System Estimate PDF and the Project Quote / Customer Proposal each gained a
per-group Retention column alongside it.

**Old rows read as uniform, and that is exact rather than a guess.** A
`calc_version` 1/2 row banked no per-group retention because there was none; every
group on it was sized at the row's single `retention_days`. So filling each group
with that value reproduces the row faithfully — `uniform` comes out true and those
quotes render exactly the figure they always did. Nothing recomputes on read
(audit §Q7), verified against synthetic v1/v2/unstamped rows.

## Consequences

**Positive:** a mixed-retention project is quoted at what it actually needs instead
of at its longest requirement, which is the single largest over-quote the engine had
left. The per-group breakdown now explains its own storage column — a reader can see
why one group costs more than another of the same size. Because the buffer and the
binary charge are both scalar and applied per group, the group storage figures still
sum exactly to the project total; this was checked, not assumed.

**Negative:** one more field on every group card, on a card the same phase just
removed a control from. Retention is no longer a single project fact, so five
surfaces had to learn to say "7–90 days" — and any future surface that prints
`retention_days` as *the* retention will be subtly wrong on a mixed project. The
scalar column changes meaning at the version boundary, so it joins `storage_tb` as
a column not comparable across it without the stamp. The project-level field is now
a default rather than a setting, which is a slightly subtler thing to explain, and
the copy carries that weight.

**When to revisit:** if partners start wanting retention per *camera* rather than
per group, that is a different feature and a much larger one — the group is the unit
of every other sizing input, and splitting retention off it alone would break that
symmetry. If the scalar column's "longest" reading ever misleads a consumer, the fix
is to give that consumer the range, not to change what the column banks.
