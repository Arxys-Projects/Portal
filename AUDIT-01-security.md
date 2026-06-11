# AUDIT-01 — Security & Data-Access Audit (Arxys Partner Portal)

**Date:** 2026-06-11 · **Type:** read-and-report (no code changed, nothing committed) · **Auditor:** Claude (Opus 4.8)

## Summary

This audit examined access control *above* the database layer: server actions, API route handlers, service-role/elevated-privilege usage, the internal-user role-escalation path, on-behalf-of partner attribution, secret handling, write-path input validation, and the auth surface. Per the brief, the Supabase RLS policy set itself was treated as correct and not re-audited; I looked instead for places the application code bypasses, pre-empts, or fails to back up RLS. The application-layer posture is **generally strong** — the service-role client is `server-only`, every sensitive route/action that I read calls `getUser()` and re-derives identity/role from the database, and the role-escalation and on-behalf paths are gated server-side with no client-trusted role flags. The notable exceptions are one server action (`registerDealAction`) that performs **no auth check and trusts client-supplied partner identity**, and a protocol-relative **open-redirect** in the login/confirm `next` handling. The remainder are lower-severity hardening items (raw DB error messages surfaced to clients, an unvalidated PDF endpoint, client-supplied pricing trusted into a Pipedrive deal). No secrets were found in client bundles or committed config. This is a static read; I did not execute exploits, and absence of a finding is not proof of absence of a vulnerability.

### Count by severity

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 2 |
| Low | 6 |
| Informational | 2 |

---

## MEDIUM

### M-1 — `registerDealAction` has no auth check and trusts client-supplied partner identity
- **Severity:** Medium
- **Location:** [`src/app/(app)/dashboard/actions.ts:26-68`](src/app/(app)/dashboard/actions.ts) (action); [`src/app/(app)/dashboard/register-deal-form.tsx:47-50`](src/app/(app)/dashboard/register-deal-form.tsx) (the hidden fields that feed it); email builder [`src/lib/email/deal-registration.ts`](src/lib/email/deal-registration.ts)
- **What's wrong:** `registerDealAction` never calls `getUser()` or reads the `partners` table. It takes `partnerId`, `companyName`, `contactName`, and `partnerEmail` straight from `FormData` and passes them into `sendDealRegistrationEmail`, which emails them to the internal sales mailbox (`INTERNAL_NOTIFICATION_EMAIL`) as the registering partner's identity. The legitimate form pre-fills these from server-rendered session values ([`dashboard/page.tsx:268-273`](src/app/(app)/dashboard/page.tsx)), but a server action cannot trust that — any authenticated user can POST arbitrary values and forge the attribution of a "deal registration" to any company/partner. This is also the **only** sensitive action in the codebase that relies solely on the proxy/middleware for authentication; every other action re-checks `getUser()` itself (compare `requestComparisonQuote`, which derives company/contact from the DB by `user.id`). Validation is also weak: in `DealRegSchema`, `companyName`/`contactName` have no length bound and `partnerEmail` is `z.string()` — **not** `z.email()`.
  - *Exploit path:* an authenticated partner (or any client able to reach the action) submits forged `companyName`/`partnerEmail`/`partnerId` → sales receives a deal-registration email attributing an opportunity to a company that isn't theirs. Impact is integrity/spoofing of an internal notification (and potential spam), not a data breach — hence Medium, not High. Unauthenticated invocation is currently blocked by the proxy (Next 16.2.6 is past CVE-2025-29927), so the proxy is the lone gate; defense-in-depth says the action should not depend on it.
- **Suggested fix:** Mirror `requestComparisonQuote`: call `getUser()` at the top, reject if absent, load `company_name`/`contact_name` from `partners` by `user.id` and use `user.email`, and ignore the client-supplied identity fields entirely (drop the hidden inputs). Tighten the schema (`z.email()`, length caps).

### M-2 — Open redirect via protocol-relative `next` parameter
- **Severity:** Medium
- **Location:** [`src/app/(auth)/login/actions.ts:37-40`](src/app/(auth)/login/actions.ts); same pattern in [`src/app/(auth)/auth/confirm/actions.ts:16-17,34`](src/app/(auth)/auth/confirm/actions.ts)
- **What's wrong:** The post-login redirect target is validated with `parsed.data.next.startsWith("/")`. A protocol-relative URL such as `//evil.com` passes that check (it starts with `/`), and browsers resolve `//evil.com` as `https://evil.com`. So `https://portal.arxys.com/login?next=//evil.com` would, after a successful login, redirect the victim off-site.
  - *Exploit path:* attacker sends a victim a crafted login (or invite-confirm) link with `next=//attacker.tld`; after the victim authenticates, they're bounced to the attacker's site — a credible phishing/redirect primitive on a trusted domain.
