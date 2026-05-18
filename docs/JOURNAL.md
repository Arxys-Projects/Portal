# Project Journal

Chronological narrative of work on the Arxys Partner Portal. Newest entry at top. Each step gets a *Work done* subsection and (where applicable) a *Detours & fixes* subsection.

---

## 2026-05-15 — Step 3: Authentication (invite-only)

### Work done

- Wrote three Supabase client helpers under `src/lib/supabase/`:
  - `browser.ts` — `createBrowserClient()` from `@supabase/ssr` for client components.
  - `server.ts` — `createServerClient()` wired to the Next 16 async `cookies()` store. Used by Server Components, Server Actions, Route Handlers.
  - `admin.ts` — `@supabase/supabase-js` `createClient()` with the service-role key. Imports `server-only` at the top so it cannot accidentally land in a browser bundle.
- Wrote `src/lib/supabase/proxy.ts` exporting `updateSession(request)` — refreshes the Supabase auth cookie on every request, redirects unauthenticated traffic to `/login`, redirects authenticated traffic away from `/` and `/login` to `/dashboard`. Public paths are explicitly enumerated.
- Wrote `src/proxy.ts` as a one-line delegator that calls `updateSession`. Uses Next 16's `proxy` convention (see [`decisions/0009`](./decisions/0009-proxy-replaces-middleware-next16.md)).
- Built the auth UI under `src/app/(auth)/`:
  - `layout.tsx` — minimal Tailwind card layout.
  - `login/{page,login-form,actions}.tsx` — sign-in with email + password via a Server Action using `useActionState`. On success: redirect to `/dashboard` (or `?next=...` if present).
  - `forgot-password/{page,forgot-form,actions}.tsx` — sends a reset email via `supabase.auth.resetPasswordForEmail()`. Returns `"sent"` regardless of whether the email exists, to avoid email enumeration.
  - `reset-password/{page,reset-form,actions}.tsx` — sets a new password via `supabase.auth.updateUser()`. Requires an active session (the user gets one from clicking the email link, which routes through `/auth/confirm` first).
- `src/app/auth/confirm/route.ts` — handles the link clicked from any Supabase email (invite, recovery, signup, email change). Calls `verifyOtp({ type, token_hash })`, then redirects to `?next=<path>`.
- `src/app/(app)/layout.tsx` — protected shell. Calls `supabase.auth.getUser()`, redirects to `/login` if no user, otherwise reads the `partners` row and renders a header with company + contact + role and a sign-out button.
- `src/app/(app)/dashboard/page.tsx` — placeholder dashboard. Step 4 will replace the placeholder with the calculator entry point.
- `src/app/(app)/_actions/logout.ts` — Server Action that calls `signOut()` and redirects to `/login`.
- Replaced the create-next-app default `src/app/page.tsx` with a redirect that sends authenticated users to `/dashboard` and unauthenticated to `/login`. The proxy already covers most of this; the page redirect is the fallback for direct hits.
- Wrote `scripts/bootstrap-admin.ts` — one-shot CLI that creates the first admin via the service-role admin API. Idempotent: re-running for the same email upserts the partner row to role=admin. Generates a 24-byte URL-safe random password by default, prints it once.
- Ran the bootstrap for `andy.newbom@arxys.com` (Arxys / Andy Newbom). Captured the generated password.
- Configured the Supabase auth URLs in the dashboard (Site URL + redirect URL allow-list) so email-link redirects land on the right host.

### Detours & fixes

