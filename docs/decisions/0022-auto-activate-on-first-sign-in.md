# 0022 — Auto-activate invited partners on first protected-page load

- **Status**: Accepted
- **Date**: 2026-05-20

## Context

ADR [0010](./0010-invite-only-signup.md) locks the portal to invite-only signup: an admin invites a partner email, the partner gets a Supabase magic-link / set-password email, the partner clicks through and sets credentials. At that point the auth user exists, the `partners` row exists, and `partners.status = 'invited'`.

Phase A of Step 9 adds a `suspended` gate; the natural symmetric question is what happens to `'invited'` after the partner has, in fact, signed in. Leaving it at `'invited'` forever is harmless to functionality (RLS treats `invited` like `active` for non-admin reads — only `is_admin()` requires `status='active'`), but it lies: an "invited" partner who is already using the portal isn't really invited anymore. Admins reviewing the partner list need an honest signal of who has actually onboarded.

## Options considered

- **Manual flip only.** Admin clicks "Mark active" in the partner table after seeing a partner sign in. Honest but adds a chore that admins will forget; the status drifts out of sync with reality.
- **Confirm-email Supabase hook.** Listen for the auth user's `email_confirmed_at` flipping and update `partners.status` from a webhook. Most "correct" trigger point but adds infra (webhook endpoint, secret, deploy story) for a single status update.
- **Flip on first protected-page load.** When the `(app)` layout sees a partner row with `status='invited'`, flip it to `'active'` and continue rendering. No new infra, single side-effect at the natural moment the user has demonstrated they can actually sign in.
- **Hybrid (manual + auto).** Expose the manual control too. Phase B's partner-management UI will already render and allow editing the status, so the manual path effectively exists for free; this ADR is about what *also* happens automatically.

## Decision

**Auto-flip in `src/app/(app)/layout.tsx` on first protected-page load, using the service-role client.** When the partner row read returns `status='invited'`, fire-and-await an `UPDATE partners SET status='active' WHERE id=?` through `createSupabaseAdminClient()`, then continue rendering. Errors are logged but never block the render — a failed flip leaves the user as `'invited'` until the next request, which is harmless.

Service-role rather than the user-scoped client is deliberate: the partners-UPDATE RLS policy admits status changes from the user themselves today (`id = auth.uid()`), but Phase B may tighten that. Using the admin client now removes any future coupling between this side effect and the partner-row RLS rules.

## Consequences

**Positive:**
- The admin partner list reads honestly: `invited` means "invite sent, not yet signed in"; `active` means "currently signed-in user."
- One small admin chore eliminated; the manual "Mark active" button in Phase B's partner table becomes a corrective tool rather than a routine one.
- Idempotent: re-running the update on an already-`active` row is a no-op write. No race risk worth handling.

**Negative:**
- One extra DB write on the *first* authenticated request per invited partner. Negligible.
- The flip is awaited, adding ~10-30ms to that single render. If we ever need to optimise, we could fire-and-forget; correctness is preferred to latency for this volume.
- A partner who clicks the invite link, sets a password, then never returns will sit at `'active'` despite never having engaged with the portal beyond the auth flow. The signal is "they got in once," not "they are an active user" — that distinction will need a separate field if it ever matters (e.g. `last_sign_in_at` from `auth.users`).

## When to revisit

If we later need to gate features by `'invited'` vs `'active'` (e.g. show a "welcome" screen on the very first dashboard load), revisit how/when the flip happens. A hook on `email_confirmed_at` becomes more attractive then.
