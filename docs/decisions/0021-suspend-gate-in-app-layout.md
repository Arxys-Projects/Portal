# 0021 — Suspend gate in `(app)/layout.tsx`, not in the proxy or RLS

- **Status**: Accepted
- **Date**: 2026-05-20

## Context

Step 9 introduces a `suspended` partner status. The CHECK constraint on `partners.status` has supported `('active','invited','suspended')` since the initial schema (`supabase/migrations/20260515193702_initial_schema.sql:34-35`), but until now nothing in the app actually gated on it. We need a place to enforce "a suspended partner cannot reach any protected page," and it has to be loop-safe given the existing proxy.

The proxy (`src/lib/supabase/proxy.ts`) already does two things on every request: it refreshes the Supabase session, and it redirects authed users away from `/login` and `/` to `/dashboard`. That second rule means any naive "redirect suspended user to `/login`" turns into an immediate ping-pong: the proxy sees an authed user on `/login` and bounces them back to `/dashboard`.

We also have `is_admin()` defined as `role='admin' AND status='active'` (lines 131-145 of the initial schema), so RLS already strips admin privileges from a suspended admin — but RLS alone doesn't *log them out*, it just makes their reads/writes fail with permission errors. We need a UX path, not just a security path.

## Options considered

- **Gate in the proxy.** Reject suspended users at the edge with a hard redirect. Cleanest blast radius (every protected route covered automatically) but requires a DB read in the proxy on every request, and the proxy has no service-role client — RLS would make a `partners.status` read either work fine (it's selectable by self) or fail silently if anything changes. Adds latency to every request, including static ones.
- **Revoke at RLS only.** Add a policy that denies SELECT/INSERT/UPDATE when `status='suspended'`. Catches everything by definition, but leaves the user staring at empty pages and "permission denied" errors with no explanation. UX is poor and the user can't even sign themselves out cleanly.
- **Gate in `(app)/layout.tsx`.** The layout already does the auth check and already loads the partner row. Adding a `status === 'suspended'` branch reuses the existing read and centralises the policy at the entry point of the protected route group.

## Decision

**Gate in `src/app/(app)/layout.tsx`.** Extend the existing partner-row `select` to include `status`. Branch on it right after the user check: if `'suspended'`, call `await supabase.auth.signOut()` and then `redirect('/login?error=suspended')`. The login page reads `searchParams.error === 'suspended'` and renders a clear banner.

The `signOut()` is load-bearing — without it, the proxy's authed-on-`/login` redirect rule (proxy.ts:59-64) would bounce the user back to `/dashboard` in an infinite loop. By dropping the session cookie first, the user arrives at `/login` as anonymous, the proxy lets the request through, and the banner explains what happened.

## Consequences

**Positive:**
- Zero extra database reads — the partner row was already being loaded for the chrome.
- Loop-safe — proven by walking through proxy.ts:59-64.
- Visible UX — suspended user sees a clear "your account has been suspended" banner rather than a permission error.
- Policy lives next to the partner-row load, so anyone reading `layout.tsx` sees the full gate logic in one place.

**Negative:**
- Coverage is "everything under `src/app/(app)/`" — a hypothetical protected route outside that group (none today) would have to repeat the gate. Acceptable: the route group exists precisely to bundle protected-app concerns.
- The Route Handler at `src/app/(app)/api/submissions/[id]/pdf/route.ts` runs *outside* the layout. Suspended users hitting that endpoint directly aren't gated here; they're gated by `is_admin()`/per-partner RLS on the row read. If the row was theirs originally, RLS will still return it — acceptable risk because (a) they can't navigate to discover the URL without the dashboard, and (b) we can add a status check inside the handler later if we ever expose a discoverable link.

## When to revisit

If we add a second protected route group (e.g. a public-facing partner-portal area separate from `(app)`), refactor the gate into a shared server helper used by both layouts. Until then a single layout owns it.
