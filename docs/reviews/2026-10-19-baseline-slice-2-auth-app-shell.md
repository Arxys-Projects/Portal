# Baseline Slice 2: Auth and app shell

> **BANNER: CHECK FIRST. One hole is open in production now. A second may be open, depending on one dashboard setting. No live secret was found and no key needs rotating.**
>
> 1. **Suspending a partner does not lock them out (B2-S-2, B2-A-2, VERIFIED).**
>    - `suspendPartner` only sets `partners.status` (`src/app/(app)/admin/partners/actions.ts:211-214`). The Auth account is never banned.
>    - The only enforcement is the `(app)` layout (`src/app/(app)/layout.tsx:24`). It runs on full page renders only, never on server actions or route handlers.
>    - A suspended partner can sign in again, download the current price book through `/login?next=/api/price-book/xlsx`, create Pipedrive deals through the comparison action, and email sales through `registerDealAction`.
>    - The coordinator re-read `actions.ts:211-214`, `layout.tsx:24` and `api/price-book/xlsx/route.ts:16-31` before raising this banner.
>    - It shares the ban fix with B1-S-3.
> 2. **If public sign-up is on in Supabase, any stranger can read the full price book (B2-S-1, B2-A-4; live setting unknown).**
>    - Nothing in the repo turns sign-up off. `supabase/config.toml:176, 221` have it on, and RUNBOOK §8 never disables it.
>    - The app lets in any Auth user, including one with no `partners` row. The layout checks only for `suspended`, and the price-book page and XLSX route check only for a session.
>    - Andy action 1 (one read-only `curl`) settles it. If `disable_signup` is false, this becomes Critical: turn sign-up off at once, then run action 2.
> 3. **The login page has an open redirect (B2-S-3, PRIOR M-2 incompletely fixed, VERIFIED).** `isSafeNext` accepts `/\evil.com`. The coordinator confirmed that `new URL("/\\evil.com", "https://portal.arxys.com/login")` resolves to `https://evil.com/`.
>
> Per the plan, Group 1 stops here and waits for Andy's reply.
>
> **Update, 2026-10-19 (after this report):**
> - Live sign-up was confirmed on (item 2 was Critical). Andy turned it off, and no self-registered accounts were found.
> - Items 1 to 3 and B1-S-3 are fixed in `5a50f98` (ADR 0164), with the migration applied and the live RLS suite passing.
> - The backlog has the current status of every row.

**Commit:** `6cbdf58ddabde24df16bc592ded1e433fb13410b` on `claude/group-1-audit-preflight-n8s0yw`. Its source is identical to `origin/main` at `2ae9350`: `git diff 2ae9350 6cbdf58` touches only `docs/reviews/`. `origin/main` had not moved, so merging it again was a no-op.
**Date:** 2026-10-19.
**Mode:** baseline, area scope through `review-gate`, with the finding cap raised to 20 per reviewer.
**Reviewers:** `security-review` at xhigh and `architect-review` at high, run as fresh parallel subagents. All three skills loaded.
**Inventory:** a third read-only subagent built the service-role inventory, the role-check sites, the env var inventory, proxy coverage, the version note and the committed auth config (Appendix A). The two reviewers worked independently of it, so the three cross-check each other.
**Tree state:**
- The audit ran in a separate git worktree on the audit branch, and that worktree was clean.
- The shared main checkout has another session's uncommitted work, and this audit did not touch it.
**Checks run:**
- read, grep, `git log`, `git show` and `git diff`
- `tsc --noEmit` (architect reviewer; exit 0)
- `npm audit --package-lock-only` (inventory; registry read, no install)
- `node -e new URL(...)` on the redirect payloads
- web and GitHub advisory lookups
**Not run:**
- Lint, unit tests, build, the dev server and browser tools.
- `scripts/test-rls.ts` and every other script.
- Anything touching a live system.

## Scope (final file list)

- **Proxy (Next 16, ADR 0009):** `src/proxy.ts`, `src/lib/supabase/proxy.ts`
- **Supabase clients:** `src/lib/supabase/{admin,browser,server}.ts`
- **Role and redirect helpers:** `src/lib/auth/require-admin-or-internal.ts`, `src/lib/auth/safe-next.ts`
- **Environment:**
  - `src/lib/env.ts` and `src/lib/pipedrive/lookups.ts` (its `process.env` read only)
  - `next.config.ts`, `.gitignore`, the `supabase/config.toml` `[auth]` section
  - `package.json` and `package-lock.json` (versions only)
  - `vercel.json` and `.env.example` do not exist.
- **Layouts and root:** `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/(app)/layout.tsx`, `src/app/(auth)/layout.tsx`, `src/app/(app)/admin/layout.tsx`, `src/app/(app)/price-book/layout.tsx`
- **Auth routes:**
  - `src/app/(auth)/login/{page.tsx,login-form.tsx,actions.ts,request-access-form.tsx,request-access-actions.ts}`
  - `src/app/(auth)/forgot-password/{page.tsx,forgot-form.tsx,actions.ts}`
  - `src/app/(auth)/reset-password/{page.tsx,reset-form.tsx,actions.ts}`
  - `src/app/(auth)/auth/confirm/{page.tsx,actions.ts}`
  - `src/app/(app)/_actions/logout.ts`
- **Admin gating, invites and access requests:**
  - `src/app/(app)/admin/page.tsx`, `admin/_components/admin-nav.tsx`
  - `admin/partners/{page.tsx,actions.ts,partner-row-actions.tsx,new/page.tsx,new/invite-form.tsx}`
  - `admin/requests/{page.tsx,actions.ts,request-row-actions.tsx}`
- **Service-role call sites (inventory only):**
  - `admin/submissions/{page.tsx,actions.ts,[id]/page.tsx,[id]/resend-notification-actions.ts}`
  - `calculator/{actions.ts,page.tsx}`, `dashboard/page.tsx`, `quick-calc/page.tsx`, `submissions/page.tsx`
  - `src/lib/pdf/render.ts`
- **Traced outside scope (read for auth and status lines only; their logic belongs to later slices):**
  - every route handler under `src/app/(app)/api/**` and every `"use server"` file
  - `src/lib/datasheet/guard.ts`, `src/lib/errors/safe-message.ts`, `src/app/(app)/_components/load-submission.ts`, the price-book pages
  - the gate lines in `admin/specs`, `admin/appliance-specs` and `admin/datasheets`
  - `docs/email-templates/*.html`, RUNBOOK §2, §8, §8b and §11
  - the two partner-role migrations
  - Next 16 bundled docs and dist source, and `@supabase/ssr` constants

## Verdict

**FIX BEFORE COMMIT. It becomes BLOCK if production sign-up is on.**
- There is no Architect Must fix and no confirmed Security Critical.
- Two Security High items are unresolved: B2-S-1 / B2-A-4 and B2-S-2 / B2-A-2. Under the gate's rules, a security High also blocks any recommendation to push.
- The security reviewer said BLOCK pending the sign-up check. The architect said PASS WITH NOTES (see Open disagreements). This merged verdict follows the gate's severity rules.

Counts after deduplication: 23 rows.
- Security: High 2, Medium 5, Low 6 (13 findings).
- Architect: Must fix 0, Should fix 8, Consider 5 (13 findings).
- Three root causes are shared: B2-S-1 with B2-A-4, B2-S-2 with B2-A-2, and B2-S-10 with B2-A-12.

## Plain-language summary

The portal checks that someone is signed in before every action and download, and the database keeps anonymous visitors out. The weak spot is what counts as "a partner". The app lets in anyone who has a Supabase login and is not marked suspended.

Two settings decide how bad that is. Nobody has confirmed that Supabase's public sign-up is switched off. A suspended partner can also still sign in and use most of the app outside page loads: the price-book download, comparison deals and deal-registration emails.

The fix for both is one shared "active partner" check called everywhere, plus banning the Auth account on suspend. That same check would replace the 16 places that each define "staff", "admin" or "active" in their own way today.

A crafted login link can send a partner to a fake site right after a real sign-in. Since leaked-password protection went on today, an invitee who picks a breached password only sees "Something went wrong".

Next.js is five security releases behind.

## Ranked findings

Ranked as the gate orders them: Security Critical, Architect Must fix, Security High, Architect Should fix, Security Medium, Architect Consider, Security Low.

| ID | Source | Severity | V/P | Location | One-line fix |
|---|---|---|---|---|---|
| B2-S-1, B2-A-4 | both | High (Critical if sign-up is on) / Should fix (Must fix if on) | VERIFIED app path, PLAUSIBLE live setting | `src/app/(app)/layout.tsx:18-29`; `api/price-book/xlsx/route.ts:16-31`; `price-book/page.tsx:26-30`; `supabase/config.toml:176, 221` | Andy turns sign-up off and confirms it. Add one fail-closed `requireActivePartner()` (row exists and status active) used by the layout, every route handler and every partner action. Later, gate price and spec SELECT policies on an active partner row. |
| B2-S-2, B2-A-2 (shares the ban with B1-S-3) | both | High / Should fix | VERIFIED | `admin/partners/actions.ts:211-214`; `(app)/layout.tsx:24-29`; `comparison/actions.ts:32-47`; `dashboard/actions.ts:40-55`; `quick-calc/actions.ts:58-64`; `submissions/actions.ts:21-27`; `api/price-book/xlsx/route.ts` | Ban the Auth user in `suspendPartner` (`ban_duration: "876000h"`, ban first and fail if it fails) and unban in `reactivatePartner`. Call the shared active check in every action and route. Supersede ADR 0021. Ship with B1-S-3. |
| B2-A-1 | architect | Should fix | VERIFIED | `src/lib/auth/require-admin-or-internal.ts:16` plus 2 wrappers, 9 independent copies and 4 status-blind reads (Appendix A, section B) | One `src/lib/auth/viewer.ts` (`server-only`, `cache()`d `getViewer()`, `isActive`/`isStaff`/`isAdmin`, `requireActive`/`requireStaff`/`requireAdmin`), matching Andy's decision 4 on the SQL side. Delete the copies. Unit-test the predicates. |
| B2-A-3 | architect | Should fix | VERIFIED code, PLAUSIBLE vendor code | `(auth)/reset-password/actions.ts:43-45`; `(auth)/login/actions.ts:34-36`; `admin/partners/actions.ts:104` | One `mapAuthError()` that switches on `error.code` (`weak_password`, `same_password`, rate limits, existing user). Keep the generic login message for `invalid_credentials`. |
| B2-A-5 | architect | Should fix | VERIFIED counts, PLAUSIBLE impact | `lib/supabase/proxy.ts:47`; `(app)/layout.tsx:13, 18, 56`; `admin/layout.tsx:12, 18`; `admin/partners/page.tsx:40, 43, 91, 103` | Use the cached `getViewer()` in layouts and pages. Share the pending-requests count. Use `getClaims()` in the proxy if the project has asymmetric signing keys. |
| B2-A-6 | architect | Should fix | VERIFIED code, PLAUSIBLE timing | `admin/partners/page.tsx:64`; `calculator/page.tsx:99`; `quick-calc/page.tsx:42`; `(auth)/login/request-access-actions.ts:139` | One paginating server-only `listAuthEmails()`. Request access does a single lookup by email. |
| B2-A-7 | architect | Should fix | VERIFIED content, PLAUSIBLE push risk | `supabase/config.toml:150-234` | Make `[auth]` match production (site URL, redirects, sign-up off, password rules, rate limits). At least add a "local only, never `config push`" header and record the live values in RUNBOOK §8. |
| B2-A-8 (PRIOR L-5) | architect | Should fix | VERIFIED in repo, PLAUSIBLE live | `(auth)/forgot-password/actions.ts:23-29`; `admin/partners/actions.ts:50-59, 96, 275` | Remove the header-derived `redirectTo` (the templates use `{{ .SiteURL }}`), or use a constant site URL. Close L-5 once Andy confirms the live templates. |
| B2-S-3 (PRIOR M-2) | security | Medium | VERIFIED | `src/lib/auth/safe-next.ts:7-14`, used at `login/actions.ts:38` and `auth/confirm/actions.ts:17-18, 35` | Parse with `new URL(next, "http://n.invalid")`, require that origin, and reject `\` and control characters. Alternatively, allow-list the app's path prefixes. Add unit cases. |
| B2-S-4 | security | Medium | PLAUSIBLE | RUNBOOK `:78`, `:327`, §8b | Andy: Git Fork Protection on, Deployment Protection Standard, and remove the service-role key, Pipedrive token and SMTP password from Preview and Development. Record an env-scope table in the RUNBOOK. |
| B2-S-5 | security | Medium | VERIFIED gap, PLAUSIBLE exploitation | `package.json` (`next` 16.2.6) | Upgrade Next to 16.4.2 or later (npm audit's named fix) with a matching `eslint-config-next`, after reading the upgrade guide in `node_modules/next/dist/docs`. |
| B2-S-6 | security | Medium | PLAUSIBLE | `login/actions.ts:16-40`; `forgot-password/actions.ts:14-39`; `auth/confirm/actions.ts:14-35` | A Vercel Firewall rate-limit rule on POST to `/login`, `/forgot-password` and `/auth/confirm`. Then consider Supabase CAPTCHA. |
| B2-S-7 | security | Medium | PLAUSIBLE | `admin/layout.tsx:12-13`; `admin/page.tsx:69`; `admin/partners/page.tsx:40`; `admin/requests/page.tsx:42`; `admin/submissions/page.tsx:91`; `admin/submissions/[id]/page.tsx` | Every admin page branches on its own gate (`if (!gate.ok) notFound()`), as the specs pages do. Add a CI grep for it. |
| B2-S-10, B2-A-12 (shares root cause with B1-S-2, B1-S-13) | both | Low / Consider | VERIFIED | `submissions/page.tsx:102-114`; `dashboard/page.tsx:83-92`; `admin/submissions/page.tsx:307-315`; `admin/submissions/[id]/page.tsx:62-71`; `lib/pdf/render.ts:108-115`; `resend-notification-actions.ts:62-67` | One server-only `loadPartnerNames(ids)`. Until the B1-S-2 guard lands, resolve names only when the row's creator is internal. |
| B2-A-9 | architect | Consider | VERIFIED | `lib/supabase/browser.ts`; `lib/supabase/proxy.ts:9` (`/auth/callback`); `admin/requests/page.tsx:42`; stale fallbacks at `admin/partners/page.tsx:91, 103` and `dashboard/page.tsx:48-52`; `src/app/page.tsx` | Delete them. Move the unauthenticated `/` redirect into the proxy. |
| B2-A-10 | architect | Consider | VERIFIED code, PLAUSIBLE effect | `lib/supabase/proxy.ts:30, 52-63` | Copy the `setAll` headers (`Cache-Control: private, no-store`) and copy `response.cookies` onto both redirect responses. |
| B2-A-11 | architect | Consider | PLAUSIBLE | `(app)/layout.tsx:31-43` | Flip `invited` to `active` in `updatePassword` after a successful `updateUser`. That removes the service-role write from a render. |
| B2-A-13 | architect | Consider | VERIFIED | `lib/pipedrive/lookups.ts:118`; `.gitignore:34`; RUNBOOK §2 | Add `optional(name)` to `env.ts`, add `!.env.example` to `.gitignore`, and commit an example generated from `REQUIRED_VARS`. No `vercel.json` is needed. |
| B2-S-8 | security | Low | VERIFIED | `lib/supabase/server.ts:7-29`; `lib/supabase/proxy.ts:22-41`; `config.toml:228` | Pass `cookieOptions: { httpOnly: true, secure: true, sameSite: "lax" }` to both server clients. Delete `browser.ts`. Turn on Secure password change. |
| B2-S-9 | security | Low | VERIFIED | `next.config.ts:3-37` | A `headers()` block: `frame-ancestors 'none'`, nosniff, `Referrer-Policy`, HSTS, and a CSP that starts in Report-Only mode. |
| B2-S-11 | security | Low | VERIFIED | `admin/partners/actions.ts:61-69, 115-122` | Store `invited_by` and show it on /admin/partners, or make invites admin-only (Andy decides). |
| B2-S-12 | security | Low | VERIFIED | `login/request-access-actions.ts:53-56, 97-98, 139-148`; `admin/requests/page.tsx:45-49` | Return the normal success message for a pending duplicate. Compute `existing_user` on the admin page. Paginate the admin list. Consider Turnstile. |
| B2-S-13 | security | Low | PLAUSIBLE | `auth/confirm/page.tsx:33-76`; `auth/confirm/actions.ts:14-35` | If a different user is already signed in, refuse the link with "this link is for another account". |

Full reasoning, exploit paths and regression tests for each row are in Appendix B (security) and Appendix C (architect).

## Known issues and PRIOR status

| Item | Status at `6cbdf58` |
|---|---|
| B1-S-3 / B1-A-6 | Open. `suspendPartner` still sets status only. B2-S-2 adds the app-layer paths. The `is_internal` reads in `calculator/page.tsx` and `quick-calc/page.tsx` also ignore status. |
| B1-A-11 | Open. `request-access-actions.ts:88-157` still counts, then inserts. |
| B1-S-11 | Open. Every app write to `access_requests` uses service role, so revoking `authenticated` UPDATE breaks no app path (VERIFIED by both reviewers). |
| B1-S-12 | Open. No app path writes `role`. `invitePartner` hard-codes `'partner'`. The admin-JWT REST path remains, and the app's last-admin guard (`partners/actions.ts:195-209`) also checks before it updates, so two admins can race. |
| B1-S-2, B1-S-13, B1-S-5, B1-S-8 | Open. Together they feed B2-S-10. |
| K-1 (ADR 0151) | Holds for this slice. Every app write to `partners` uses service role (`(app)/layout.tsx:35` and 8 sites in `partners/actions.ts`). |
| K-6 | Resolved. Andy deleted the 16 leftover personas on 2026-10-19. The backlog's Known issues row said "Still present" and is corrected in this update. |
| K-2 to K-5, K-7 | Outside Slice 2. |
| PRIOR M-1 (`registerDealAction`) | Fixed. Identity now comes from the session and the `partners` row (`dashboard/actions.ts:40-55`). It still has no status check (B2-S-2). |
| PRIOR M-2 (open redirect) | Partly fixed. `//` and `://` are blocked, and `/\` is not (B2-S-3). |
| PRIOR L-5 (redirect origin from headers) | Still in code. Not exploitable as deployed: Next's server-action Origin check pins the origin, and the repo templates use `{{ .SiteURL }}`. Tracked as B2-A-8. |
| PRIOR L-6 (`requireAdmin` without status) | Fixed (`admin/submissions/actions.ts:37`). |
| PRIOR I-1 (internal users read all partner emails) | Unchanged and by design. Wider than in June: the calculator and Quick Calc pages also give internal users every active partner's email, gated on `is_internal` without a status check. |

