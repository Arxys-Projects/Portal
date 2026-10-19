# 0164 — Suspension bans the Auth user, and every entry point requires an active partner

- **Status**: Accepted (supersedes [#0021](./0021-suspend-gate-in-app-layout.md))
- **Date**: 2026-10-19

## Context

ADR 0021 put the suspend check in `(app)/layout.tsx` only. The 2026-10-19 baseline audit
(rows B2-S-2, B2-A-2, B1-S-3) found that this does not end access. Suspending a partner only
set `partners.status`. Supabase kept signing the user in and refreshing their session, and a
layout runs on page renders only. Server actions and route handlers never pass through it.

The same audit (B2-S-1, B2-A-4) found the layout checked only for `suspended`, so any Auth user
with no `partners` row, or with any other status, got in. That matters if public sign-up is
ever on in Supabase. Separately, `public.is_internal()` ignored `status`, so a suspended
internal user kept cross-partner reads over REST.

Andy decided on 2026-10-19 that suspension should end access at once, through an Auth ban.

## Options considered

- **Keep the layout gate, add a status check to each action by hand.** Small diff, but repeats
  the copy-paste that already produced four different definitions of "staff", "admin" and
  "active" (B2-A-1).
- **Gate in the proxy.** Covers every request, but adds a database read to every request and
  still leaves the session alive.
- **RLS only.** Closes REST, but leaves actions that call Pipedrive or send mail with no check.
- **Ban the Auth user on suspend, plus one fail-closed viewer helper called by every entry
  point, plus `status = 'active'` in `is_internal()`.** Ends sign-in and refresh, covers the
  window before the access token expires, and gives the app one definition of each role.

## Decision

1. `suspendPartner` bans the Auth user through the service-role client
   (`ban_duration: "876000h"`) before it writes `status = 'suspended'`. If the ban fails, the
   action fails and nothing changes. `reactivatePartner` writes `status = 'active'`, then lifts
   the ban (`"none"`). It refuses a row that is not `suspended`. If the unban fails it
   re-asserts the ban and puts the status back to `suspended`, so the row stays consistent and
   still offers Reactivate. Both steps live in
   `src/lib/auth/partner-access.ts`. Partners suspended before this change are banned once by
   hand (apply note).
2. `src/lib/auth/viewer.ts` (`server-only`) is the one place that answers "who is this and may
   they act". `getViewer()` is wrapped in React `cache()` and returns `{ user, partner }` or
   null. The predicates match the SQL words: `isActive` is status `active`, `isStaff` is active
   and (admin or internal), and `isAdmin` is active and admin. A missing `partners` row fails
   every predicate. `requireActive`, `requireStaff` and `requireAdmin` return
   `{ ok: true, viewer }` or `{ ok: false, reason: "unauthenticated" | "forbidden" }`. The pure
   half lives in `viewer-core.ts` so it can be unit tested under plain `tsx --test`.
3. `(app)/layout.tsx` flips `invited` to `active` as before (a failed flip throws to the error
   page and keeps the session), then signs out and redirects anyone who is not active
   (`?error=suspended` or `?error=no_access`). The partner route handlers, server actions and
   price-book pages each call `requireActive()` themselves, because a layout renders in parallel
   with its page and does not re-run on client navigation.
4. Migration `20261019000002_is_internal_requires_active.sql` adds `status = 'active'` to
   `public.is_internal()`. The ADR 0151 guard calls `is_admin()`, so it is unchanged.

## Consequences

**Positive:**
- A user suspended after this change (or banned in the one-off backfill) cannot sign in or
  refresh. Until their current access token expires (up to the JWT expiry), every partner
  action and route handler refuses them.
- An Auth user with no `partners` row gets nothing from the app, whatever the sign-up setting.
- One definition of active, staff and admin on the app side, matching the SQL side.

**Negative:**
- A banned user who tries to sign in sees the generic "Invalid email or password." The
  suspended banner only shows if they still hold a live session. Mapping `user_banned` to a
  message could tell a stranger that an email belongs to a suspended account.
- If the invited flip fails, the layout throws and the invitee keeps their session, where before
  they got in as `invited`. The app has no `error.tsx` yet, so they see Next's generic error
  page and have to reload on their own. A transient partners-read error in `getViewer` lands on
  the same page. *Update 2026-10-19:* the root `src/app/error.tsx` now shows a plain
  "Something went wrong" page with a Reload button; `submitCalculation` catches the read error
  and returns a message instead, so a failed Save keeps the unsaved form.
- The page renders in parallel with the flip, so an invitee's very first page still sees
  `invited`: an internal user may see the partner-only view once, and a price-book page returns
  "not found" once. The normal invite path lands on `/dashboard`, which has no such gate.
- Partner pages other than the price book still rely on the layout. Within a live token, a
  suspended user's open tab can soft-navigate to them. They read through RLS the same user can
  already call directly (the dashboard and submissions pages also resolve names with the
  service role, limited to rows the user can already see), so this adds no exposure beyond the
  token window below.
- Only the partner entry points use `viewer.ts` so far. `require-admin-or-internal.ts`, the
  local `requireAdmin` copies in `admin/partners/actions.ts` and `admin/submissions/actions.ts`,
  the two spec-action wrappers, the datasheet guard and the inline checks remain. They already
  check status, so they are a consolidation follow-up and do not leave a hole.
  *Update 2026-10-19:* done in the B2-A-1 follow-up (JOURNAL); every viewer check now calls
  `viewer.ts` and each admin page gates itself.
- Partner-tier RLS (prices, specs, a user's own submissions) does not check status. A token
  issued before the ban keeps working over REST until it expires. Gating those SELECT and DML
  policies on an active partner row is deferred: it touches every partner-tier policy, needs
  the planned no-argument helpers (B1-A-6), and the ban already ends new sessions. For the
  same reason, with public sign-up on, any stranger's account could read prices over REST;
  sign-up off (RUNBOOK §8d) is the only control there today.

**When to revisit:** when the SQL `is_staff()` / `is_admin()` helpers land (move the remaining
role checks onto `viewer.ts` and gate partner-tier RLS on an active row in the same change); if
a password-reset or magic link turns out to give a banned user a fresh session (unverified on
2026-10-19; Andy checks on a test persona); or if Supabase changes how bans affect existing
sessions.
