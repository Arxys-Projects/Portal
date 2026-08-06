# 0117 — `/projects` "Projects I created" filter defaults off and matches by partner id

- **Status**: Accepted
- **Date**: 2026-08-06
- **Related**: [0114](./0114-projects-page-ui-decisions.md) (introduced the `mine` chip),
  [0115](./0115-projects-list-button-unification-and-pricing-flag.md)

## Context

The user reported that `/projects` — the internal sales dashboard — was missing whole partners'
pipelines: all six Pathway Tech deals and Iteris's one deal were absent from both the "Recent" and
"By partner" views, despite being visible (and open) in the admin Partner Pipeline view
(`/admin/submissions`).

Root cause traced to the "Projects I created" chip (`filters.mine`), which:

1. **Defaulted to ON** (`DEFAULT_FILTERS.mine = true`), with no visible indicator that anything was
   hidden. The Band A/C header tiles ("Open Pipeline", "Open Projects") are computed from the
   *unfiltered* row set, so the KPI numbers and the row list below them silently disagreed.
2. **Matched by comparing contact names**, not ids: `row.created_by_user_name !== viewerName`, where
   `created_by_user_name` is `rep.partner_id`'s contact name (whoever's account filed the
   representative submission) and `viewerName` was the logged-in user's own contact name, looked up
   from the `partners` table. For any real partner-submitted deal, the submitting partner's contact
   name (e.g. "Franklin Crofutt" for Pathway Tech, "Tuan Nguyen" for Iteris) can never equal the
   viewer's own name — so the default effectively hid all partner-submitted pipeline and showed only
   the viewer's own directly-filed submissions.

The `mine` concept itself is legitimate (an internal rep may want to see just the projects they
personally filed), but defaulting an internal sales dashboard to "only what I filed" — silently, with
no hidden-count affordance — was the actual defect.

## Options considered

- **Fix only the name-vs-id matching, leave the default ON.** Rejected on its own: it would not have
  changed the reported symptom. Andy's partner id will never equal Pathway Tech's or Iteris's partner
  id under either matching scheme — the mismatch is about *scope* (partner-filed vs. viewer-filed),
  not about string fragility.
- **Add a "N hidden, not created by you" indicator (like the existing archived-rows strip), keep
  default ON.** Would have surfaced the problem but not fixed it — the dashboard's headline lists
  would still open to a filtered subset by default.
- **Default `mine` to OFF, and separately fix the matching to use ids.** Chosen — see below.

## Decision

1. `DEFAULT_FILTERS.mine` is now `false`. `/projects` shows the whole team's open pipeline by default,
   consistent with the header KPI tiles it sits under. "Projects I created" is an opt-in narrowing,
   toggled on via the chip (URL survives as `?mine=1`; absent means off — the inverse of the old
   `mine=0`-means-off convention).
2. The match is now by id, not name: `ProjectQueueRow` gained `created_by_partner_id` (`rep.partner_id`
   verbatim), and the filter predicate compares it directly to `viewerId` (`gate.userId`), the same id
   already threaded through for RLS and audit purposes. `page.tsx` no longer queries the `partners`
   table for the viewer's own `contact_name` — that lookup existed solely to support the old
   name-based compare and is gone along with it.
3. `created_by_user_name` / `created_by_is_internal` are unchanged and remain on the row (display/
   future use, per existing `rows.test.ts` coverage of the on-behalf-of creator-resolution behavior);
   they are simply no longer what the filter matches on.

## Consequences

**Positive:** the sales dashboard shows real pipeline by default; the id-based match can't be defeated
by a contact-name collision, typo, or a partner and an internal user happening to share a display name.
One fewer Supabase round trip on every `/projects` page load.

**Negative:** anyone who had bookmarked or relied on the bare `/projects` URL as "just my own deals"
now sees everyone's by default and must click the chip (`?mine=1` to keep the old scoping via URL).

**When to revisit:** if `/projects` ever needs to show a hidden-count affordance for the `mine` chip
(mirroring the archived-rows "N also match" strip) — not needed today since the default no longer
hides anything from a fresh page load.
