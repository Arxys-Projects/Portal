# 0140 — Retention stays synced to a group until that group is touched

- **Status**: Accepted. Amends [0132](./0132-retention-moves-to-the-camera-group.md).
- **Date**: 2026-08-19

## Context

[ADR 0132](./0132-retention-moves-to-the-camera-group.md) moved retention onto
each camera group so a mixed-retention project could be sized correctly. Its
stated rule was: "changing the project field does not retroactively move
groups the user has already set."

The implementation read "groups the user has already set" as "groups that
exist" — `newGroup()` bakes in the current project-level retention once, at
creation time, and nothing ever looks at it again. That includes the very
first camera group, which the calculator auto-creates on mount before the
user has done anything at all.

The consequence: opening a fresh calculator, changing the upper Retention
field, and never touching camera group 1's own Retention box leaves that
group silently pinned at whatever the default was on page load — 30 days —
while every other group correctly follows. This nearly cost a real quote: a
90-day project was mis-sized because the first group stayed at 30, understating
that group's storage by roughly 600 TB. The bug is easy to miss because
nothing indicates group 1 has "locked" — there is no click, no edit, no user
action that caused it.

## Options considered

- **Leave it** — matches 0132's literal implementation, but "the user has
  already set" was never true for an auto-created, never-touched group. The
  near-miss makes the cost of leaving it concrete rather than theoretical.
- **Reverse 0132 entirely, retention goes back to one project-wide field** —
  throws away the actual feature (mixed-requirement projects, Nevada gaming
  vs. PCI till points), not just its rough edge.
- **Sync the project field into every group, always** — simplest, but breaks
  the case 0132 exists for: two groups with deliberately different retention
  would both get overwritten the next time anyone nudges the top field.
- **Track whether the user has edited a group's own Retention box; sync only
  the untouched ones** — keeps 0132's per-group divergence for groups the
  user actually configured, while fixing the case where a group was never
  configured at all.

## Decision

Each `Group` gains a client-only `retentionTouched` flag, false by default.

While `retentionTouched` is false, editing the upper Retention field also
updates that group's `retentionDays` — this now covers the auto-created first
group and any group added via "+ Add Camera Group" that the user hasn't
individually edited yet. The moment a user edits a group's own Retention box
directly, that group's `retentionTouched` flips to true and it detaches for
good, exactly as 0132 intended for groups the user has genuinely customized.

Groups rehydrated from a saved submission (revising an existing quote) start
`retentionTouched: true` unconditionally. A saved submission's per-group
values may already differ deliberately (that is the entire point of 0132),
and there's no reliable signal for which ones were customized versus left at
the default — freezing all of them on load is the safe reading, matching
0132's original (correct) behavior for the revision path.

`retentionTouched` is never persisted — it lives only in the calculator
form's local state and is not part of the save payload or `GroupInput`.

## Consequences

**Positive:** the failure mode that nearly shipped a 600 TB-short quote is
closed. A brand-new calculator now behaves the way a user actually reads the
UI: the upper Retention field is "the retention," until you say otherwise for
a specific group. 0132's actual feature — divergent retention across
groups the user has configured — is unaffected.

**Negative:** one more piece of per-group state to reason about, and the
distinction between "synced" and "detached" groups is invisible in the UI
(no visual indicator that a group has locked). If that proves to still be
missable in practice, the next fix is a visual cue, not another sync-rule
change.

**When to revisit:** if partners want to see, at a glance, which groups are
still following the project default versus locked to their own value — that
is a UI affordance on top of this flag, not a change to the flag's logic.