- **Confidence:** Logic confirmed (the `startsWith("/")` check demonstrably admits `//`). I did **not** runtime-verify that Next 16's `redirect()` forwards a protocol-relative `Location` without normalizing it — worth a quick manual check, but the validation is wrong regardless.
- **Suggested fix:** Require a single leading slash and reject the rest: e.g. `next.startsWith("/") && !next.startsWith("//") && !next.includes("://")` (or parse and enforce a same-origin/relative-only path). Apply to both `login` and `auth/confirm`.

---

## LOW

### L-1 — Raw database/Supabase error messages returned to the client
- **Severity:** Low
- **Location (representative):** [`submissions/page.tsx:51`](src/app/(app)/submissions/page.tsx), [`admin/partners/page.tsx:46`](src/app/(app)/admin/partners/page.tsx), [`calculator/actions.ts:208,296`](src/app/(app)/calculator/actions.ts), [`admin/submissions/actions.ts:44,61`](src/app/(app)/admin/submissions/actions.ts), [`submissions/actions.ts:45,72,124`](src/app/(app)/submissions/actions.ts), [`reset-password/actions.ts:43`](src/app/(auth)/reset-password/actions.ts), and several `error.message` returns in [`admin/partners/actions.ts`](src/app/(app)/admin/partners/actions.ts) (e.g. lines 132, 167, 190, 210, 263, 302, 340)
- **What's wrong:** Many paths surface `error.message` from PostgREST/Supabase directly to the UI/caller. These messages can disclose column names, constraint names, RLS-policy denials, and other internal schema/structure detail — useful reconnaissance for an attacker probing the data model.
- **Suggested fix:** Log the detailed error server-side (`console.error`) and return a generic, user-facing message. Standardize on a small helper so the pattern is consistent.