## Framework version note

| Package | Version |
|---|---|
| `next` | 16.2.6 (pinned). The App Router runs Next's vendored React `19.3.0-canary-3f0b9e61-20260317`. |
| `@supabase/ssr` | 0.10.3 |
| `@supabase/supabase-js` and `auth-js` | 2.105.4 |
| `react`, `react-dom` | 19.2.4 |

- **CVE-2025-29927 (x-middleware-subrequest):** does not apply. The affected ranges end at 15.2.3, and the Next 16.2.6 dist has no `x-middleware-subrequest` handling at all.
- **The May 2026 proxy-bypass family:** fixed in 16.2.5 and 16.2.6.
- **Open against 16.2.6:**
  - Missing releases: 16.2.11, 16.3.3, 16.3.6, 16.3.8 and 16.4.1.
  - Applies here: a high-severity Server Actions CPU DoS reachable from the anonymous `signIn` and `requestAccess` actions, and a moderate Server Action ID disclosure that makes B2-S-2's direct calls easier.
  - Does not apply here, because the portal does not use the affected feature: the i18n proxy bypass (CVE-2026-64642), the rewrites SSRF, the image-optimizer items on Vercel's managed optimizer, `next/og`, Cache Components and the Windows RCE.
  - The reviewers' sources give different advisory IDs for the same DoS. Slice 8's dependency report should reconcile them.
- **npm audit (`--package-lock-only`):**
  - `--omit=dev`: 11 findings (critical 1, high 6, moderate 4). The critical is `next`, and npm names 16.4.2 as the fix.
  - Full: 19 findings (critical 1, high 13, moderate 5).
  - No `@supabase/*` finding. `nodemailer` is high, with the fix in the 10.x major. Slice 8 owns it.
- **@supabase/ssr and supabase-js:** no advisory affects these versions. The only auth-js advisory (2025, `<=2.69.1`) predates 2.105.4.

## Dashboard checklist for Andy

The reviewers cannot see dashboards. The repo's `supabase/config.toml` holds the CLI defaults, so its values say nothing about production (B2-A-7). Confirm each item and send the values back.

**Supabase, Authentication:**