- **Vercel build failed: "Missing required environment variable: PIPEDRIVE_API_TOKEN"** during `Collecting page data for /dashboard`. Root cause: `src/lib/env.ts` validated *all* env vars eagerly at module load, so any import chain that touched it (including Next's page-data collection on the dashboard) triggered the check — even though `/dashboard` doesn't use Pipedrive vars. Vercel only had the 3 Supabase keys at this point because that's all I'd asked for. Fix: refactor `env.ts` to use `Object.defineProperty` getters so each variable is checked the first time *something actually reads it*. The dashboard never reads Pipedrive vars, so unrelated subsystems can be provisioned on Vercel just-in-time as Steps 7/8 ship. Existing call sites (`env.NEXT_PUBLIC_SUPABASE_URL`) are unchanged.
- **`middleware.ts` is now `proxy.ts` in Next 16.** Caught from `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` before writing any code (per AGENTS.md). Exported function is `proxy`, not `middleware`. Internet examples and Supabase docs still say "middleware" — translate when copying.
- **`cookies()` is async**, returns a promise. Same shape as Next 15, but worth confirming via `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md` before writing the server client wrapper.
- **Sign-up route intentionally omitted.** Decision recorded in [`decisions/0010`](./decisions/0010-invite-only-signup.md). The first admin comes from the bootstrap script; subsequent partners get invited from the admin panel (Step 9, not yet built).
- **Don't run logic between `createServerClient` and `auth.getUser()` in the proxy.** Per `@supabase/ssr` docs — mistakes here cause randomly-logged-out users. The code keeps these calls adjacent.
- **Forgot-password action always returns `"sent"`**, even when the email doesn't exist, to defeat email enumeration. The actual error (if any) is logged server-side for debugging.

### Decisions captured

- [`0009-proxy-replaces-middleware-next16.md`](./decisions/0009-proxy-replaces-middleware-next16.md)
- [`0010-invite-only-signup.md`](./decisions/0010-invite-only-signup.md)

---

## 2026-05-15 — Step 2: Supabase schema + RLS

### Work done

- Created the Supabase cloud project: `arxys-portal`, us-east-1, Free tier. Saved DB password in 1Password.
- Installed Supabase CLI 2.98.2 via Homebrew: `brew install supabase/tap/supabase`.
- Authenticated the CLI with a Personal Access Token from `https://supabase.com/dashboard/account/tokens`.
- Ran `supabase init` (creates `supabase/config.toml` + `supabase/migrations/` + a `.gitignore` for `.temp`/`.branches`).
- Ran `supabase link --project-ref ddqnpwpouvkgivvbjpju` (DB password passed via `SUPABASE_DB_PASSWORD` env so the prompt doesn't hang).
- Wrote `supabase/migrations/20260515193702_initial_schema.sql` covering:
  - 4 tables: `partners` (FK to `auth.users`), `products`, `server_specs`, `submissions`
  - `set_updated_at()` trigger applied to `partners`, `products`, `server_specs`
  - `is_admin(uid)` SECURITY DEFINER helper (used by policies)
  - RLS enabled on all 4 tables; `anon` and `authenticated` grants revoked then re-granted at the column level needed (`SELECT/UPDATE` on `partners`, `SELECT` on `products`/`server_specs`, `SELECT/INSERT` on `submissions`)
  - 5 policies: self-or-admin reads + updates on `partners`; active-or-admin reads on `products` and `server_specs`; own-or-admin reads + self-only inserts on `submissions`
- Applied via `supabase db push` — clean apply, only a `NOTICE` about `pgcrypto` already existing.
- Wrote `scripts/test-rls.ts` — a regression suite that provisions two ephemeral users via `auth.admin.createUser({ email_confirm: true })`, inserts their `partners` rows via service-role, runs cross-partner SELECT/INSERT, then tears them down. Installed `tsx` as a dev dependency to run it.
- Ran the suite: **10/10 passes** (5 anon-blocked tests via curl + 5 authenticated isolation tests via the script). Anon gets HTTP 401 `permission denied` (Postgres error 42501) on every table; cross-partner INSERTs are blocked by the `partner_id = auth.uid()` check.
- Configured cloud auth via the Management API. Confirmed `jwt_exp = 3600` and `refresh_token_rotation_enabled = true` were already correct. Attempted to set `sessions_timebox = 2592000` — Free tier rejected with HTTP 402 (Pro-only feature).
- Added the three Supabase env vars (URL, anon publishable key, service-role secret key) to both `.env.local` and the Vercel dashboard for Production/Preview/Development.

### Detours & fixes

- **Supabase CLI browser login failed** with "Could not create the CLI sign-in session — Unknown error." Bypassed cleanly with `supabase login --token <PAT>` from the dashboard's Account → Access Tokens page. No browser callback, no flaky session.
- **Sourcing `.env.local` in bash broke** on `SMTP_PASS=zddk flxo pysk svub` (Gmail app password format has internal spaces). Switched the test-runner invocation from `set -a && source .env.local` to Node 20's native `--env-file=.env.local` flag, which parses dotenv format correctly.
- **`sessions_timebox` is Pro-only**. The Phase 1 plan called for a 30-day refresh timebox, but Free tier returns 402 on PATCH. Accepted the gap; documented it inline in `supabase/config.toml` so future-us sees it when looking at session settings. The other two session-related requirements (3600s access TTL + refresh-token rotation) are unaffected and active.
- **`supabase db dump` requires Docker** (it spins up a pg_dump container locally) and we don't run Docker on this machine. Verified the migration applied by hitting the cloud project's PostgREST `/rest/v1/` introspection endpoint directly with curl — saw all four tables exposed plus `/rpc/is_admin`.

### Decisions captured

- [`0003-multi-unit-packing-over-single-unit-filter.md`](./decisions/0003-multi-unit-packing-over-single-unit-filter.md) — recommendation algorithm choice (preview for Step 5)
- [`0004-supabase-cli-migrations.md`](./decisions/0004-supabase-cli-migrations.md) — CLI over SQL Editor
- [`0005-supabase-ssr-over-auth-helpers.md`](./decisions/0005-supabase-ssr-over-auth-helpers.md) — modern client
- [`0006-bandwidth-gate-in-recommendation.md`](./decisions/0006-bandwidth-gate-in-recommendation.md) — bandwidth filter
- [`0008-defer-sessions-timebox-to-pro.md`](./decisions/0008-defer-sessions-timebox-to-pro.md) — Free-tier scope cut

---

## 2026-05-14 — Step 1: scaffold, env, GitHub, Vercel

### Work done

- Moved the PHP backend and React calculator HTML out of the project root into a `reference/` subdirectory so they wouldn't be picked up by `next build`.
- Scaffolded a fresh Next.js app via `npx create-next-app` (Next 16.2.6, React 19.2.4, TypeScript, ESLint, Tailwind v4, App Router, Turbopack).
- Installed runtime deps: `@supabase/ssr`, `@supabase/supabase-js`, `nodemailer`, `@react-pdf/renderer`, `zod`. Dev deps: `@types/nodemailer`. (Default `eslint`, `eslint-config-next`, `typescript`, `tailwindcss`, `@tailwindcss/postcss` came from create-next-app.)
- Hardened `eslint.config.mjs`: `@typescript-eslint/no-explicit-any: error` and `@typescript-eslint/no-unused-vars: error` (with `_`-prefix escape).
- Created `.env.local` with the known values (Pipedrive token, SMTP credentials, Gmail app password, internal notification address). Supabase placeholders left blank for Step 2.
- Wrote `src/lib/env.ts` — a startup validator that loops over a `REQUIRED_VARS` array at runtime and throws if any are missing or empty. Imported once at server-side boot so misconfigured environments fail fast.
- Verified `.env.local` and `.DS_Store` are gitignored.
- Committed Step 1 locally.
- Set up SSH multi-account GitHub auth: generated `~/.ssh/id_ed25519_arxys` (no passphrase, dedicated to the Arxys-Projects org), added a `Host github.com-arxys` block to `~/.ssh/config` with `IdentitiesOnly yes` so it doesn't collide with the existing TorqueCoffee HTTPS+Keychain workflow.
- Pushed `main` to `git@github.com-arxys:Arxys-Projects/Portal.git`.
- Wired Vercel to the GitHub repo; first deployment succeeded.

### Detours & fixes

- **The React calculator HTML file was actually an RTF document with a `.html` extension** (TextEdit had saved it that way). De-RTF'd cleanly with `textutil -convert txt -format rtf -inputencoding UTF-8 -encoding UTF-8`. Preserved the original as `.rtf` and produced `.clean.html`. Verified zero RTF residue, zero backslash-EOL escapes, and all 26 Unicode chars (e.g. `×`, `•`) preserved.
- **`npx create-next-app .` refused** because the parent directory name (`Arxys Portal`) violates npm package naming (capital letter, space). Worked around by scaffolding into `arxys-portal/` then `shopt -s dotglob && mv arxys-portal/* ./ && rmdir arxys-portal` to relocate the files in place. `package.json` "name" is `arxys-portal` while the folder remains `Arxys Portal`.
- **ESLint failed on `env.ts`** because the initial draft used `REQUIRED_VARS` only as a type source. Refactored `loadEnv()` to iterate the array at runtime, which satisfies `no-unused-vars` and keeps the type narrowing.
- **`git commit` heredoc broke under bash** with quoting errors. Switched to writing the commit message into a temp file and using `git commit -F`.
- **First push got HTTP 403**. The macOS Keychain (`osxkeychain` credential helper) had cached the user's TorqueCoffee credentials globally, and TorqueCoffee has no write access to `Arxys-Projects/Portal`. Solution: SSH key on a dedicated host alias (`github.com-arxys`), set the repo's remote to `git@github.com-arxys:...`, and the original HTTPS-cached identity stays untouched for other repos.
- **First Vercel URL (`portal-flame-eta.vercel.app`) returned 404 NOT_FOUND**. This was a default project URL that no longer matched our deployment. The correct alias was `portal-arxys.vercel.app`.
- **Second URL returned 401 with `_vercel_sso_nonce`**. This was Vercel Deployment Protection (SSO gate) — expected, not a bug.
- **After SSO auth, the page showed "404: NOT_FOUND"** with an empty `x-matched-path`. The root cause was the Vercel project's **Framework Preset** being unset, so Vercel had no routing config for the Next.js App Router output. The `next build` succeeded and produced `.next/` artifacts, but Vercel didn't know how to serve them. Fix: Dashboard → Settings → General → Framework Preset → **Next.js** → Save → Redeploy. After that, the default landing page rendered.
- **Local `npm run build` failed** with `Cannot find module 'next/types.js'` during the TS validator check. Direct `tsc --noEmit --project tsconfig.json` was clean (exit 0). Inspected `node_modules/next/dist/lib/typescript/runTypeCheck.js` and the generated `.next/types/validator.ts` — the validator hard-codes `import type { ResolvingMetadata, ResolvingViewport } from "next/types.js"`, which should resolve fine via bundler resolution. Rather than dig deeper into Next internals, removed `.next` + `node_modules` and ran `npm ci` (430 packages, 40s). Re-ran `npm run build`: clean, 72s compile + 48s TypeScript. Confirmed the bug was stale state in `node_modules`, not a real issue with the code.
- **"Next.js v24" in Vercel's Framework Preset dropdown** is the preset *config* version, not the Next.js version. The actual Next.js stable is 16.2.6 (what we use).

### Decisions captured

- [`0002-gmail-smtp-over-siteground.md`](./decisions/0002-gmail-smtp-over-siteground.md)
- [`0007-ssh-multi-account-github.md`](./decisions/0007-ssh-multi-account-github.md)

---

## 2026-05-14 — Project kickoff

### Work done

- Received the Phase 1 execution plan covering 11 steps (scaffold → schema → auth → calculator integration → API route → PDF → email → Pipedrive → admin → pricing → pre-launch checklist).
- Located the two reference files (`arxys-calculator-mailer-FINAL.php`, the React calculator HTML) in the existing `Arxys Portal` folder.
- Settled the eleven open questions in the plan: de-RTF the HTML, port the PHP multi-unit packing algorithm (not the React file's single-unit filter), bandwidth comes from a Google Sheet and gates the recommendation, Gmail SMTP only (never SiteGround), SMTP-as-alias on Andy's account for `noreply@arxys.com`, reference files move to `reference/`, GitHub repo URL `https://github.com/Arxys-Projects/Portal.git`, Vercel project already exists, Supabase not yet provisioned, SSH multi-account (Option C) for GitHub auth.

### Decisions captured

- [`0001-three-doc-structure.md`](./decisions/0001-three-doc-structure.md) — meta-decision for the docs system (this very file)