### L-2 — `api/comparison/pdf` renders an unvalidated client JSON body
- **Severity:** Low
- **Location:** [`src/app/(app)/api/comparison/pdf/route.ts:23-31`](src/app/(app)/api/comparison/pdf/route.ts)
- **What's wrong:** After the `getUser()` check, the handler does `body = await request.json()` and passes it straight into `renderComparisonPdfBuffer({ ...body, generatedAt })`. The `Omit<ComparisonPdfInput,…>` annotation is a compile-time cast, not runtime validation — arbitrary/oversized/malformed input reaches the renderer. There's no `try/catch`, so a render exception becomes an unhandled 500. Impact is limited: the PDF is returned only to the caller (no stored data, no other user's data), so this is mostly a robustness/DoS-surface and unvalidated-passthrough concern rather than a disclosure.
- **Suggested fix:** Validate the body with a `zod` schema (the comparison fields are well-bounded) and wrap the render in `try/catch` returning a clean 400/500.

### L-3 — Comparison-quote deal value derived from client-supplied price/model
- **Severity:** Low
- **Location:** [`src/app/(app)/comparison/actions.ts:10-16,57-65`](src/app/(app)/comparison/actions.ts)
- **What's wrong:** `requestComparisonQuote` validates *shape* (`arxysMsrp` positive, `serverCount` 1–25) but trusts `arxysMsrp` and `arxysModelId` from the client without re-checking them against the product catalog. The created Pipedrive deal's value is `arxysMsrp * serverCount`, so a partner can fabricate the model match and the deal value. Identity here *is* correctly server-derived (company/contact from the DB), so this is a CRM data-integrity issue, not an attribution or access issue.
- **Suggested fix:** Resolve `arxysModelId` against the `products`/specs table server-side and use the catalog MSRP rather than the client-supplied figure; reject unknown model IDs.

### L-4 — `ilike` on raw user input in on-behalf target match
- **Severity:** Low
- **Location:** [`src/app/(app)/calculator/actions.ts:134-138`](src/app/(app)/calculator/actions.ts)
- **What's wrong:** The on-behalf company match runs `admin.from("partners").ilike("company_name", onBehalfRaw).limit(1)` on the service-role client. `ilike` treats `%` and `_` as wildcards, so an internal user entering `%` (or a name containing those characters) would match an *unintended* partner (the first row) and bind the deal/FK to them. This is **not** a privilege escalation — the block is reachable only by `is_internal` users, who are already authorized to run calcs on behalf of any partner — but it can mis-attribute a deal. (No SQL injection: supabase-js parameterizes the value.)
- **Suggested fix:** Escape LIKE metacharacters in `onBehalfRaw`, or match with `.eq()` plus a case-insensitive comparison, so the "exact match" intent is enforced literally.

### L-5 — Auth-email redirect origin derived from request `Host`/`Origin` header
- **Severity:** Low
- **Location:** [`src/app/(app)/admin/partners/actions.ts:48-54`](src/app/(app)/admin/partners/actions.ts) (`inviteRedirectUrl`); [`src/app/(auth)/forgot-password/actions.ts`](src/app/(auth)/forgot-password/actions.ts) (`origin`/`host` fallback)
- **What's wrong:** The base URL embedded in invite/reset emails is built from the incoming `Origin`/`Host` header. A spoofed Host could, in principle, point the email link at an attacker origin. This is **mitigated** by Supabase's redirect allow-list (RUNBOOK §8) — Supabase refuses `redirectTo` values not on the list — so exploitation depends on the allow-list being loose (e.g. the `https://*.vercel.app/**` wildcard).
- **Suggested fix:** Build the email base URL from a fixed canonical value (an env var / `Site URL`) instead of request headers; keep the Supabase redirect allow-list as tight as the deployment allows.

### L-6 — `requireAdmin` in admin/submissions omits the `status === 'active'` check
- **Severity:** Low
- **Location:** [`src/app/(app)/admin/submissions/actions.ts:15-27`](src/app/(app)/admin/submissions/actions.ts)
- **What's wrong:** This local `requireAdmin` checks `partner?.role === 'admin'` only, while the equivalents elsewhere (`admin/partners/actions.ts:42`, `require-admin-or-internal.ts`, `api/admin/forecast/xlsx/route.ts:33`) also require `status === 'active'`. A *suspended* admin with a still-valid session JWT would pass this gate. **Not exploitable in practice:** these actions run on the user-scoped (RLS) client, and the DB `is_admin()` function requires `status = 'active'`, so the UPDATE/DELETE is blocked at the row level for a suspended admin. It's a defense-in-depth inconsistency, not a live hole.
- **Suggested fix:** Add `&& partner.status === 'active'` for consistency with the other gates so the app layer fails closed independently of RLS.

---

## INFORMATIONAL / by-design (flagged to confirm intent)

### I-1 — Internal (non-admin) users can read all partners' emails via the service-role client
- **Location:** [`src/app/(app)/admin/partners/page.tsx:55-63`](src/app/(app)/admin/partners/page.tsx)
- **Note:** The partners page uses the service-role client's `auth.admin.listUsers({ perPage: 200 })` to join emails onto the partner list, and the page is reachable by `requireAdminOrInternal` (admins **and** `is_internal` users). So internal users see every partner's email, role, company, and internal flag. This matches the documented Phase 8 Step C intent (internal users get the admin partner/pipeline view, read-only) and the audience is trusted Arxys staff — recording it so the data-exposure scope is explicitly acknowledged, not assumed. (`perPage: 200` also silently truncates beyond 200 users; documented in-code.)

### I-2 — Pipedrive API token passed as a query-string parameter
- **Location:** [`src/lib/pipedrive/client.ts:101-111`](src/lib/pipedrive/client.ts)
- **Note:** `withToken` appends `api_token=…` to the request URL. This is server-side only and is the documented Pipedrive v1 convention. Error messages are built from the request `path`, not the full URL, so the token isn't included in thrown `PipedriveError`s or the `console.error` logs I reviewed — no token leakage found. Noted only because query-string secrets are inherently more log-prone than headers; consider Pipedrive's header/v2 auth if upgrading.

---

## Scope coverage — what was examined and what is clean

- **1. Access control beyond the DB layer — examined, mostly clean.** Server actions and API routes consistently call `getUser()` and re-derive role from the DB; per-row reads/writes go through the RLS (anon) client. The `[id]` PDF route ([`api/submissions/[id]/pdf/route.ts`](src/app/(app)/api/submissions/[id]/pdf/route.ts)) does **not** trust the `id` — it loads through the RLS-scoped client, so a guessed id returns 404. The one app-layer gap is **M-1**. Several partner actions intentionally rely on RLS for ownership (documented in [`submissions/actions.ts:12-17`](src/app/(app)/submissions/actions.ts)); that is sound *given* the RLS set is correct (assumed per brief). I did not find an app-layer path that the recent RLS fix clearly missed or that re-introduces a gap.
- **2. Service-role / elevated-privilege usage — examined, clean.** All seven `createSupabaseAdminClient()` call sites were read: `layout.tsx` (invited→active, scoped to `user.id`), `calculator/actions.ts` (on-behalf match + own display-name lookup, gated on server-read `is_internal`), `calculator/page.tsx` + `dashboard/page.tsx` + `submissions/page.tsx` (read-only resolution of on-behalf target *company names* for display), `admin/partners/page.tsx` (email join, gated by admin/internal layout), `admin/partners/actions.ts` (all writes gated by `requireAdmin`/`requireAdminOrInternal`). No user input flows into a service-role **write** without a prior server-side permission gate. See L-4/I-1 for the two nuances.
- **3. Role-escalation path — examined, clean.** `setPartnerInternal` is `requireAdmin`-only ([`admin/partners/actions.ts:325-347`](src/app/(app)/admin/partners/actions.ts)). `invitePartner` forces `is_internal = false` for non-admin (internal) callers and hardcodes `role = 'partner'` ([lines 90-91,117](src/app/(app)/admin/partners/actions.ts)) — a non-admin cannot mint an internal user, and no code path sets `role`/`is_internal` from a client-trusted value. Admin promotion is out-of-band (bootstrap script). A partner cannot trigger escalation.
- **4. On-behalf-of isolation — examined, clean (one Low).** The entire on-behalf branch is gated on `callerStatus.is_internal` read from the DB server-side ([`calculator/actions.ts:131`](src/app/(app)/calculator/actions.ts)); a non-internal partner's `onBehalfOf` is ignored. `submissions.partner_id` is always set to the creator's `auth.uid()` — attribution can't be spoofed to make a row *owned* by another partner. Revision source rows are read through the RLS client, so a guessed `sourceSubmissionId` for another partner's quote returns null and can't attach to their Pipedrive deal ([lines 481-503](src/app/(app)/calculator/actions.ts)). Only nuance is the `ilike` wildcard (L-4).
- **5. Secrets & key handling — examined, clean.** No `.env*` files are tracked (`.gitignore` covers `.env*`); no hardcoded keys/tokens/private keys in `src/`. The only `NEXT_PUBLIC_` vars are the Supabase URL and anon (publishable) key, both intended to be public. The service-role key is read only in [`supabase/admin.ts`](src/lib/supabase/admin.ts) (`import "server-only"`); the Pipedrive token only in the server-side client. No `"use client"` component imports `lib/env`, the admin client, or any secret. `next.config` does not expose env to the client.
- **6. Input validation on write paths — examined, mixed.** The calculator submit path validates thoroughly with `zod` and **recomputes all totals server-side** (client figures are never trusted; `motionPercent` is re-pinned for constant recording) ([`calculator/actions.ts:75-193`](src/app/(app)/calculator/actions.ts)). Invite/partner-name/status actions are `zod`-validated. Gaps: M-1 (deal-reg), L-2 (comparison PDF body), L-3 (comparison MSRP). Email builders interpolate user strings into the body and subject; nodemailer header-encodes subjects, so I found no header-injection primitive, but L-1's unvalidated `companyName` flows into a subject line and should be bounded.
- **7. Auth surface — examined, mostly clean (one Medium).** The proxy validates sessions with `getUser()` (not just `getSession()`) and redirects unauthenticated requests; Next 16.2.6 is past the middleware-bypass CVE. Login returns a generic "Invalid email or password" (no enumeration); forgot-password always returns "sent" and logs failures server-side (no enumeration); `auth/confirm` consumes the OTP on POST only (ADR 0051). The `next`-redirect validation is the exception (**M-2**). Error responses mostly avoid stack traces, but raw DB error strings leak in several places (**L-1**).

## What I could not fully verify
- The **RLS policy set** itself was out of scope (assumed correct per brief); these findings assume the policies behave as their migrations and the recent fix describe. The several actions that "rely on RLS for ownership" are only as safe as that assumption.
- **M-2**'s real-world effect depends on Next 16's `redirect()` behavior with a protocol-relative `Location`, which I did not execute.
- **L-5** depends on the exact Supabase redirect allow-list configured in the dashboard, which is not in the repo.
- I read the code paths but did not run the app or attempt live exploitation; this is a static review.