| Setting | What to confirm | Repo value (local only) | Row |
|---|---|---|---|
| Allow new users to sign up | **Off** | on | B2-S-1 |
| Anonymous sign-ins, manual linking, external providers | Off | off | B2-S-1 |
| Confirm email | Record the value | off | B2-S-1 |
| Site URL | `https://portal.arxys.com` | `http://127.0.0.1:3000` | B2-A-7 |
| Redirect URLs | Production only. Remove `https://*.vercel.app/**` if present. | `https://127.0.0.1:3000` | B2-A-8 |
| Email templates (invite, recovery, magic link, confirm) | Match `docs/email-templates`: links built from `{{ .SiteURL }}` and `{{ .TokenHash }}`, with no `ConfirmationURL` or `RedirectTo` | not in config | B2-A-8, L-5 |
| Minimum password length, character requirements | At least 8 (the app enforces 8) | 6, none | B2-A-3 |
| Leaked password protection | On (turned on 2026-10-19) | n/a | B2-A-3 |
| Secure password change | On | off | B2-S-8 |
| JWT expiry | Record the value | 3600 s | B2-S-2 |
| JWT signing keys | Asymmetric or legacy HS256 | n/a | B2-A-5 |
| Refresh token rotation, reuse interval | Record the values | on, 10 s | B2-S-8 |
| Session timebox, inactivity timeout, plan tier | Record the values (ADR 0008's revisit trigger has fired) | not set | B2-S-8 |
| Email OTP expiration (invite and recovery links use it) | Record the value | 3600 s | B2-A-3 |
| Auth rate limits (emails, sign-in, token verification) | Record the values | 2/h, 30 per 5 min, 30 | B2-S-6 |
| CAPTCHA | Record (off is expected today) | off | B2-S-6, B2-S-12 |
| SMTP sender | sales@arxys.com through Google (ADR 0025) | default mailer | |
| Auth DB connections | Switch from 10 absolute to percentage-based (Performance Advisor) | n/a | B2-A-5 |
| MFA for admins | Optional | off | |
| Total Auth users | Count against 200 | n/a | B2-A-6 |

**Vercel:**

| Setting | What to confirm | Row |
|---|---|---|
| Deployment Protection per environment | Standard, so generated production URLs are protected and portal.arxys.com stays public. Note whether an old generated production URL loads without logging in. | B2-S-4 |
| Protection bypass tokens | List any that exist | B2-S-4 |
| Git Fork Protection | On (the repo is public) | B2-S-4 |
| Env var scoping | Which of the 10 keys exist in Production, Preview and Development. The service-role key, Pipedrive token and SMTP password should be Production only and marked Sensitive. Also report whether `PIPEDRIVE_DEAL_OWNER_ID` is set. | B2-S-4, B2-A-13 |
| Firewall and WAF rules | Any rate-limit rules on `/login`, `/forgot-password`, `/auth/confirm` | B2-S-6 |
| HSTS on portal.arxys.com | Present, with its max-age | B2-S-9 |

## Andy action items

**Read only. Run these first.**

1. **Sign-up setting (B2-S-1).** Fetch `https://<project-ref>.supabase.co/auth/v1/settings` with the publishable key in the `apikey` header.
   - `disable_signup` must be `true`.
   - `mailer_autoconfirm: true` means email confirmation is off.
   - If `disable_signup` is false, turn sign-up off under Authentication > Sign In / Providers before anything else.
2. **Auth users with no partners row (B2-S-1, B2-A-4).** Any row a failed invite does not explain is a self-registered account. Review before deleting.
   ```sql
   -- READ ONLY
   select u.id, u.email, u.created_at, u.last_sign_in_at
   from auth.users u
   left join public.partners p on p.id = u.id
   where p.id is null;
   ```
3. **Suspended users who signed in after suspension (B2-S-2).** A sign-in after the suspension date means the hole was used. `partners` has no suspension timestamp (B1-A-10), so compare against what you know.
   ```sql
   -- READ ONLY
   select p.id, p.company_name, p.status, u.last_sign_in_at, u.banned_until
   from public.partners p
   join auth.users u on u.id = p.id
   where p.status = 'suspended';
   ```
4. **Complete the dashboard checklist above** and send back the values.
5. **Do not run `supabase config push`** until B2-A-7 is fixed. It would point every invite link at localhost and reopen sign-up.

**Decisions for Andy:**

6. Confirm suspension should end access at once. If so, the ban is the fix (B2-S-2, B1-S-3).
7. Choose between invites by any staff member with an `invited_by` record, and admin-only invites (B2-S-11).
8. Approve removing production secrets from Preview and Development, or a separate Supabase project and Pipedrive sandbox for previews (B2-S-4).

**Dashboard writes (Andy's call, after the reads):**
- Supabase: sign-up off, Secure password change on, minimum length 8, remove the `*.vercel.app` redirect wildcard, percentage-based Auth connections.
- Vercel: Git Fork Protection, Standard Deployment Protection, env scoping, a firewall rate-limit rule.

## Not checked

- Every live dashboard setting in the checklist above.
- A built client bundle. The claim that the service-role key never reaches the browser is confirmed at source level only.
- Runtime proofs of concept. Nothing ran against a server. The RSC partial-render bypass behind B2-S-7 was not reproduced.
- Hosted Supabase behavior, taken from vendor knowledge:
  - whether a ban makes `getUser` fail at once or only blocks refresh
  - the exact error code for a breached password
  - whether a password change revokes other sessions
- Vercel `x-forwarded-for` and header behavior, and whether Vercel Analytics records `token_hash` from `/auth/confirm` URLs.
- Lint, unit tests and the build.
- The business logic of route handlers and server actions beyond their auth and status lines (Slice 3), Pipedrive (Slice 4), email and PDF content (Slice 5), and scripts that read env (Slice 8).
- UI-only files not read in full: `reset-form.tsx`, `forgot-form.tsx`, `invite-form.tsx`, `partner-row-actions.tsx`.

## Open disagreements

1. **Verdict.**
   - Security: BLOCK pending the sign-up check.
   - Architect: PASS WITH NOTES.
   - The merged FIX BEFORE COMMIT follows the gate's rules: two unresolved security Highs, no confirmed Critical, no Must fix. It turns into BLOCK if sign-up is on. Andy's sign-up check settles it.
2. **What to do with the header-derived `redirectTo` (B2-A-8, L-5).**
   - Architect: delete it and call both Supabase methods without `redirectTo`.
   - Security: replace it with a constant site URL.
   - Both close L-5. Deleting leaves less code. A constant keeps the call explicit if a template ever switches to `{{ .RedirectTo }}`. Security does not object to either.
3. **Where to put the active check.**
   - Security wants `requireActivePartner()` in every partner action and route.
   - Architect wants the broader `viewer.ts` with `requireActive`, `requireStaff` and `requireAdmin`.
   - These are compatible. `requireActivePartner` is architect's `requireActive`. Building `viewer.ts` once covers both.

## Claims verified or refuted

| Claim | Result |
|---|---|
| Signup is invite-only (ADR 0010) | **Unverified, probably false at the platform layer.** The app has no sign-up page. The committed config enables sign-up, the RUNBOOK never disables it, and the app fails open for any Auth user (B2-S-1). |
| A suspended user cannot use the app (ADR 0021) | **Refuted** (B2-S-2, B2-A-2). |
| Only admins can invite users or change roles from the app | **Refuted for invites:** internal users can invite partners (B2-S-11). Confirmed for `is_internal` and `role`. An admin JWT can still change `role` over REST (B1-S-12). |
| `safe-next.ts` prevents open redirects | **Refuted** (B2-S-3). |
| The service-role key never reaches the browser bundle | **Confirmed at source level.** `admin.ts` imports `server-only`, `env.ts` reads `process.env[name]` dynamically (Next does not inline that), and no client file imports env or Supabase. No built bundle was inspected. The key does sit in Preview and Development (B2-S-4). |
| Next 16 `proxy.ts` replaces middleware and runs on every app route (ADR 0009) | **Verified, with limits.** The matcher covers pages, `/api/**` and server-action POSTs. It skips static assets and any path ending in an image extension. The proxy checks only for a session. Unauthenticated API calls get a 307 to `/login` in place of the routes' own 401. |
| All env access goes through `src/lib/env.ts` | **Refuted.** `lib/pipedrive/lookups.ts:118` reads `PIPEDRIVE_DEAL_OWNER_ID` directly (B2-A-13). |
| ADR 0025 names `src/app/auth/confirm/route.ts` | **Stale.** ADR 0051 replaced it with `(auth)/auth/confirm/page.tsx` and `actions.ts`, and 0025 was never annotated. |

**ADRs challenged:** 0021 (supersede with a ban on suspend plus a per-entry active check), 0022 (move the activation write to `updatePassword`), 0025 (stale path, and its `redirectTo` premise is moot), 0010 (record "sign-up disabled" as an explicit control), and 0008 (its revisit trigger has fired).

## Deliverables index

| Plan deliverable | Where |
|---|---|
| Service-role inventory | Appendix A, section A (23 rows), cross-checked against Appendix B, Appendix A |
| Dashboard checklist for Andy | "Dashboard checklist for Andy" above, with the committed values in Appendix A, section F |
| Framework version note | "Framework version note" above, with details in Appendix A, section E and Appendix B, section 7 |
| Role-check sites (architect focus) | Appendix A, section B, and Appendix C, B2-A-1 |
| Env var inventory | Appendix A, section C |
| Proxy and gate coverage | Appendix A, section D |

# Appendix A: Inventory (service-role sites, role checks, env vars, proxy coverage, versions, committed auth config)

Verbatim from the read-only inventory subagent. Paths are relative to the repository root.


Slice 2 inventory (auth and app shell), worktree `/Users/andynewbom/Developer/Arxys Portal/.claude/worktrees/group-1-audit` at 6cbdf58. I only read files. I wrote two npm audit JSON outputs to the scratchpad (`audit-prod.json`, `audit-all.json`) and nothing else. No secret values appear below. Paths are relative to the worktree root. `(app)` means `src/app/(app)` and `(auth)` means `src/app/(auth)`.

### A. Service-role inventory (src/)

**Key read path.** `SUPABASE_SERVICE_ROLE_KEY` is listed at `src/lib/env.ts:13` and read lazily via `process.env[name]` at `env.ts:27`. It is used only at `src/lib/supabase/admin.ts:6`.

**`import "server-only"` coverage:**
- `src/lib/supabase/admin.ts:1` has it.
- `src/lib/env.ts` does not.
- Of the 15 modules that import admin.ts, only `src/lib/pdf/render.ts:1` has it.
- 6 importers are `"use server"` files: `admin/partners/actions.ts`, `admin/requests/actions.ts`, `admin/submissions/actions.ts`, `admin/submissions/[id]/resend-notification-actions.ts`, `calculator/actions.ts`, `(auth)/login/request-access-actions.ts`.
- 8 importers are Server Component pages or layouts with no marker: `(app)/layout.tsx`, `admin/partners/page.tsx`, `admin/submissions/page.tsx`, `admin/submissions/[id]/page.tsx`, `calculator/page.tsx`, `quick-calc/page.tsx`, `dashboard/page.tsx`, `submissions/page.tsx`.
- Because admin.ts carries the marker, all of them inherit it transitively.
- `src/lib/storage/partner-logo.ts:1` has the marker and receives the admin client as a parameter (comment at `:68`).

| # | file:line | function | caller | why service role (what RLS would block) | guarding check (file:line) | includes status = active |
|---|---|---|---|---|---|---|
| 1 | src/lib/supabase/admin.ts:5-11 | createSupabaseAdminClient | server code only | factory | n/a | n/a |
| 2 | (app)/layout.tsx:35-39 | AppLayout | any signed-in user whose row is `invited` | updates own `partners.status` to active without depending on the partners UPDATE policy (comment :32-34) | `getUser` + `if (!user) redirect("/login")` :10-16; `partner?.status === "invited"` :31; `.eq("id", user.id)` :39 | n/a (fires only for invited) |
| 3 | admin/partners/actions.ts:95-159 | invitePartner | admin, internal | `auth.admin.inviteUserByEmail` :98, `partners` insert :115, `auth.admin.deleteUser` rollback :125, `access_requests` update :145 | `requireAdminOrInternal()` :68-69; is_internal flag gated `gate.isAdmin && ...` :92-93 | yes (helper :33) |
| 4 | admin/partners/actions.ts:185-214 | suspendPartner | admin | read target and count admins across partners, update another user's row | local `requireAdmin()` :172, check `partner?.role !== "admin" \|\| partner.status !== "active"` :44 | yes |
| 5 | admin/partners/actions.ts:230-234 | reactivatePartner | admin | update another user's status | local requireAdmin :225 / :44 | yes |
| 6 | admin/partners/actions.ts:250-267 | resendInvite | admin | read target status; `auth.admin.getUserById` :267 for email | local requireAdmin :245 / :44 | yes |
| 7 | admin/partners/actions.ts:322-326 | updatePartnerNameField (exported via updatePartnerCompanyName :367, updatePartnerContactName :374) | admin | update another user's name columns | local requireAdmin :309 / :44 | yes |
| 8 | admin/partners/actions.ts:353-360 | uploadPartnerLogo, which calls src/lib/storage/partner-logo.ts | admin | Storage upload plus `logo_path` update (comment :335-336: bypasses storage RLS) | local requireAdmin :343 / :44 | yes |
| 9 | admin/partners/actions.ts:413-417 | updatePartnerPipedriveUserId | admin | update another user's row | local requireAdmin :399 / :44 | yes |
| 10 | admin/partners/actions.ts:440-444 | setPartnerInternal | admin | update another user's `is_internal` | local requireAdmin :434 / :44 | yes |
| 11 | admin/partners/page.tsx:62-64 | AdminPartnersPage | admin, internal | `auth.admin.listUsers({perPage:200})` to join emails from auth.users | page calls `requireAdminOrInternal()` :40 but does not act on `!gate.ok`; relies on `admin/layout.tsx:12-13` `if (!gate.ok) notFound()` | yes (via layout helper) |
| 12 | admin/requests/actions.ts:31-38 | rejectAccessRequest | admin, internal | update `access_requests`. Comment :14-16 says the RLS UPDATE policy already grants this tier | `requireAdminOrInternal()` :23-24 | yes |
| 13 | admin/submissions/[id]/page.tsx:63-69 | AdminSubmissionDetailPage | admin, internal | read the on-behalf target's partner row | no own gate; relies on admin/layout.tsx:12-13. Target id comes from a user-scoped (RLS) submissions read :37-44 | yes (via layout) |
| 14 | admin/submissions/[id]/resend-notification-actions.ts:44, :66 | adminResendSubmissionNotification | admin, internal | `auth.admin.getUserById` for the recipient email | `requireAdminOrInternal()` :38-41 | yes |
| 15 | admin/submissions/actions.ts:125, :177-201 | adminRelinkPipedriveDeal (also reached via `projects/actions.ts:78` relinkPipedriveAction, which has no own gate and delegates) | admin, internal | partners lookups :177-179 and `auth.admin.getUserById` :201 | `requireAdminOrInternal()` :121-122 | yes |
| 16 | admin/submissions/page.tsx:308-312 | admin submissions page | admin, internal | on-behalf target company names | page :91 does not act on `!gate.ok`; relies on admin/layout.tsx:12-13 | yes (via layout) |
| 17 | calculator/actions.ts:187, :200-215, :489-493 | submitCalculation (quick-calc save path also lands here) | any active partner; on-behalf branch internal only | read the target partner row and `auth.admin.getUserById` :211; own partner display fields :489 | `getUser` :155-161; `if (!callerStatus \|\| callerStatus.status !== "active")` :173; on-behalf `callerStatus.is_internal` :195, :222; target `target.status === "active" && !target.is_internal` :205 | yes |
| 18 | calculator/page.tsx:85-99 | CalculatorPage | internal | list active non-internal partners plus `auth.admin.listUsers` :99 | `isInternal = Boolean(caller?.is_internal)` :83-84 | no; (app) layout blocks only `suspended` |
| 19 | quick-calc/page.tsx:34-42 | QuickCalcPage | internal | same as #18, `listUsers` at :42 | `isInternal = Boolean(caller?.is_internal)` :30-33 | no |
| 20 | dashboard/page.tsx:84-89 | DashboardPage | any signed-in partner | company names of on-behalf targets | ids derived from RLS-scoped own submissions :52-77; `if (partner && onBehalfIds.length > 0)` :83 | no |
| 21 | submissions/page.tsx:105-110 | PartnerSubmissionsPage | any signed-in partner | company_name and contact_name for on-behalf targets and incoming creators | ids derived from the RLS-scoped submissions read :36-47; no role or status check | no |
| 22 | src/lib/pdf/render.ts:109-115 | loadSubmissionPdfInput | via `api/submissions/[id]/pdf/route.ts:29` (any signed-in) and resend-notification-actions.ts:54 (admin, internal) | on-behalf target partner row | the submission must be visible through the caller-supplied user client :59-82. The route checks only `getUser` :19-25 | route: no; resend: yes |
| 23 | (auth)/login/request-access-actions.ts:83-157 | requestAccess | anonymous | anon has no grant on `access_requests` (comment :9); pending dedup :88, throttle counts :107 and :121, `auth.admin.listUsers` :139, insert :151 | none. Abuse controls only: honeypot :53-56, zod :59-75, dedup :88-99, per-IP throttle :106-119 (IP from `x-forwarded-for` :37-45), per-email throttle :121-132 | n/a |

**scripts/ that use service role (Slice 8 owns these), 21 files:** audit-pipedrive-products.ts, audit-price-book-specs.ts, backup-tables.ts, bootstrap-admin.ts, diagnose-partners.ts, dry-run-status-migration.ts, load-camera-specs.ts, product-specs-guarded-fix.ts, push-prices.ts, render-datasheet.ts, render-rail-mockup.ts, resend-onboarding.ts, restore-tables.ts, roundtrip-appliance-specs.mts, roundtrip-product-specs.mts, seed-appliance-specs.mts, seed-escambia-submission.mts, sync-pipedrive-companies.mts, test-rls.ts, update-competitor-data.ts, verify-project-queue.mts.

### B. Role and status check sites

| file:line | check as written | protects | helper |
|---|---|---|---|
| src/lib/auth/require-admin-or-internal.ts:33-39 | `!partner \|\| partner.status !== "active"`, then `role === "admin"`, `Boolean(is_internal)`, `!isAdmin && !isInternal` | shared gate | shared helper 1 |
| src/lib/datasheet/guard.ts:43 | `partner?.status !== "active"` gives 403; no user gives 401 :36 | datasheet download | shared helper 2 |
| supabase/migrations/20260515193702_initial_schema.sql:131-140 | `is_admin(uid)`: `role = 'admin' and status = 'active'` | RLS policies | DB function |
| supabase/migrations/20260605000004_fix_partners_internal_recursion.sql:13-22 | `is_internal(uid)`: `is_internal = true` (no status) | RLS, e.g. partners_select_internal :29-32 | DB function |
| (app)/layout.tsx:24 | `partner?.status === "suspended"` leads to signOut and redirect | every (app) page render | inline |
| (app)/layout.tsx:31 | `partner?.status === "invited"` leads to auto-activate | first load after invite | inline |
| (app)/layout.tsx:45-49 | `role === "admin"`, `Boolean(is_internal)` | header admin link, InternalBar, access_requests count | inline |
| admin/layout.tsx:12-13 | `if (!gate.ok) notFound()` | all /admin/* pages | shared helper 1 |
| admin/_components/admin-nav.tsx:62 | `!item.adminOnly \|\| isAdmin` | nav items (UI only) | prop from helper 1 |
| admin/page.tsx:69-70 | `gate.ok && gate.isAdmin` (no notFound) | admin-only UI; relies on layout | shared helper 1 |
| admin/partners/page.tsx:40-41 | `gate.ok && gate.isAdmin` (no notFound) | edit controls; relies on layout | shared helper 1 |
| admin/partners/new/page.tsx:18-19, :48 | `if (!gate.ok) notFound()`; `showInternalToggle={gate.isAdmin}` | invite form | shared helper 1 |
| admin/requests/page.tsx:42 | `await requireAdminOrInternal()` with the result discarded | relies on layout and RLS | shared helper 1 |
| admin/submissions/page.tsx:91-92 | `gate.ok && gate.isAdmin` (no notFound) | export and row controls; relies on layout | shared helper 1 |
| admin/datasheets/page.tsx:135-136 | `if (!gate.ok) notFound()` | datasheet picker | shared helper 1 |
| admin/specs/page.tsx:36-37; specs/new/page.tsx:13-14; specs/[sku]/page.tsx:38-39 | `!gate.ok \|\| !gate.isAdmin` leads to notFound | spec admin pages | shared helper 1 |
| admin/appliance-specs/page.tsx:44-45; new/page.tsx:40-41; [sku]/page.tsx:35-36 | same | appliance spec pages | shared helper 1 |
| admin/specs/actions.ts:42-55 (used :95, :142) | local `requireAdmin` wraps helper plus `!gate.isAdmin` | createSpec, updateSpec | local wrapper over helper 1 |
| admin/appliance-specs/actions.ts:37-50 (used :99, :146) | same | createApplianceSpec, updateApplianceSpec | local wrapper over helper 1 |
| admin/partners/actions.ts:28-48 (used :172, :225, :245, :309, :343, :399, :434) | `partner?.role !== "admin" \|\| partner.status !== "active"` :44 | 7 admin-only partner actions | inline copy |
| admin/partners/actions.ts:68, :92-93 | helper; `gate.isAdmin && formData.get("isInternal") === "on"` | invitePartner and its is_internal flag | shared helper 1 |
| admin/partners/actions.ts:195 | target `role === "admin" && status === "active"` | last-admin suspend guard | inline (target) |
| admin/partners/actions.ts:260 | target `status !== "invited"` | resendInvite | inline (target) |
| admin/requests/actions.ts:23 | helper | rejectAccessRequest | shared helper 1 |
| admin/submissions/actions.ts:26-37 (used :47-49, :64-66) | `partner?.role === "admin" && partner?.status === "active"` :37 | adminUpdateStatus, adminDeleteSubmission | inline copy |
| admin/submissions/actions.ts:121 | helper | adminRelinkPipedriveDeal | shared helper 1 |
| admin/submissions/[id]/resend-notification-actions.ts:38 | helper | resend email | shared helper 1 |
| admin/submissions/[id]/project-quote-actions.ts:50-56 | `caller?.status === "active" && (caller.is_internal === true \|\| caller.role === "admin")` | generateProjectQuote (also via projects/actions.ts:89) | inline |
| admin/submissions/[id]/page.tsx:94-101 | `Boolean(callerRow?.is_internal)` | canRevise, quote panel, Relink and Resend buttons | inline, no status |
| projects/page.tsx:14-15 | `if (!gate.ok) notFound()` | /projects | shared helper 1 |
| projects/actions.ts:32, :50, :62, :122 | helper | refresh, archive, restore, preview actions (:78 and :89 delegate) | shared helper 1 |
| calculator/actions.ts:173 | `!callerStatus \|\| callerStatus.status !== "active"` | submitCalculation | inline |
| calculator/actions.ts:195, :205, :222, :237 | `callerStatus.is_internal`; target `status === "active" && !is_internal` | on-behalf binding | inline (after the status check) |
| calculator/page.tsx:83-84 | `Boolean(caller?.is_internal)` | service-role partner list and emails | inline, no status |
| quick-calc/page.tsx:30-33 | `Boolean(caller?.is_internal)` | same | inline, no status |
| dashboard/page.tsx:40, :46 | `role === "admin"`; `!isAdmin && !partner?.is_internal` | admin tile, logo (UI) | inline, no status |
| api/admin/forecast/xlsx/route.ts:33 | `me?.role !== "admin" \|\| me.status !== "active"` | XLSX export | inline |
| api/admin/submissions/[id]/project-quote/pdf/route.ts:36-37 | `status === "active" && (is_internal \|\| role === "admin")` | quote PDF | inline |
| api/submissions/[id]/project-quote/pdf/route.ts:48, :64 | `caller?.status !== "active"`; `is_internal === true \|\| role === "admin"` | quote PDF ownership bypass | inline |
| api/datasheet/[model]/route.ts:34-36 | `requireDatasheetAccess()` | datasheet | shared helper 2 |

**Session-only gates (getUser, with no role or status check):**
- dashboard/actions.ts:41-56 (registerDealAction, the M-1 site)
- comparison/actions.ts:33-38
- quick-calc/actions.ts:59-63
- submissions/actions.ts:21-27 (requireSession; relies on RLS)
- api/submissions/[id]/pdf/route.ts:19-25
- api/comparison/pdf/route.ts:46-50
- api/price-book/xlsx/route.ts:18-22
- (auth)/reset-password/actions.ts:33-38

**Counts:**
- Shared app helpers: 2 (`requireAdminOrInternal`, `requireDatasheetAccess`), plus 2 DB functions (`is_admin`, `is_internal`).
- Local `requireAdmin` copies: 4. Two re-implement the query inline (partners/actions.ts:28, admin/submissions/actions.ts:26). Two wrap helper 1 (specs/actions.ts:42, appliance-specs/actions.ts:37).
- Other inline caller checks: 13 sites:
  - layout :24, :31, :45-49
  - calculator/actions :173 and the :195-237 group
  - project-quote-actions :54
  - the three api routes
  - admin/submissions/[id]/page :101
  - calculator/page :83
  - quick-calc/page :30
  - dashboard/page :40/46
- Inline target-row checks: 2 (partners/actions :195, :260).
- Caller checks that ignore status: 5 in src (layout :45-49, admin/submissions/[id]/page :101, calculator/page :83, quick-calc/page :30, dashboard/page :40/46), plus DB `is_internal()`. All 5 src sites run under (app)/layout.tsx, which rejects only `suspended`. A missing partner row, or any status other than suspended or invited, passes the layout.
- Pages that call helper 1 without acting on `!gate.ok`: 4 (admin/page, partners/page, requests/page, submissions/page). All rely on admin/layout.tsx:13.

### C. Environment variable inventory

All 10 required vars are read only via src/lib/env.ts, using a lazy getter `process.env[name]` at :27 that throws if a var is missing. env.ts has no `server-only`.

| variable | where used (file:line) | NEXT_PUBLIC_ | server-only module | required | access |
|---|---|---|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL | env.ts:11; admin.ts:6, server.ts:8, proxy.ts:23, browser.ts:6 | yes | admin.ts yes; server.ts, proxy.ts, browser.ts no | required | env.ts |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | env.ts:12; server.ts:9, proxy.ts:24, browser.ts:7 | yes | no | required | env.ts |
| SUPABASE_SERVICE_ROLE_KEY | env.ts:13; admin.ts:6 | no | yes (admin.ts) | required | env.ts |
| PIPEDRIVE_API_TOKEN | env.ts:14; pipedrive/client.ts:181 (set as a URL query param) | no | no; omitted on purpose, per client.ts:8-11 | required | env.ts |
| SMTP_HOST | env.ts:15; email/transport.ts:17 | no | yes | required | env.ts |
| SMTP_PORT | env.ts:16; transport.ts:12, :14 | no | yes | required | env.ts |
| SMTP_USER | env.ts:17; transport.ts:20; email/submission-notification.ts:133-134; comparison/actions.ts:89-90 ("use server") | no | yes, except the comparison/actions.ts use | required | env.ts |
| SMTP_PASS | env.ts:18; transport.ts:20 | no | yes | required | env.ts |
| SMTP_FROM | env.ts:19; email/deal-registration.ts:38; submission-notification.ts:150, :165; comparison/actions.ts:93 | no | yes, except comparison | required | env.ts |
| INTERNAL_NOTIFICATION_EMAIL | env.ts:20; deal-registration.ts:39; submission-notification.ts:133, :151; comparison/actions.ts:89, :94 | no | yes, except comparison | required | env.ts |
| PIPEDRIVE_DEAL_OWNER_ID | src/lib/pipedrive/lookups.ts:118 | no | no | optional | direct `process.env` |

- next.config.ts reads no env.
- supabase/config.toml `env()` references:
  - OPENAI_API_KEY :95 ([studio], local only)
  - SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN :294 (twilio `enabled = false`)
  - SUPABASE_AUTH_EXTERNAL_APPLE_SECRET :326 (apple `enabled = false`)
  - S3_HOST :399, S3_REGION :401, S3_ACCESS_KEY :403, S3_SECRET_KEY :405 ([experimental])
  - Commented out: SECRET_VALUE :51 and :386, SENDGRID_API_KEY :242
- Fact: env.ts uses dynamic `process.env[name]`, which Next.js does not inline into client bundles. `src/lib/supabase/browser.ts` has no importers in src, so it is currently unused.
- `.env.example`: does not exist. `vercel.json`: does not exist.
- `.gitignore:34` is `.env*` (comment at :33). There is no negation, so a future `.env.example` would be ignored unless force-added.
- `git ls-files | grep -i env` returns only `src/lib/env.ts`, a source file. No dotenv file is tracked. The worktree has no .env files. The main checkout has an untracked `.env.local`; I did not read it.

### D. Proxy and gate coverage

**src/proxy.ts:8-15 matcher:**
```
"/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
```
- It covers every path, including `/api/*` and Server Action POSTs, except: _next/static, _next/image, favicon.ico, and any path ending in .svg/.png/.jpg/.jpeg/.gif/.webp (lowercase only).

**src/lib/supabase/proxy.ts:**
- Public paths (:5-11, matched as exact or `prefix + "/"`): /login, /forgot-password, /reset-password, /auth/callback, /auth/confirm. `/` is also exempt (:52).
- `/auth/callback` has no route in src/app.
- Signed out on any other matched path: redirect to `/login?next=<pathname>` (:52-57). This applies to `/api/*` too: they get a redirect, not a 401.
- Signed in on `/login` or `/`: redirect to `/dashboard` (:59-64).
- The only check is `supabase.auth.getUser()` at :45-47. There is no suspend, status or role check in the proxy.

**Layouts:**
- (app)/layout.tsx:
  - getUser, else redirect to /login :10-16
  - suspended: signOut and redirect :24-29
  - invited: service-role auto-activate :31-43
  - role/internal flags for UI :45-61
  - Nothing else blocks.
- admin/layout.tsx: `requireAdminOrInternal()`, and `notFound()` if not ok :12-13.
- price-book/layout.tsx: no checks (font links only). It inherits the (app) layout.
- (auth)/layout.tsx: no checks (presentational).
- Root src/app/layout.tsx: none.
- src/app/page.tsx:7-11: getUser, then redirect to /dashboard or /login.
- Layout checks do not run in front of route handlers or Server Action execution.

**Route handlers** (all under `(app)/api`, Slice 3 owns their logic):

| route | own check |
|---|---|
| api/admin/forecast/xlsx/route.ts | getUser :22-24; admin plus active :33 |
| api/admin/submissions/[id]/project-quote/pdf/route.ts | getUser :28-29; active plus (internal or admin) :36-38 |
| api/comparison/pdf/route.ts | getUser only :48-50 |
| api/datasheet/[model]/route.ts | requireDatasheetAccess :34-36 (active) |
| api/price-book/xlsx/route.ts | getUser only :20-22 |
| api/submissions/[id]/pdf/route.ts | getUser only :22-24, then RLS via loadSubmissionPdfInput :29 |
| api/submissions/[id]/project-quote/pdf/route.ts | getUser :40-41; active :48-49; ownership or internal/admin :64-70 |

**"use server" files in admin and auth:**

| file | export | own check |
|---|---|---|
| (app)/_actions/logout.ts | signOut | none (signs out own session) |
| admin/appliance-specs/actions.ts | createApplianceSpec, updateApplianceSpec | local requireAdmin :99, :146 (user client, RLS) |
| admin/partners/actions.ts | invitePartner | helper :68 |
| same | suspend, reactivate, resendInvite, company name, contact name, logo, pipedrive id, setInternal | local requireAdmin :172, :225, :245, :309 (two exports), :343, :399, :434 |
| admin/requests/actions.ts | rejectAccessRequest | helper :23 |
| admin/specs/actions.ts | createSpec, updateSpec | local requireAdmin :95, :142 |
| admin/submissions/[id]/project-quote-actions.ts | generateProjectQuote | inline :38-56 |
| admin/submissions/[id]/resend-notification-actions.ts | adminResendSubmissionNotification | helper :38 |
| admin/submissions/actions.ts | adminUpdateStatus, adminDeleteSubmission | inline requireAdmin :47-49, :64-66 |
| same | adminRelinkPipedriveDeal | helper :121 |
| (auth)/auth/confirm/actions.ts | confirmToken | none (public); verifyOtp :25; `isSafeNext` :18 |
| (auth)/forgot-password/actions.ts | requestReset | none (public); origin from `Origin`/`Host` headers :23-25 |
| (auth)/login/actions.ts | signIn | none (public); `isSafeNext` :38. No suspended check here; the (app) layout handles it |
| (auth)/login/request-access-actions.ts | requestAccess | none (anonymous); anti-abuse only |
| (auth)/reset-password/actions.ts | updatePassword | getUser :33-38 |

**Cross-references to prior audit items (facts only):**
- M-2: `isSafeNext` (src/lib/auth/safe-next.ts:7-14) checks startsWith "/", not "//", not "://". It has no backslash handling.
- L-5: admin/partners/actions.ts:50-59 and forgot-password/actions.ts:23-25 still build the redirect origin from the `Origin`/`Host` headers.
- L-6: both inline requireAdmin copies now include status (partners/actions.ts:44, admin/submissions/actions.ts:37).
- I-1: `listUsers` (all auth emails) is reachable by internal users at admin/partners/page.tsx:64, calculator/page.tsx:99 and quick-calc/page.tsx:42.
- M-1: registerDealAction has no status check (dashboard/actions.ts:41-56).

### E. Framework versions and advisories

**Versions (package.json, and package-lock.json and installed node_modules agree):**
- next 16.2.6 (pinned)
- @supabase/ssr ^0.10.3, locked 0.10.3
- @supabase/supabase-js ^2.105.4, locked 2.105.4 (auth-js 2.105.4)
- react and react-dom 19.2.4
- server-only 0.0.1

The App Router runs on Next's vendored React, `19.3.0-canary-3f0b9e61-20260317` (node_modules/next/dist/compiled/react). The top-level react package is not the RSC runtime.

**Advisories:**
- **CVE-2025-29927** (GHSA-f82v-jwr5-mffw, x-middleware-subrequest): affected ranges are 12.x <12.3.5, 13.x <13.5.9, 14.x <14.2.25 and 15.x <15.2.3. **16.2.6 is not affected.**
- **May 2026 Proxy bypass family:** 16.2.6 is exactly the patched version for GHSA-26hh-7cqf-hhc6 (segment-prefetch, incomplete-fix follow-up, fixed 16.2.6). The related May 2026 bypasses are fixed in 16.2.5:
  - GHSA-267c-6grr-h53f (segment-prefetch)
  - GHSA-492v-c6pp-mqqv (dynamic route param injection)
  - GHSA-36qx-fr4f-26g5 (Pages Router i18n)
  - GHSA-8h8q-6873-q5fj (RSC DoS)
- **Open against 16.2.6:**
  - **GHSA-6gpp-xcg3-4w24 / CVE-2026-64642**, high, Proxy bypass, affected >=16.0.0 <16.2.11. It requires App Router, a Turbopack build and `config.i18n.locales` with a single entry. Turbopack is the default for `next build` in 16 (package.json build is plain `next build`). next.config.ts has no `i18n` key, so the single-locale condition does not appear to be met.
  - Also open, fixed in 16.2.11:
    - GHSA-m99w-x7hq-7vfj (Server Actions DoS, high)
    - GHSA-89xv-2m56-2m9x (SSRF in Server Actions on custom servers, high)
    - GHSA-p9j2-gv94-2wf4 (rewrites SSRF, high)
    - GHSA-955p-x3mx-jcvp (Server Function endpoint disclosure, moderate)
    - GHSA-68g3-v927-f742 and GHSA-4633-3j49-mh5q (cache confusion, moderate)
    - GHSA-4c39-4ccg-62r3 (Edge Server Action payload, moderate)
    - GHSA-q8wf-6r8g-63ch (image SVG DoS, moderate)
  - Critical:
    - GHSA-p293-qw3h-jr36 (RCE, Windows-hosted, <16.3.3)
    - GHSA-2xp9-vwfh-vxw4 (RCE, Image Optimization with AVIF, <16.3.3)
    - GHSA-vcvr-r3jv-pc5j (RCE in next/og, >=16.2.0 <16.3.6)
  - Fixed in 16.3.8:
    - GHSA-cjq9-62q9-8jv4 (Image Optimization SSRF, high)
    - GHSA-4jqv-mc3x-m676, GHSA-mcj8-r9mp-w47p, GHSA-f87g-xv8r-7p7x (moderate)
    - GHSA-39w2-rjm5-chcv (low)
  - npm audit names next 16.4.2 as the non-major fix.
- **Supabase packages:**
  - @supabase/ssr: no GHSA found (GitHub advisory API and web search).
  - @supabase/supabase-js: none.
  - @supabase/auth-js: only GHSA-8r88-6cj9-9fh5 (low, <=2.69.1), which does not affect 2.105.4.

**npm audit** (`--package-lock-only`, no install; exit 1 = findings):
- `--omit=dev`: 11 total. Critical 1 (next), high 6, moderate 4, low 0.
  - High: next-bundled postcss and sharp, nodemailer (direct, fix is the 10.1.7 major), brace-expansion, nanoid, source-map-js.
  - Moderate: exceljs/uuid, fflate, baseline-browser-mapping.
- Full: 19 total. Critical 1, high 13, moderate 5. The extra items are eslint-config-next chain, js-yaml, browserslist, csv-parse.
- Items touching next, @supabase/* or auth: only `next` (critical; its postcss and sharp sub-findings are fixed with next 16.4.2). No @supabase/* finding.
- Nodemailer is the SMTP transport for auth-adjacent mail (notifications). Supabase sends auth emails itself.

### F. Committed auth config (supabase/config.toml, LOCAL; Andy must confirm each live in the dashboard)

| setting | local value (line) | live |
|---|---|---|
| site_url | `http://127.0.0.1:3000` :154 | Andy must confirm live in the dashboard |
| additional_redirect_urls | `["https://127.0.0.1:3000"]` :158 | Andy must confirm live in the dashboard |
| enable_signup ([auth]) | true :176 | Andy must confirm live in the dashboard |
| enable_signup ([auth.email]) | true :221 | Andy must confirm live in the dashboard |
| anonymous sign-ins | false :178 | Andy must confirm live in the dashboard |
| email enable_confirmations | false :226 | Andy must confirm live in the dashboard |
| double_confirm_changes | true :224 | Andy must confirm live in the dashboard |
| secure_password_change | false :228 | Andy must confirm live in the dashboard |
| minimum_password_length | 6 :182. App-side reset form enforces 8 at reset-password/actions.ts:10 | Andy must confirm live in the dashboard |
| password_requirements | "" (none) :185 | Andy must confirm live in the dashboard |
| jwt_expiry | 3600 :160 | Andy must confirm live in the dashboard |
| refresh token rotation | enable_refresh_token_rotation = true :166, reuse interval 10s :169. Session timebox not set; comment :170-174 says it is a Pro feature and refresh tokens persist until revoked | Andy must confirm live in the dashboard |
| rate limits | email_sent 2/h :199, sign_in_sign_ups 30 per 5 min :207, token_verifications 30 :209, token_refresh 150 :205 | Andy must confirm live in the dashboard |
| email max_frequency / OTP | "1s" :230; otp_length 6 :232; otp_expiry 3600 :234 | Andy must confirm live in the dashboard |
| smtp | `[auth.email.smtp]` commented out :237-244 (local default mailer) | Andy must confirm live in the dashboard |
| email templates | commented out :247-255 | Andy must confirm live in the dashboard |
| mfa | TOTP enroll/verify false :303-304; phone false :308-309; max_enrolled_factors 10 :299 | Andy must confirm live in the dashboard |
| captcha | `[auth.captcha]` commented out :214-217 (not configured) | Andy must confirm live in the dashboard |
| external providers / SMS | apple, twilio, web3, third-party providers and oauth_server all disabled | Andy must confirm live in the dashboard |

Sources:
- [GHSA-6gpp-xcg3-4w24](https://github.com/advisories/GHSA-6gpp-xcg3-4w24)
- [GHSA-f82v-jwr5-mffw (CVE-2025-29927)](https://github.com/advisories/GHSA-f82v-jwr5-mffw)
- GitHub Advisory API queried via `gh api /advisories` for next, @supabase/ssr, @supabase/supabase-js, @supabase/auth-js, react-server-dom-*
- Web search for @supabase/ssr advisories, which found none ([supabase discussions](https://github.com/orgs/supabase/discussions/38690))

# Appendix B: Security reviewer report (security-review, xhigh)

Verbatim. The ranked table above is the merged view.


## Security review: Baseline Slice 2, auth and app shell

**CHECK FIRST (possible production hole, not confirmed):** I found no live secret. One possible production hole needs a dashboard check today. Nothing in the repo turns off Supabase public sign-up, and the app treats any Supabase Auth account as a partner (B2-S-1). Run Andy actions 1 and 2 (both read only). If `disable_signup` comes back false, turn sign-ups off under Authentication > Sign In / Providers, then review the orphan-account query results.

### 1. Header

- **Commit:** `6cbdf58`. `src`, `supabase`, `next.config.ts` and the package files are identical to `2ae9350` (`git diff --stat` is empty). The worktree is clean.
- **Scope:** every file in `slice2-scope.md`.
- **Traced outside scope (named so you can check):**
  - auth and status lines in all 7 route handlers under `src/app/(app)/api/**`
  - the status check in each of the 19 `"use server"` files
  - `src/lib/pdf/render.ts`, `src/lib/datasheet/guard.ts`, `src/app/(app)/_components/load-submission.ts`
  - the price-book pages
  - gate lines in `admin/specs`, `admin/appliance-specs` and `admin/datasheets`
  - `docs/email-templates/*.html`, RUNBOOK §2, §8, §8b and §11
  - the Slice 1 policy matrix
  - Next 16.2.6 dist source: `server/app-render/action-handler.js`, `client/components/router-reducer/reducers/server-action-reducer.js`, `client/assign-location.js`
  - `@supabase/ssr` `dist/main/utils/constants.js`
- **Docs read:** AGENTS.md, BASELINE-PLAN (Slice 2 section and Known issues), BASELINE-BACKLOG, GROUP-1-HANDOFF, AUDIT-01-security.md, and ADRs 0005, 0008, 0009, 0010, 0021, 0025, 0028, 0051, 0070, 0077, 0151 and 0152. I also read Next 16 bundled docs: authentication.md, data-security.md, proxy.md, cdn-caching.md and fetching-data.md.
- **Checks run (all read only):**
  - grep inventories: service-role sites; `getUser`/`getSession`/`getClaims` (all `getUser`, no `getSession` or `getClaims` in `src`); `process.env`; `NEXT_PUBLIC_`; `server-only`; `"use client"` files importing env or Supabase (none); writes to `partners` (all through the service-role client); status checks per action file.
  - `git log -S createSupabaseBrowserClient()`: added in 9b28d77 and never called.
  - `git grep eyJhbGciOi`: no JWT-like strings tracked.
  - node `new URL()` on the redirect payloads: both resolve off-site.
  - grep of the Next dist for `x-middleware-subrequest`: absent.
  - WebSearch and WebFetch of Next.js advisories.
- **Not run:** npm audit, build, tsc, tests, dev server, any live call.
- **Versions:** next 16.2.6, react and react-dom 19.2.4, @supabase/ssr 0.10.3, @supabase/supabase-js 2.105.4 (auth-js 2.105.4), zod 4.4.3, nodemailer 8.0.7.

### 2. Verdict

**BLOCK, pending one dashboard check.** If sign-ups are confirmed off, this drops to **FIX BEFORE COMMIT**. B2-S-2 (suspension does not end access) is High and VERIFIED, and the app's fail-open partner check in B2-S-1 remains a Medium.

Counts: High 2, Medium 5, Low 6.

### 3. Plain-language summary

The portal's own code is mostly careful. Every server action and download route checks who is signed in, and the database keeps visitors without an account out.

The weak spot is what counts as "a partner." The app lets in anyone with a Supabase login, and nothing shows that Supabase's public sign-up is switched off. If it is on, a stranger who gets the public key could create an account and read the full price book.

Suspending a partner does not lock them out. They can still sign in, download the price book through a direct link, create Pipedrive deals and email sales.

A login link can also be crafted to send a partner to a fake site right after a real sign-in.

### 4. Findings

#### B2-S-1: any Supabase Auth account counts as a partner, and public sign-up is never shown as disabled
- **Severity:** High. It becomes Critical if sign-up is on and the publishable key is known.
- **Verification:** PLAUSIBLE for the live setting. VERIFIED for the app path.
- **Actor:** A, E. **Owner:** Andy (dashboard), build session (code).
- **Location:**
  - `supabase/config.toml:176, 221, 226`: `enable_signup = true` twice, `enable_confirmations = false`.
  - RUNBOOK §8 (lines 261-272) has no sign-up step.
  - `src/app/(app)/layout.tsx:18-29` checks only `status === "suspended"`.
  - `src/app/(app)/price-book/page.tsx:26-30` and `src/app/(app)/api/price-book/xlsx/route.ts:16-31` have no partner check.
  - RLS `products_select_active_or_admin` (`20260615000001:78`) plus the `product_specs`, `competitor_products` and `camera_specs` SELECT policies, which allow any `authenticated` user.
- **What is wrong:** ADR 0010's invite-only rule exists only as the absence of a /signup page. The committed config enables sign-up, the RUNBOOK never disables it, and a branded "Confirm signup" template is deployed. Hosted projects allow sign-up by default.
  - The app authorizes on "has a session." A user with no `partners` row passes the proxy and the (app) layout. They then reach `/price-book` and the XLSX route.
- **Preconditions:** live sign-up is on, and the attacker holds the publishable key. The app does not ship that key to browsers today (no client component reads it, and `browser.ts` is unused), which lowers the odds. Supabase treats the key as public, and it sits in three Vercel environments and every `.env.local`.
- **Impact:** an outsider can:
  - sign up through `/auth/v1/signup`
  - sign in at /login
  - read the full price book in the UI and as XLSX
  - read specs, competitor data and camera specs over REST

  If confirmations are on, sign-up also sends mail from sales@arxys.com to any address.
- **Proof of concept (local only):**
  1. With local Supabase and the committed config, call `supabase.auth.signUp` using the local anon key.
  2. Sign in at `http://localhost:3000/login`.
  3. Open `/price-book` and `/api/price-book/xlsx`.
- **Simplest fix:**
  1. Turn sign-up off in the dashboard, and set both `enable_signup = false` in `config.toml`. `inviteUserByEmail`, `resetPasswordForEmail` and `createUser` keep working with sign-up off.
  2. Replace the deny-list at `layout.tsx:24` with one shared fail-closed `requireActivePartner()`: the row exists and status is active, with invited handled first. Use it in the layout, every route handler and every partner action.
  3. Later, gate the price and spec SELECT policies on an active partner row, using the planned no-argument helper.

  None of this widens a policy, adds an endpoint or adds a service-role path.
- **Regression tests:** unit tests for `requireActivePartner` (no row, invited, suspended, active). test-rls.ts cases: "auth user with no partners row reads 0 products" (denied) and "active partner reads products" (allowed).

#### B2-S-2: suspension does not end access
- **Severity:** High. **Verification:** VERIFIED.
- **Actor:** C (a suspended partner or staff member). **Owner:** build session.
- **Shares root cause with B1-S-3. Keep both IDs.**
- **Location:**
  - `src/app/(app)/admin/partners/actions.ts:211-214` sets status only, with no Auth ban.
  - `src/app/(app)/layout.tsx:24-29` is the only gate.
  - `src/app/(auth)/login/actions.ts:29-39` ignores status.
  - `api/price-book/xlsx/route.ts:16-31`.
  - Actions with no status check: `comparison/actions.ts:32-47`, `dashboard/actions.ts:40-55`, `quick-calc/actions.ts:58-64`, `submissions/actions.ts:21-27`.
  - `reset-password/actions.ts:32-47`.
  - `calculator/page.tsx:79-84` and `quick-calc/page.tsx:28-33` check `is_internal` without status.
- **What is wrong:** suspension only flips `partners.status`. Supabase still signs the user in and refreshes their tokens with no time limit (ADR 0008).
  - The only enforcement is the (app) layout, which runs on page renders. Route handlers, server actions and REST never pass through it.
  - The layout's `signOut()` cookie write is silently dropped in a Server Component (`server.ts:15-25`). It works only because the default global sign-out revokes the session on the server, and the user can sign in again.
- **Paths a suspended user can take:**
  - (a) Sign in at `/login?next=/api/price-book/xlsx`. The action redirects straight to the route handler, no layout runs, and the current price book downloads.
  - (b) Call `requestComparisonQuote` directly. It creates a Pipedrive deal.
  - (c) Call `registerDealAction` (emails sales), `quickCalcPreview`, or the submissions status and delete actions directly.
  - (d) Use /forgot-password and then /reset-password. Both work for suspended users.
  - (e) Use REST with the publishable key. No policy checks status.
- **Impact:** an off-boarded partner keeps current pricing and can write CRM deals. A suspended internal user keeps the B1-S-3 cross-partner reads.
- **Proof of concept (local only):**
  1. Suspend a local test partner.
  2. Sign in via `/login?next=/api/price-book/xlsx` and watch the XLSX download.
  3. With that session, POST the comparison action ID taken from the client bundle.
- **Simplest fix:**
  - In `suspendPartner`, call `admin.auth.admin.updateUserById(id, { ban_duration: "876000h" })`. In `reactivatePartner`, pass `"none"`. This is a prebuilt Supabase feature, it runs inside the existing `requireAdmin` gate, and it adds no endpoint.
  - Ban first, then set status, and fail the action if the ban fails.
  - The current access token survives up to `jwt_expiry` (1 hour), so also use `requireActivePartner` (from B2-S-1) in the handlers and actions.
  - Ship together with B1-S-3's `status = 'active'` change.
- **Regression tests:** unit tests with a mocked client: suspend bans, reactivate unbans, and the XLSX route plus the three actions refuse a suspended caller. A live test-rls.ts case "suspended persona cannot sign in," which Andy runs.

#### B2-S-3: open redirect bypass in `isSafeNext` (PRIOR M-2, incomplete fix)
- **Severity:** Medium. **Verification:** VERIFIED.
- **Actor:** A. **Owner:** build session.
- **Location:** `src/lib/auth/safe-next.ts:7-14`. It is used at `login/actions.ts:38` and `auth/confirm/actions.ts:17-18, 35`.
- **What is wrong:** the check rejects only `//` and `://`. The values `/\evil.com` and `/<TAB>/evil.com` pass. Next 16.2.6 passes them through unchanged:
  - For a fetch action, the client router calls `new URL()` (`assign-location.js`). That treats `\` as `/` and strips tabs, finds an external origin, and does a hard navigation (`server-action-reducer.js:210-222`).
  - For a no-JS form post, the value goes out as the `Location` header (`action-handler.js:780`).
  - Checked with node: `new URL("/\\evil.com", "https://portal.arxys.com/login")` returns `https://evil.com/`.
- **Preconditions:** the victim opens `/login?next=/%5Cevil.com` while signed out (the proxy strips the query for signed-in visitors), then signs in.
- **Impact:** after a real sign-in on the real domain, the partner lands on an attacker page that can ask them to "sign in again."
- **Proof of concept (local only):** open `http://localhost:3000/login?next=/%5Cexample.com`, sign in, and the browser lands on example.com.
- **Simplest fix:** parse with `new URL(next, "http://n.invalid")`, require that origin, and reject any `\` or control character. Simpler still, allow-list the app's own path prefixes.
- **Regression test:** `isSafeNext` unit cases for `/\evil.com`, `/\t/evil.com`, `//x`, `https://x`, `/dashboard` and `/submissions/abc?x=1`.

#### B2-S-4: production secrets are scoped to Preview and Development on a public repo
- **Severity:** Medium. **Verification:** PLAUSIBLE.
- **Actor:** F, B. **Owner:** Andy.
- **Location:** RUNBOOK `:78` and `:327` apply all 10 keys, including the service-role key, Pipedrive token and SMTP password, to Production, Preview and Development. RUNBOOK §8b (Preview protected, Production protection off).
- **What is wrong:** preview builds run branch code against the production database, live Pipedrive and the sales mailbox. Deployment protection limits who can view a preview URL. It does not limit what the preview's code does with the keys.
  - If Git Fork Protection is off, a fork PR on this public repo can run attacker code with the service-role key.
  - If production protection covers only previews, old generated production URLs keep serving old code (for example pre-fix M-1 and M-2) with today's keys.
- **Impact:** RLS bypass, Pipedrive writes and email sent as Arxys, all from unreviewed code.
- **Simplest fix:**
  - Confirm Git Fork Protection is on.
  - Set Deployment Protection to Standard. That protects all generated URLs while portal.arxys.com stays public.
  - Remove `SUPABASE_SERVICE_ROLE_KEY`, `PIPEDRIVE_API_TOKEN` and `SMTP_PASS` from Preview and Development, or give Preview its own Supabase project and a Pipedrive sandbox.
  - Update RUNBOOK §2 and §11.
- **Regression test:** an env-scope table in the RUNBOOK, rechecked each baseline.

#### B2-S-5: Next 16.2.6 is five security releases behind
- **Severity:** Medium. **Verification:** VERIFIED for the version gap, PLAUSIBLE for exploitation.
- **Actor:** A, G. **Owner:** build session.
- **Location:** `package.json` (`"next": "16.2.6"`).
- **What is wrong:** missing releases: 16.2.11 (July), 16.3.3 (August 25), 16.3.6 (September 22), 16.3.8 (September 30) and 16.4.1 (October 14). Two advisories apply:
  - CVE-2026-64641 and GHSA-p3m5-59mp-jv5r (High): CPU denial of service through crafted Server Action requests. The `signIn` and `requestAccess` actions are reachable without an account.
  - CVE-2026-64643 (Medium): Server Action IDs are disclosed. That makes B2-S-2's direct action calls easier.
- **Not applicable here:**
  - CVE-2026-64642: no i18n config.
  - CVE-2026-64645: no rewrites or redirects.
  - CVE-2026-64649: Vercel pins the Host header.
  - The image-optimizer advisories: Vercel's managed optimizer, no `remotePatterns`.
  - The `use cache` RCE: no Cache Components.
  - The `next/og` RCE: not used.
  - The Windows RCE.
- **Likely not applicable, unverified:** CVE-2026-64647 and CVE-2026-64648, fetch cache confusion. Routes are dynamic and fetch is uncached by default.
- **Impact:** an anonymous visitor can drive up function cost and degrade availability, and server actions are easier to map.
- **Simplest fix:** upgrade to next 16.4.1 or later, with a matching eslint-config-next. Read `node_modules/next/dist/docs/01-app/02-guides/upgrading` first, then build, run tsc and run the tests. 16.2.11 covers the July batch only.
- **Regression test:** an `npm audit --omit=dev` CI gate or Dependabot alerts.

#### B2-S-6: no rate limiting on sign-in, reset and token verification
- **Severity:** Medium. **Verification:** PLAUSIBLE.
- **Actor:** A, G. **Owner:** Andy (Vercel Firewall), build session.
- **Location:** `login/actions.ts:16-40`, `forgot-password/actions.ts:14-39`, `auth/confirm/actions.ts:14-35`. `config.toml:199, 207` holds local values only.
- **What is wrong:** there is no rate limit or CAPTCHA on these three actions. All of them call Supabase Auth from the Vercel function, so Supabase's per-IP limits count Vercel's outbound IP, and nothing forwards the client IP.
- **Impact:**
  - Password guessing against partner accounts.
  - Floods of reset emails to known partner addresses. These use up the hourly auth-email budget and the shared Gmail quota (ADR 0025), which blocks real invites and resets.
  - Email enumeration through response timing, even though the messages are generic.
- **Simplest fix:** a prebuilt Vercel Firewall rate-limit rule on POST to `/login`, `/forgot-password` and `/auth/confirm`. Then consider Supabase CAPTCHA (Turnstile), which needs the token passed through the server calls.
- **Regression test:** record the firewall rule in the RUNBOOK.

#### B2-S-7: authorization rests on layouts that Next 16 can skip
- **Severity:** Medium. **Verification:** PLAUSIBLE.
- **Actor:** B, C. **Owner:** build session.
- **Location:** `admin/layout.tsx:12-13`. Five admin pages never deny on their own:
  - `admin/page.tsx:69`
  - `admin/partners/page.tsx:40`
  - `admin/requests/page.tsx:42` (the result is discarded)
  - `admin/submissions/page.tsx:91`
  - `admin/submissions/[id]/page.tsx` (no gate at all)

  `(app)/layout.tsx:24` is the suspend gate for every partner page.
- **What is wrong:** Next 16's authentication.md warns that layouts do not re-render on navigation. The client-sent `next-router-state-tree` header decides which segments the server renders (cdn-caching.md), so a crafted RSC request can render a page without its parent layout.
- **Impact today:** limited. Those pages read through RLS, and their service-role reads only return rows the caller already sees (see B2-S-10). Any future service-role read on an admin page becomes a leak, and a suspended user can render partner pages.
- **Simplest fix:** call the gate in each page and use its result (`if (!gate.ok) notFound()`), as the specs pages already do. Put the status check in the shared helper.
- **Regression test:** a CI grep that every `admin/**/page.tsx` branches on `gate.ok`.

#### B2-S-8: session cookies are script-readable, have no Secure flag and last 400 days
- **Severity:** Low. **Verification:** VERIFIED.
- **Actor:** C, E. **Owner:** build session.
- **Location:**
  - `src/lib/supabase/server.ts:7-29` and `proxy.ts:22-41` pass no `cookieOptions`.
  - `@supabase/ssr` `constants.js:4-11`: `httpOnly: false`, no `secure`, `maxAge` of 400 days.
  - `reset-password/actions.ts:32-42`.
  - `config.toml:228` (`secure_password_change = false`).
- **What is wrong:** page JavaScript can read the refresh token, there is no Secure flag, and the cookie lives 400 days. With no session time limit (ADR 0008) and no CSP, any future XSS or a malicious extension gets a token that never expires. Any session can also set a new password without the current one or a reauthentication step.
- **Simplest fix:** pass `cookieOptions: { httpOnly: true, secure: true, sameSite: "lax" }` to both server clients. The browser client is unused, so delete `browser.ts`. Turn on Secure password change.
- **Regression test:** a unit test on the cookie options.

#### B2-S-9: no security headers
- **Severity:** Low. **Verification:** VERIFIED.
- **Actor:** A. **Owner:** build session.
- **Location:** `next.config.ts:3-37` has no `headers()`. There is no `vercel.json`.
- **What is wrong:** no CSP, `frame-ancestors`, `X-Frame-Options`, nosniff, `Referrer-Policy` or `Permissions-Policy`. HSTS depends on Vercel defaults.
  - The partners admin page has one-click forms: Mark internal, Suspend, Reactivate.
  - SameSite=Lax keeps cross-site frames signed out. A same-site host (any `*.arxys.com` site, such as the marketing site) can still frame the portal with the admin's cookies.
- **Simplest fix:** add a `headers()` block in `next.config.ts` with:
  - `frame-ancestors 'none'`
  - nosniff
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - HSTS
  - a full CSP, first in Report-Only mode (see `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`)
- **Regression test:** a unit test on the `headers()` output.

#### B2-S-10: service-role name lookups trust a FK the partner can write
- **Severity:** Low. **Verification:** VERIFIED.
- **Actor:** B. **Owner:** build session.
- **Shares root cause with B1-S-2 and B1-S-13.**
- **Location:**
  - `submissions/page.tsx:102-114`
  - `dashboard/page.tsx:83-92`
  - `admin/submissions/page.tsx:307-315`
  - `admin/submissions/[id]/page.tsx:62-71`
  - `src/lib/pdf/render.ts:108-115`
  - `resend-notification-actions.ts:62-67`
- **What is wrong:** six service-role reads resolve `on_behalf_of_partner_id` to another partner's company name, contact name, and for resend, email. Their only guard is that the caller can see the row. A partner can set that FK on their own row over REST (B1-S-2), and partner ids are listable through B1-S-5 and B1-S-8.
- **Impact:** a partner learns other partners' company and contact names on My Pipeline, the dashboard and the PDF. If staff later press Resend on that row, the attacker's quote is emailed to the planted partner.
- **Simplest fix:** the B1-S-2 guard closes this. Until it lands, resolve names only when the row's creator is internal.
- **Regression test:** the B1-S-2 test-rls.ts case that a partner cannot set `on_behalf_of_partner_id`.

#### B2-S-11: internal users can create partner logins with no record of who invited them
- **Severity:** Low. **Verification:** VERIFIED.
- **Actor:** D. **Owner:** Andy decides, build session builds.
- **Location:** `admin/partners/actions.ts:61-69, 115-122`.
- **What is wrong:** `invitePartner` accepts any active internal user and records no inviter (no column, no audit; see B1-A-10). An internal user can create a working partner login for a personal address, and it survives their own suspension.
- **Impact:** price-book access can outlive staff off-boarding, and nobody can trace who created the account.
- **Simplest fix:** store `invited_by = gate.userId` and show it on /admin/partners. If you prefer, make invites admin-only instead.
- **Regression test:** a unit test that `invitePartner` writes the inviter.

#### B2-S-12: request-access abuse surface
- **Severity:** Low. **Verification:** VERIFIED.
- **Actor:** G. **Owner:** build session.
- **Location:** `login/request-access-actions.ts:53-56, 97-98, 139-148`. `admin/requests/page.tsx:45-49`.
- **What is wrong:**
  - The only bot control is a honeypot.
  - The "already have a request pending" reply tells anyone whether an email has a pending request.
  - Every anonymous submit runs a service-role `auth.admin.listUsers`, which amplifies cost.
  - The admin list loads all rows with no limit.
  - The IP throttle trusts the first `x-forwarded-for` entry. Vercel sets that header, so the throttle holds on Vercel but would be spoofable elsewhere.
  - The dedup race is B1-A-11 (KNOWN).
- **Simplest fix:**
  - Add Turnstile. This adds a third-party script and a CSP entry.
  - Return the normal success message for the pending case.
  - Compute `existing_user` on the authenticated admin page.
  - Paginate the admin list.
- **Regression test:** a unit test that the pending case returns the success message.

#### B2-S-13: login CSRF through /auth/confirm
- **Severity:** Low. **Verification:** PLAUSIBLE.
- **Actor:** B. **Owner:** build session.
- **Location:** `auth/confirm/page.tsx:33-76` and `actions.ts:14-35`.
- **What is wrong:** the confirm action verifies any token and replaces whatever session the browser holds. A partner can forward their own reset link to someone at another partner. The victim's click signs them into the attacker's account, and work they then save lands in the attacker's pipeline. The header showing the attacker's company is the only cue.
- **Simplest fix:** before verifying, if a different user is already signed in, refuse and show "this link is for another account."
- **Regression test:** a unit test with a mocked client.

### 5. KNOWN and PRIOR status

- **B1-S-3:** open. `is_internal()` is unchanged, and `suspendPartner` still sets status only. Slice 2 adds the app-layer paths in B2-S-2. The `is_internal` reads in the calculator and quick-calc pages also ignore status.
- **B1-A-11:** open. The count-then-insert race is at `request-access-actions.ts:88-157`.
- **B1-S-11:** open. The migration is unchanged, and the app writes `access_requests` only through the service role (`requests/actions.ts:31`, `partners/actions.ts:145`).
- **B1-S-12:** open. No app path writes `role`. `invitePartner` hard-codes `'partner'`, and admins come only from the bootstrap script. The admin-JWT REST path is still there.
- **B1-S-2, B1-S-13, B1-S-5, B1-S-8:** open. Together they feed B2-S-10.
- **Plan known issues:**
  - K-1 holds on every app write to `partners`. All such writes go through the service role (`admin/partners/actions.ts` and `(app)/layout.tsx:35`).
  - K-6: Andy deleted the test personas on 2026-10-19. That cannot be re-checked from here.
  - K-2 to K-5 and K-7 are outside Slice 2.
- **PRIOR M-1:** fixed. `dashboard/actions.ts:40-55` takes identity from the session and the database. It still has no status check (see B2-S-2).
- **PRIOR M-2:** partly fixed. `//` and `://` are blocked, but the bypass in B2-S-3 remains.
- **PRIOR L-5:** still in code (`admin/partners/actions.ts:50-59`, `forgot-password/actions.ts:23-30`). It is not exploitable as deployed, for two reasons: Next's server-action Origin-to-Host check pins Origin to the real host, and the repo templates build links from `{{ .SiteURL }}`. Fix it anyway with a constant site URL. Andy should confirm the live templates match the repo and drop the `*.vercel.app` redirect wildcard.
- **PRIOR L-6:** fixed. `admin/submissions/actions.ts:26-38` now requires `status === "active"`.
- **PRIOR I-1:** unchanged and by design. Internal users see every user's email on /admin/partners. The calculator and quick-calc pages also give them every active partner's email.

### 6. Claims verified or refuted

1. **"Signup is invite-only":** unverified and probably false at the platform layer. The app has no sign-up UI (VERIFIED). The committed config enables sign-up, the RUNBOOK never disables it, and the app fails open for any Auth user (B2-S-1).
2. **"A suspended user cannot use the app":** refuted (B2-S-2).
3. **"Only admins can invite users or change roles":** refuted for invites, since internal users can invite partners (B2-S-11). Confirmed for `is_internal` (only `requireAdmin` paths change it) and for `role` (no app path changes it). An admin JWT can still change `role` over REST (B1-S-12).
4. **"safe-next.ts prevents open redirects":** refuted (B2-S-3).
5. **"The service-role key never reaches the browser bundle":** confirmed at source level.
   - The key is read only through `env.ts` with a dynamic `process.env[name]`, which Next does not inline into client code.
   - `admin.ts` imports `server-only`.
   - No `"use client"` file imports env or any Supabase module.
   - I did not inspect a built bundle.
   - Caveat: the key is present in Preview and Development (B2-S-4).
   - `env.ts` itself lacks `server-only`, but there is no reachable leak because of the dynamic read.

### 7. Framework advisory note

- **CVE-2025-29927:** does not apply. Next 16.2.6 contains no `x-middleware-subrequest` handling at all (grep of the dist found nothing). The May 2026 middleware fixes are included in 16.2.6.
- **Next.js:** see B2-S-5 for the missing releases and which advisories apply.
- **@supabase/ssr 0.10.3:** no advisory found.
- **@supabase/supabase-js and auth-js 2.105.4:** the only auth-js CVE found (CVE-2025-48370, May 2025) predates this version by many releases. CVE-2026-31813 is in the hosted Auth server's Apple and Azure token handling, and the portal uses no OAuth providers.
- **Caveat:** I did not run npm audit. Confirm with it.
- **Sources:**
  - [Next.js July 2026 security release](https://nextjs.org/blog/july-2026-security-release)
  - [GitLab advisory CVE-2026-64642](https://advisories.gitlab.com/npm/next/CVE-2026-64642/)
  - [Vercel August 2026 changelog](https://vercel.com/changelog/nextjs-august-2026-security-release)
  - [Next.js September 22 2026 update](https://nextjs.org/blog/nextjs-security-update-september-22-2026)
  - [Next.js September 2026 security release](https://nextjs.org/blog/september-2026-security-release)
  - [Next.js October 14 2026 update](https://nextjs.org/blog/nextjs-security-update-october-14-2026)
  - [next-16.2.6 vulnerability list](https://github.com/ibm-skills-network/mark/issues/399)
  - [Teramont August summary](https://teramont.net/blog/nextjs-16-3-3-15-5-24-critical-rce)

### 8. Challenges to ADRs

- **ADR 0010.** Invite-only is enforced only by the missing /signup page. The Supabase sign-up setting is undocumented, and the app authorizes any Auth user. Record "sign-ups disabled" as an explicit control, and fail closed in code.
- **ADR 0021.** Two of its premises fail.
  - "signOut drops the cookie": the write is dropped in a Server Component. The redirect loop is avoided only because the global sign-out revokes the session on the server.
  - "Coverage is everything under (app)": server actions, route handlers and REST bypass the layout, and the Next 16 docs say layouts can be skipped on navigation. The accepted risk has grown from one PDF route to the price-book XLSX route plus three actions.
  - Supersede it with ban-on-suspend plus a shared fail-closed helper.
- **ADR 0008.** Its revisit trigger 3 ("a security review flags it") has fired. 400-day, script-readable cookies make the missing session timebox matter.

### 9. Andy action items

**Read only:**
1. Run `curl -s -H "apikey: <publishable key>" https://<ref>.supabase.co/auth/v1/settings`. `disable_signup` must be `true`. `mailer_autoconfirm: true` means email confirmation is off.
2. In the SQL editor, look for Auth users with no partners row:
   ```sql
   select u.id, u.email, u.created_at, u.last_sign_in_at
   from auth.users u
   left join public.partners p on p.id = u.id
   where p.id is null;
   ```
   Any row not explained by a failed invite is a self-registered account. Review before deleting.
3. Look for suspended users who signed in after suspension:
   ```sql
   select p.id, p.company_name, u.last_sign_in_at, u.banned_until
   from public.partners p
   join auth.users u on u.id = p.id
   where p.status = 'suspended';
   ```
   A sign-in after the suspension date means B2-S-2 was used.
4. Confirm the four live email templates match `docs/email-templates`: `SiteURL` plus `TokenHash`, with no `ConfirmationURL` or `RedirectTo`.

**Dashboard writes (your call):**
- Supabase: sign-ups off; Secure password change on; minimum password length at least 8 (the repo's local value is 6, the app enforces 8); remove `https://*.vercel.app/**` from Redirect URLs; switch Auth DB connections from 10 absolute to percentage-based.
- Vercel:
  - Git Fork Protection on.
  - Deployment Protection set to Standard.
  - Remove production secrets from Preview and Development.
  - Add a Firewall rate-limit rule on the three auth POST paths.
- No key rotation is needed. No secret was found.

**Dashboard settings to confirm:**
- **Supabase Auth:**
  - Sign-up, anonymous sign-ins, Confirm email, manual linking, external providers.
  - Password minimum and character requirements, leaked-password protection (on since 2026-10-19), Secure password change.
  - Site URL `https://portal.arxys.com` and the redirect list.
  - JWT expiry (3600 in the repo), refresh rotation and reuse interval, timebox and inactivity timeout, plan tier.
  - Auth rate limits and CAPTCHA.
  - SMTP sender and templates.
  - Auth DB connection cap.
  - MFA for admins (optional).
  - Users count against partner rows.
- **Vercel:**
  - Deployment Protection per environment, and whether old generated production URLs are reachable without logging in.
  - Bypass tokens.
  - Git Fork Protection.
  - Which of the 10 keys exist in each environment, with the Sensitive flag on the service-role key, Pipedrive token and SMTP password.
  - Firewall and WAF rules.
  - The HSTS header on portal.arxys.com.

### 10. Not checked

- Live dashboard settings (all of section 9).
- A built client bundle (no build was run).
- npm audit.
- Runtime proofs of concept. The RSC partial-render bypass was not reproduced.
- Hosted Supabase behavior, which I took from my knowledge of Supabase:
  - `getUser` returning session-not-found after a global sign-out
  - ban semantics
  - whether a password change revokes other sessions
- Vercel header and `x-forwarded-for` behavior.
- Whether Vercel Analytics records the `token_hash` query string from `/auth/confirm` URLs.
- Route-handler and action business logic beyond auth and status (Slice 3), Pipedrive (Slice 4), email and PDF content (Slice 5), and the scripts (Slice 8).

### Appendix A: service-role inventory

**Factory:** `src/lib/supabase/admin.ts:5`. It imports `server-only`, and the key comes from the `env.ts` getter.

**Internal users and admins:**

| Call site | Purpose | Guard |
|---|---|---|
| `admin/partners/actions.ts:95` | `invitePartner` (invite, partners insert, request conversion) | `requireAdminOrInternal`. `is_internal` forced false for non-admins. `role` hard-coded `'partner'`. |
| `admin/partners/actions.ts:185, 230, 250, 322, 353, 413, 440` | suspend, reactivate, resend, name fields, logo, Pipedrive id, internal flag | local `requireAdmin` (active admin) |
| `admin/partners/page.tsx:62` | `listUsers` email join | layout only. Emails are joined only to RLS-visible rows, so nothing leaks today. |
| `admin/requests/actions.ts:31` | reject request | `requireAdminOrInternal` |
| `admin/submissions/actions.ts:125` | relink | `requireAdminOrInternal` |
| `admin/submissions/[id]/resend-notification-actions.ts:44` | resend notification | `requireAdminOrInternal`. Recipient comes from the FK (B2-S-10). |
| `calculator/actions.ts:187` | on-behalf target validation, `getUserById` | `getUser`, status active, `is_internal` |
| `calculator/page.tsx:85` and `quick-calc/page.tsx:34` | partner list plus all emails | `is_internal` without status (B2-S-2) |

**Partners:**

| Call site | Purpose | Guard |
|---|---|---|
| `(app)/layout.tsx:35` | invited-to-active flip | own id, status `invited` |
| `admin/submissions/page.tsx:308`, `admin/submissions/[id]/page.tsx:64`, `dashboard/page.tsx:84`, `submissions/page.tsx:105`, `lib/pdf/render.ts:110` | on-behalf name lookup | row visible under RLS, keyed on a FK the partner can write (B2-S-10) |

**Anonymous:**

| Call site | Purpose | Guard |
|---|---|---|
| `login/request-access-actions.ts:83` | request-access intake | honeypot, zod, IP and email throttle, then `listUsers` and insert (B2-S-12) |

### Appendix B: role-check sites

**Shared helpers:**
- `requireAdminOrInternal` (`src/lib/auth/require-admin-or-internal.ts`): checks active plus admin or internal. Used by the admin layout and pages, the requests, projects and admin-submissions actions, and the resend and relink actions.
- `requireDatasheetAccess` (`src/lib/datasheet/guard.ts`): checks active.

**Four local copies of `requireAdmin`:** `admin/partners`, `admin/submissions`, `admin/specs` and `admin/appliance-specs`. The first two check active. For the last two I only scanned the gate lines.

**Inline checks:**
- forecast XLSX route: admin and active
- admin project-quote PDF route: active, and admin or internal
- partner project-quote PDF route: active
- `submitCalculation`: active and internal

**Display-only reads without a status check:** the calculator, quick-calc and admin submission-detail pages read `is_internal`, and the dashboard reads `isAdmin`.

**Informational:**
- `PUBLIC_PATHS` still lists `/auth/callback`, which no longer exists, and matches by prefix.
- The proxy matcher skips any path ending in an image extension. Every route handler and page re-checks the user, so this is not exploitable.
- Server actions can be POSTed to the public /login path. All 18 non-logout action files check the user themselves.

# Appendix C: Architect reviewer report (architect-review, high)

Verbatim. The ranked table above is the merged view.


## Architect review: Slice 2 (auth and app shell), baseline

### 1. Header

- **Mode:** area. **Scope:** every file listed in `slice2-scope.md`. **Commit:** `6cbdf58` in worktree `/Users/andynewbom/Developer/Arxys Portal/.claude/worktrees/group-1-audit`. Its source matches main `2ae9350`.
- **Traced outside scope (read only):**
  - The other auth-guard sites: every `getUser` caller in `src`, including the route handlers under `api/**`. I read them only for the role-check inventory and for the claims below.
  - `src/lib/errors/safe-message.ts`
  - `docs/email-templates/*.html`
  - `supabase/migrations/20261016000001_partners_guard_self_update.sql` and `20260605000004_fix_partners_internal_recursion.sql`
  - `AUDIT-01-security.md`
  - The `@supabase/ssr` and `auth-js` type docs in `node_modules`
  - Next 16 docs: `proxy.md`, `authentication.md`, `environment-variables.md`
- **ADRs read:** 0005, 0008, 0009, 0010, 0021, 0022, 0025, 0051, 0070, 0077. Also read: AGENTS.md, docs/README.md, BASELINE-PLAN.md (Slice 2 section and Known issues), BASELINE-BACKLOG.md (all rows and Andy's decisions), RUNBOOK §2 and §8, and the JOURNAL lines on user counts.
- **Versions installed:** `next` 16.2.6, `@supabase/ssr` 0.10.3, `@supabase/supabase-js` and `auth-js` 2.105.4, `react` 19.2.4.
- **Checks run:**
  - `tsc --noEmit`: exit 0.
  - No tests exist for `isSafeNext`, `requireAdminOrInternal` or the proxy, so none were run.
  - Lint, build and unit tests were not run.

### 2. Verdict

**PASS WITH NOTES.** There is no Must fix. Three Should fix items have near-term consequences for partners:
- B2-A-3: onboarding fails silently for breached passwords now that leaked-password protection is on.
- B2-A-2: suspension does not stop server actions.
- B2-A-4: users with no `partners` row are let in. This depends on a dashboard setting.

### 3. Plain-language summary

Suspending a partner only changes a label that one screen checks. A suspended partner who keeps the tab open, or uses a script, can still create Pipedrive comparison deals, send deal-registration emails and download the price book, until they happen to reload a page.

Since leaked-password protection was turned on today, a new partner who picks a breached password is told "Something went wrong" with no reason. That is the same onboarding stall ADR 0051 fixed once already.

The rule for "who is staff, admin or active" is written out separately in 16 places with four different meanings. Every change to it has to be made 16 times.

The repo's Supabase auth config is the untouched CLI default. It says signups are open and the site URL is localhost. If production signups really are open, strangers can get in, and one wrong CLI command would point every invite link at localhost.

### 4. Pre-mortem

**Three likely incident causes (90 days out):**

1. A partner who left a reseller is suspended but keeps registering deals and creating Pipedrive comparison deals for days. Suspension never touches the Auth session, and only the `(app)` layout checks status.
2. Invitees stall on "Create your password". Leaked-password protection rejects their choice and the action shows a generic error.
3. Project Portal adds contact logins and the portal passes 200 Auth users. Four copies of `listUsers({ perPage: 200 })` then silently drop emails, so on-behalf deals attach to the org only and existing-user flags read false. Meanwhile each admin page makes 4 Auth calls against a 10-connection Auth pool.

**Assumptions:**

| Assumption | Status |
|---|---|
| Production "Allow new users to sign up" is off | UNVERIFIED. `config.toml:176, 221` say on, and RUNBOOK §8 is silent. |
| Live email templates match `docs/email-templates` (built from `{{ .SiteURL }}`) | UNVERIFIED |
| Fewer than 200 Auth users | UNVERIFIED. JOURNAL shows 68 linked external logins, plus staff. |
| Layouts do not re-render on client navigation in this Next version | VERIFIED (`authentication.md:1350`, glossary:113) |
| Server actions run without the layout gate | VERIFIED (`proxy.md:213`, plus code structure) |
| Supabase returns `weak_password` for a breached password | UNVERIFIED (vendor behavior) |
| `dbError` hides every message | VERIFIED |
| The project uses asymmetric JWT signing keys, so `getClaims()` verifies locally | UNVERIFIED |
| A ban stops refresh within the 1-hour JWT TTL | UNVERIFIED (vendor behavior) |

### 5. Findings

#### Should fix

**B2-A-1. Should fix. VERIFIED. Owner: build session.** Role and status checks: one helper and 15 other places, with four different definitions.

- **Locations:**
  - **Shared helper:** `src/lib/auth/require-admin-or-internal.ts:16`, with 24 call sites in 21 files.
  - **Identical wrappers:** `admin/specs/actions.ts:42` and `admin/appliance-specs/actions.ts:37`.
  - **Independent copies (9):** `admin/partners/actions.ts:28`, `admin/submissions/actions.ts:26`, `admin/submissions/[id]/project-quote-actions.ts:51`, `api/admin/forecast/xlsx/route.ts:30`, `api/admin/submissions/[id]/project-quote/pdf/route.ts:33`, `api/submissions/[id]/project-quote/pdf/route.ts:45`, `lib/datasheet/guard.ts:30`, `calculator/actions.ts:168`, `(app)/layout.tsx:18`.
  - **Role reads with no status check (4):** `calculator/page.tsx:80`, `quick-calc/page.tsx:25`, `admin/submissions/[id]/page.tsx:96`, `dashboard/page.tsx:36`.
  - **Session-only entry points with no status check (8):** `comparison/actions.ts:35`, `dashboard/actions.ts:43`, `submissions/actions.ts:25`, `quick-calc/actions.ts:61`, `api/price-book/xlsx/route.ts:20`, `api/comparison/pdf/route.ts:48`, `api/submissions/[id]/pdf/route.ts:22`, `calculator/actions.ts:804`.
- **Evidence: the definitions differ.**
  - "staff = active and (admin or internal)": the helper, the project-quote action and the two project-quote routes.
  - "admin = active and admin": `partners/actions`, `admin/submissions/actions`, forecast xlsx, and the two wrappers.
  - "active only": the datasheet guard and calculator submit.
  - "internal regardless of status": the four page reads.
  - A missing `partners` row fails closed in the helper and the guard, and fails open in the layout and the pages.
- **How it fails:**
  - Andy's decision 4 adds SQL `is_staff()` and `is_admin()`, but the app keeps 16 hand-written versions that already disagree.
  - Example: a suspended internal user who reaches `/calculator` by client navigation gets the full partner list with emails. It comes from the service-role client at `calculator/page.tsx:83-99`, which checks `is_internal` only.
- **Simplest fix:**
  - Add `src/lib/auth/viewer.ts` (`import "server-only"`).
  - `getViewer = cache(async () => …)` returns `{ user, partner }`, or null when there is no user or no row.
  - Pure predicates match the SQL from decision 4: `isActive(v)` is `status === 'active'`; `isStaff(v)` is active and (`role === 'admin'` or `is_internal`); `isAdmin(v)` is active and `role === 'admin'`.
  - Add `requireActive()`, `requireStaff()` and `requireAdmin()` with one result shape.
  - Rename `requireAdminOrInternal` to `requireStaff`.
  - Delete the two wrappers, the two local `requireAdmin` copies and the 5 inline copies (the layout and calculator-action reads move onto `getViewer`).
  - Unit-test the predicates for each status and for a missing row.
  - Land it with the SQL helper migration so both sides use the same words.

**B2-A-2. Should fix. VERIFIED. Owner: build session.** The suspend gate only covers full page loads (refutes claim 2).

- **Locations:** `(app)/layout.tsx:24-29`. `admin/partners/actions.ts:211-214` writes only `partners.status`. Entry points without a status check are listed in B2-A-1, including `comparison/actions.ts:70` (Pipedrive deal) and `:92` (email), and `dashboard/actions.ts:43` (deal-registration email).
- **Evidence:**
  - Next docs: layouts "don't re-render on navigation" (`authentication.md:1350`).
  - Server functions are POSTs to the route, and the docs say to authorize inside each one (`proxy.md:213-215`).
  - Suspension leaves the Auth session alone, and refresh tokens have no timebox (ADR 0008).
- **How it fails:** Andy suspends a partner whose tab is open. Client navigations re-render only pages. The partner submits a comparison quote, which creates a Pipedrive deal and emails sales, registers a deal, changes quote statuses and downloads the price book XLSX. A scripted client keeps working as long as the refresh token lasts.
- **Simplest fix:**
  - In `suspendPartner`, call `auth.admin.updateUserById(id, { ban_duration: "876000h" })`. `reactivatePartner` sets `"none"`. This is the ban already listed in B1-S-3.
  - Call `requireActive()` (B2-A-1) at the top of every action and route.
  - Supersede ADR 0021 with a note: the layout gives the user a clear message, and the gate is the ban plus the per-entry check.

**B2-A-3. Should fix. VERIFIED in code, PLAUSIBLE vendor code. Owner: build session.** Auth actions throw away Supabase error codes.

- **Locations:** `(auth)/reset-password/actions.ts:43-45` through `lib/errors/safe-message.ts:3`; `(auth)/login/actions.ts:34-36`; `admin/partners/actions.ts:104` (a regex on English message text).
- **How it fails:**
  - Leaked-password protection was turned on 2026-10-19. An invitee on "Create your password" picks a breached password. Supabase refuses with `weak_password`, and the page shows the generic "Something went wrong" message. They retry the same password and get stuck.
  - The same happens with `same_password`, or with any dashboard password rule stricter than the form's 8-character check.
  - Login turns `over_request_rate_limit` and `email_not_confirmed` into "Invalid email or password". That sends people to reset a password that works.
  - The invite flow detects an existing user by matching message text when `error.code` (`email_exists`, `user_already_exists`) is available.
- **Simplest fix:**
  - Add one `mapAuthError(error)` in `src/lib/auth/` that switches on `error.code`.
  - Give plain messages for `weak_password`, `same_password`, the two rate limits and the existing-user codes.
  - Fall back to `dbError`.
  - Keep the generic login message for `invalid_credentials`, so it does not reveal which emails exist.

**B2-A-4. Should fix (Must fix if production signups are on). PLAUSIBLE. Owners: build session and Andy.** A user with no `partners` row gets into the app.

- **Locations:**
  - `(app)/layout.tsx:18-49`: a null `partner` renders the app with `hasPartner=false`.
  - `dashboard/page.tsx:33` and `api/price-book/xlsx/route.ts:20` check the session only.
  - Sources of row-less users:
    - `supabase/config.toml:176, 221` set `enable_signup = true`. Production is unknown, and RUNBOOK §8 never says to turn signups off.
    - The invite rollback at `admin/partners/actions.ts:123-131` only logs a failed `deleteUser`, which leaves an Auth user with no row.
- **How it fails:** if signups are on in production, anyone can call `/auth/v1/signup` with the public anon key, sign in, and get the portal shell. The price book and its XLSX answer to any signed-in user. Meanwhile the helper and the datasheet guard already refuse a missing row, so the app does both.
- **Simplest fix:**
  - `getViewer()` returns null for a missing row.
  - The layout then signs out and redirects, the same way it handles a suspended user.
  - Andy confirms signups are off.
  - Security review should own the exposure analysis.

**B2-A-5. Should fix. VERIFIED counts, PLAUSIBLE impact. Owners: build session; Andy for the signing-key check.** Each request repeats the auth lookups and nothing caches them.

- **Locations:** `lib/supabase/proxy.ts:47`, `(app)/layout.tsx:13, 18, 56`, `admin/layout.tsx:12, 18`, `admin/partners/page.tsx:40, 43, 91, 103`.
- **Evidence: one full load of `/admin/partners` makes:**
  - 4 Auth-server `getUser` calls (proxy, app layout, admin layout, page);
  - 3 reads of the user's own `partners` row;
  - 2 identical pending `access_requests` counts;
  - 3 reads of the `partners` table, plus `listUsers`.
  - Nothing in `src` uses React `cache()`.
  - The proxy also calls `getUser` on public paths and on every navigation and prefetch it matches.
- **How it fails:** Andy's Performance Advisor run showed Auth capped at 10 DB connections. Every `getUser` is a round trip to that Auth server. Latency and connection pressure grow with users and links, and the Project Portal adds both.
- **Simplest fix:**
  - Use the `cache()`-wrapped `getViewer()` (B2-A-1) in layouts and pages.
  - Wrap the pending count in a cached helper so the two layouts share one query.
  - In the proxy, switch to `getClaims()` if the project uses asymmetric signing keys. The proxy only refreshes the session and does an early redirect.
  - Keep `getUser` (through `getViewer`) for authorization in server code.

**B2-A-6. Should fix. VERIFIED in code, PLAUSIBLE timing. Owner: build session.** The email join is copied four times with a silent 200-user cap.

- **Locations:** `admin/partners/page.tsx:64`, `calculator/page.tsx:99`, `quick-calc/page.tsx:42`, `(auth)/login/request-access-actions.ts:139`. `scripts/sync-pipedrive-companies.mts:93` already paginates correctly.
- **How it fails:** above 200 Auth users:
  - the on-behalf picker loses target emails, so deals attach to the org only;
  - the partners list shows blank emails;
  - access requests from existing users are flagged `existing_user = false`.
  - No error appears anywhere.
  - Today there are 68 linked external logins plus staff, and Project Portal will add contact logins.
- **Simplest fix:** add one paginating `listAuthEmails()` in `src/lib/supabase/` (server-only) and delete the four copies. Request access only needs a lookup by email, so it should not page through every user.

**B2-A-7. Should fix. VERIFIED content, PLAUSIBLE push risk. Owners: build session; Andy supplies the values.** `supabase/config.toml` `[auth]` is the CLI default and contradicts production and ADR 0010.

- **Location:** `supabase/config.toml:150-234`:
  - `site_url = "http://127.0.0.1:3000"` (:154)
  - `enable_signup = true` (:176, :221)
  - `minimum_password_length = 6` (:182)
  - `email_sent = 2` (:199)
  - `enable_confirmations = false` (:226)
  - no SMTP or template sections
- **How it fails:**
  - Running `supabase config push` would write these values to production. Every branded invite and reset link is built from `{{ .SiteURL }}`, so all of them would point at localhost. Signups would reopen.
  - Locally, `supabase start` gives an auth stack that behaves differently from production.
  - B1-A-15 found the `[db.seed]` drift in the same file.
- **Simplest fix:** make `[auth]` match production (site URL and redirects from RUNBOOK §8, signups off, password rules, rate limits) and treat it as the record. Failing that, add a header saying "local only, never `config push`" and record the production settings in RUNBOOK §8.

**B2-A-8. Should fix. VERIFIED in repo, PLAUSIBLE live. Owner: build session.** The `redirectTo` built from request headers is never used.

- **Locations:** `(auth)/forgot-password/actions.ts:23-29`; `admin/partners/actions.ts:50-59, 96, 275`.
- **Evidence:** `docs/email-templates/invite.html:39` and `reset-password.html:36` build the link from `{{ .SiteURL }}` with a hard-coded `next`. No template uses `{{ .RedirectTo }}`, and ADR 0025 names the repo templates as canonical.
- **How it fails:**
  - Two code paths build an origin from the Origin/Host headers, with different fallbacks, and the email never uses it.
  - AUDIT-01 L-5 is tracked against this dead code.
  - A test invite sent from a preview deployment lands the invitee on production, so preview cannot test onboarding end to end.
- **Simplest fix:** delete `inviteRedirectUrl` and the origin block, and call both Supabase methods without `redirectTo`. Close L-5 once Andy confirms the live templates match the repo.

#### Consider

**B2-A-9. Consider. VERIFIED. Owner: build session.** Dead code and stale flags.

- `lib/supabase/browser.ts` has no callers. It would also throw in a browser, because `env.ts:27` reads `process.env[name]` dynamically and Next does not inline dynamic lookups (`environment-variables.md:182`).
- `PUBLIC_PATHS` lists `"/auth/callback"` (`lib/supabase/proxy.ts:9`), and no such route exists.
- `admin/requests/page.tsx:42` calls `await requireAdminOrInternal()` and throws the result away.
- The "before the migration lands" fallback queries at `admin/partners/page.tsx:91, 103` and `dashboard/page.tsx:48-52` are stale. Both columns exist: `calculator/actions.ts:170` reads `pipedrive_user_id` on every submit.
- `src/app/page.tsx` repeats a check the proxy could make. `proxy.ts:52` lets unauthenticated `/` through only for the page to call `getUser` again.
- **Fix:** delete all of these, and add the unauthenticated `/` redirect to the proxy.

**B2-A-10. Consider. VERIFIED code, PLAUSIBLE effect. Owner: build session.** The proxy departs from `@supabase/ssr` 0.10.3 guidance.

- `lib/supabase/proxy.ts:30` ignores the `headers` argument of `setAll`. That argument carries `Cache-Control: private, no-store` (`@supabase/ssr` `types.d.ts:20-43`).
- The redirects at `:52-63` build new responses that drop cookies `setAll` set or cleared. A cleared session cookie survives the redirect to `/login`, so later requests keep retrying a dead refresh token against the per-IP `token_refresh` limit, which colleagues behind one company IP share.
- **Fix:** copy the headers in `setAll` and copy `response.cookies` onto both redirect responses. Hand the caching question to security.

**B2-A-11. Consider. PLAUSIBLE. Owner: build session.** A database write runs while the layout renders (ADR 0022).

- **Location:** `(app)/layout.tsx:31-43` runs a service-role UPDATE inside a Server Component render.
- **How it fails:** nested layouts and pages render alongside it. On an invited internal user's first `/admin` load, the admin gate can read `invited` and return 404.
- **Fix:** flip `invited` to `active` in `updatePassword` after a successful `updateUser`. That is the moment the user has actually onboarded, and it removes the service-role client from the layout.

**B2-A-12. Consider. VERIFIED. Owner: build session.** The service-role client is used five times just to read partner names.

- **Locations:** `submissions/page.tsx:105`, `admin/submissions/page.tsx:308`, `dashboard/page.tsx:84`, `lib/pdf/render.ts:110`, `admin/submissions/[id]/page.tsx:63`. The two pickers do the same.
- **Fix:** one server-only `loadPartnerNames(ids)` that selects only `id, company_name, contact_name`. It shrinks the service-role inventory (24 call sites in 17 files) and the review surface.

**B2-A-13. Consider. VERIFIED. Owner: build session.** Environment config has no single inventory (refutes claim 3).

- `lib/pipedrive/lookups.ts:118` reads `PIPEDRIVE_DEAL_OWNER_ID` directly, because `env.ts` has no path for optional variables.
- RUNBOOK §2 is the only list of env vars, and it omits that variable.
- `.gitignore`'s `.env*` would also ignore a future `.env.example`.
- Four scripts accept undocumented alternate names `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` (Slice 8 owns scripts).
- **Fix:** add `optional(name)` to `env.ts`, add `!.env.example` to `.gitignore`, and commit an example generated from `REQUIRED_VARS`.
- A `vercel.json` is not needed. Nothing requires one, and `next.config.ts` handles file tracing.

### Known-issue status (KNOWN and PRIOR)

**Backlog rows:**

| Row | Status |
|---|---|
| B1-S-3 / B1-A-6 | Open. On the app side, suspension still only writes `partners.status` (`admin/partners/actions.ts:211`) and does not ban. This feeds B2-A-1 and B2-A-2. |
| B1-S-8 | Open (database side). |
| B1-A-11 | Open. `request-access-actions.ts:88-157` still counts and then inserts, and lowercases only in app code (`:77`). |
| B1-S-11 | Open. Every `access_requests` write in `src` uses the service role (`request-access-actions.ts:151`, `requests/actions.ts:31`, `partners/actions.ts:145`), so revoking authenticated UPDATE breaks no app path (VERIFIED). |
| B1-S-12 | Open. The app's last-admin guard (`partners/actions.ts:195-209`) checks and then updates, so it can also race between two admins. |
| K-1 (ADR 0151) | Holds for this slice. Every `partners` write here uses the service role: `layout.tsx:35` and 8 sites in `partners/actions.ts`. |
| K-6 | The backlog's Known-issues table still says "Still present", while Andy's 2026-10-19 table says the 16 personas, including "RLS Hijack Co", were deleted. The backlog contradicts itself. |
| B1-A-1/B1-S-2, K-2 to K-5, K-7 | Outside this slice. Nothing in scope changes them. |

**AUDIT-01 (PRIOR):**

| Item | Status |
|---|---|
| M-1 | Fixed. `dashboard/actions.ts:41-60` now takes the identity from the session and the `partners` row. It still has no status check (B2-A-2). |
| M-2 | Fixed for `//` and `://` (`safe-next.ts:7-13`, used at `login/actions.ts:38` and `auth/confirm/actions.ts:18`). The backslash form `/\evil.com` is not rejected and has no test. Security should verify how browsers handle it. |
| L-5 | Still in the code, but likely moot because the templates ignore `redirectTo` (B2-A-8). |
| L-6 | Fixed (`admin/submissions/actions.ts:37`). |
| I-1 | Still by design, and wider than before: `calculator/page.tsx:99` and `quick-calc/page.tsx:42` also show internal users every active partner's email, gated on `is_internal` without a status check. |

### 6. Claims checked

1. **"Next 16 `proxy.ts` replaces middleware and runs on every app route" (ADR 0009): VERIFIED, with qualifications.**
   - `middleware` is deprecated (`proxy.md:11`). The proxy runs on Node by default (`:219`), and `src/proxy.ts` exports `proxy`.
   - The matcher covers pages, `/api/**` route handlers and server-action POSTs. It skips `_next/static`, `_next/image`, `favicon.ico` and any path ending in `.svg/.png/.jpg/.jpeg/.gif/.webp`, which includes a dynamic route whose parameter ends that way.
   - The proxy checks sign-in only, not role or status.
   - Unauthenticated API calls get a 307 to `/login`, so the routes' own 401 branches (for example `datasheet/guard.ts`, "a 401 the client can act on") never run for them.
2. **"The suspend gate lives in the app layout and covers the whole app" (ADR 0021): REFUTED.** The layout runs on full page loads of `(app)` routes only. It does not run on client navigations, server actions, or any of the 7 route handlers (ADR 0021 only acknowledged the PDF route).
3. **"All env access goes through `src/lib/env.ts`": REFUTED.** `lib/pipedrive/lookups.ts:118` reads `process.env` directly, tests set variables directly, and 4 scripts read `process.env` with alternate names.

**Other claims:**

| Claim | Result |
|---|---|
| ADR 0005: three thin Supabase helpers | VERIFIED. `browser.ts` is unused and would fail in a browser. |
| ADR 0025: `src/app/auth/confirm/route.ts` | REFUTED. Replaced by `(auth)/auth/confirm/page.tsx` and `actions.ts` under ADR 0051, and 0025 was never annotated. |
| ADR 0010: no public signup | NOT CHECKED in production. The repo config says signups are on. |
| ADR 0077: the server action is the only write path for access requests | VERIFIED in `src`. |
| `server.ts:21-24` comment: the proxy refreshes the session on every request | VERIFIED for matched paths. |
| `calculator/actions.ts:163` comment: the layout keeps suspended partners away from the calculator UI | Partly REFUTED (client navigation). |
| `guard.ts:21` comment: "the same line the (app) layout draws" | REFUTED. The layout blocks only `suspended` and lets in a user with no `partners` row, while the guard requires `active`. |

### 7. Complexity to remove

- `browser.ts`, `"/auth/callback"`, `inviteRedirectUrl` and the forgot-password origin block, the discarded gate in `requests/page.tsx`, three stale fallback queries, and the duplicate pending count in the admin layout.
- 2 wrappers plus 9 independent role and status checks: replace with `viewer.ts`.
- 4 copies of `listUsers({ perPage: 200 })`: replace with one helper.
- 5 service-role name lookups: replace with one helper.

### 8. Challenges to ADRs

- **0021:** the evidence in B2-A-2 shows the layout is a user-facing message only and does not gate access. Propose superseding it with "ban on suspend plus `requireActive()` in every entry point".
- **0022:** the activation write runs during render. Propose moving it to `updatePassword` (B2-A-11).
- **0025:** the route path it names is stale. Its `redirectTo` premise is moot because the templates use `{{ .SiteURL }}`.
- **0010:** the repo config contradicts it (B2-A-7).

### 9. Andy action items

1. **Supabase → Authentication → Sign In / Providers:** confirm "Allow new users to sign up" is **off**. If it is on, tell security review now (B2-A-4).
2. **Confirm the four live email templates build their links from `{{ .SiteURL }}`** like `docs/email-templates` (B2-A-8, L-5).
3. **Check JWT signing keys:** asymmetric, or legacy HS256 (B2-A-5)?
4. **Report the dashboard password rules** (minimum length and character requirements) and the **Email OTP expiration**. Invite and recovery links probably share that expiration. The local config uses 3600 seconds, which would mean one-hour invite links.
5. **Report the total Auth user count** against 200 (B2-A-6).
6. **Do not run `supabase config push`** until B2-A-7 is fixed.
7. **Confirm suspension should end access immediately.** The ban is the fix, and B1-S-3 already lists it.

### 10. What I did not review

- **Live settings:** the Supabase and Vercel dashboards (auth settings, env scoping, deployment protection, live templates). I cannot see them.
- **Vendor behavior I did not test:**
  - whether a ban makes `getUser` fail or only blocks refresh;
  - the exact `weak_password` response;
  - whether Next 16 prefetches trigger the proxy for these routes;
  - whether nested layouts and pages render in parallel (B2-A-11).
- **Business logic inside route handlers and server actions** beyond their auth checks (Slice 3). `pdf/render.ts` beyond its service-role call.
- **Security-only items:** CSP and headers, cookie flags, the CVE check, the `isSafeNext` backslash behavior at runtime, and the name and email the Approve link puts in the URL query string (`requests/request-row-actions.tsx:20-27`). All handed to security review.
- **UI-only files not read in full:** `reset-form.tsx`, `forgot-form.tsx`, `invite-form.tsx`, `partner-row-actions.tsx`.
- **Checks not run:** lint, unit tests, build, and any dev server or browser (per the rules). `package-lock.json` beyond the direct dependency versions.
- **Scripts** that read env (Slice 8).
