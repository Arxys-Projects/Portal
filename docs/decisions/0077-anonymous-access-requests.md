# 0077 — Anonymous "Request access" intake

- **Status**: Accepted
- **Date**: 2026-07-02

## Context

Partners who haven't been invited had no way to reach us from the portal — the login page only serves people who already have an account. We want a public form (name, email, company) on the login page that records interest for an admin to action. No email is sent anywhere; the stored row is the entire notification mechanism, and every request needs a human click to become an invite.

This is the **first unauthenticated-origin write path** in the portal. Every other write happens as an authenticated user (RLS-scoped) or via `service_role` in a trusted server action. Until now `anon` held **no** grant on any table (revoked in the initial schema). The security question is: how does an anonymous submission become a row without opening a spam or data-integrity hole, given that the anon key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) is shipped to every browser?

The controls that make this safe — a honeypot, an IP + email throttle, dedup against pending rows, and an `existing_user` flag — are all **server-side**. They can only run if the submission passes through our own server action; they are impossible to enforce on a request that talks to Supabase directly.

## Options considered

- **Grant `anon` INSERT via RLS, submit from the browser.** Matches the literal "anonymous write path" framing, but the public anon key means anyone can POST straight to `/rest/v1/access_requests` and skip the honeypot/throttle/dedup entirely — the controls become theatre.
- **Grant `anon` INSERT via RLS, but still route through a server action.** Same exposure: the grant is what an attacker uses, and it exists whether or not our form uses it.
- **Service-role insert inside a server action; `anon` gets nothing.** The write is trusted server code (same model as `invitePartner`); the public key can't touch the table at all, so the server-side controls are the *only* write path and cannot be bypassed. Chosen.
- **Third-party form service (Typeform/Formspree).** Extra vendor, extra data-handling surface, and still needs a sync into the portal. Rejected as overkill.

## Decision

The public form posts to a `requestAccess` **server action** that runs honeypot → validate → capture IP → dedup → throttle → `existing_user` flag → insert, all using the **`service_role`** admin client. `access_requests` grants `anon` **nothing**; `authenticated` gets SELECT + UPDATE, narrowed by RLS to `is_admin OR is_internal`. There is no INSERT or DELETE policy — inserts only ever happen server-side. No public SELECT under any circumstance: the table holds unverified, submitter-supplied data.

Approval is deliberately two-phase. The **Approve** action only navigates to the existing invite form (prefilled via query params); `access_requests.status` flips to `approved` with `converted_at` stamped **only** inside `invitePartner` on a fully successful send — never on the button click — so an admin who navigates away without sending leaves the request `pending` rather than in a false "approved" limbo.

## Consequences

**Positive:** The public anon key is useless against this table — the throttle/honeypot/dedup are unbypassable because the server action is the sole write path. Consistent with the portal's existing `service_role`-for-provisioning trust model. No new anon grant to reason about in future RLS audits. Nothing is auto-approved; no email is sent anywhere.

**Negative:** Deviates from the brief's literal "anon: INSERT only" line (confirmed with the requester before building). The RLS UPDATE policy for admin/internal is belt-and-suspenders — real updates run via `service_role`, which bypasses RLS — but it documents intent and would apply if a future authenticated-client path ever touches the table. Server-side throttle is best-effort (IP-based, defeatable by rotating IPs) — acceptable because the blast radius is low: no SELECT, no email, no auto-approve, manual review only.

**When to revisit:** if we ever want the form to submit directly from the browser without a server round-trip (then reconsider a scoped anon grant plus a database-side rate-limit), or if submission volume makes the manual-review model impractical and we need automated triage.
