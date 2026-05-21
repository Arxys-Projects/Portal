# Runbook — Arxys Partner Portal

Recreate this project from a blank Mac. No dead-ends, no detours — only the steps that work. If something fails for you here, fix the underlying issue rather than working around it; if the fix is genuinely required, update this file.

## Prerequisites

- macOS (developed on Darwin 25.x). Linux works the same except step 5's `textutil` (not needed unless re-processing reference files).
- [Homebrew](https://brew.sh)
- Node.js 20.x or newer (for `--env-file` support)
- A GitHub account with write access to `Arxys-Projects/Portal`
- A Supabase account (free tier is fine for development)
- A Vercel account linked to the GitHub account
- Gmail Workspace account `andy.newbom@arxys.com` with 2FA enabled, App Password generated, `noreply@arxys.com` configured as a "Send mail as" alias
- A Pipedrive account with an API token

## 1. Clone & install

Clone into `~/Developer/` — **not** into `~/Documents/` or any iCloud-synced path. iCloud Drive's per-file metadata sync turns `node_modules` and `.next/cache/` into a sustained I/O penalty (turbopack builds wedge at 0% CPU). The `~/Developer/` folder is Apple's canonical dev location and is auto-excluded from Spotlight.

```bash
mkdir -p ~/Developer
git clone git@github.com-arxys:Arxys-Projects/Portal.git "$HOME/Developer/Arxys Portal"
cd "$HOME/Developer/Arxys Portal"
npm ci
```

If `git@github.com-arxys` doesn't exist as a host alias yet, do **9. GitHub SSH multi-account setup** first.

## 2. Environment variables

Create `.env.local` (already gitignored) with these keys. Fill in your own values for the secrets.

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...

# Pipedrive
PIPEDRIVE_API_TOKEN=...

# Gmail SMTP — see decisions/0002 for why Gmail and not SiteGround
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=andy.newbom@arxys.com
SMTP_PASS=<16-character app password with spaces>
SMTP_FROM=noreply@arxys.com

# Sales team mailbox; receives internal calc-submission notifications
INTERNAL_NOTIFICATION_EMAIL=sales@arxys.com
```

The startup validator at [`src/lib/env.ts`](../src/lib/env.ts) is *lazy* — each variable is only read when something uses it, so a missing var doesn't crash the deploy but does crash the first request that touches it. **Every var above must also be set in Vercel** (Settings → Environment Variables → Production) — `.env.local` covers local dev only. Add new vars to env.ts's `REQUIRED_VARS` array.

## 3. Verify local build

```bash
npm run build
```

Expected output ends with a route table containing at minimum `/` and `/_not-found` and "Build Completed". Turbopack takes ~3 minutes on the first build inside iCloud Documents; subsequent builds are faster.

## 4. Supabase: create the project

In the dashboard at `https://supabase.com/dashboard`:

1. **Organization** → use `Arxys` (or create it on Free tier).
2. **New project**:
   - Name: `arxys-portal`
   - Region: **East US (North Virginia)** (`us-east-1`) — colocates with Vercel `iad1`
   - Plan: Free
   - DB password: click *Generate a password*, save to 1Password immediately.
3. Once the project is provisioned (~2 minutes), go to **Project Settings → API**:
   - Copy the **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - Copy the **publishable** key (`sb_publishable_...`) → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Reveal and copy the **secret** key (`sb_secret_...`) → `SUPABASE_SERVICE_ROLE_KEY`

Paste them into `.env.local` and (separately) into Vercel's Environment Variables for Production / Preview / Development. Mark the service-role key as **Sensitive** in Vercel.

## 5. Supabase: install and link the CLI

```bash
brew install supabase/tap/supabase
```

Generate a Personal Access Token at `https://supabase.com/dashboard/account/tokens` (name it `arxys-portal-cli` or whatever you like). Then:

```bash
supabase login --token sbp_<your-token>
SUPABASE_DB_PASSWORD='<the-db-password-from-step-4>' supabase link --project-ref <project-ref>
```

Using `--token` bypasses the browser-based login flow, which has been unreliable. See [`decisions/0004-supabase-cli-migrations.md`](./decisions/0004-supabase-cli-migrations.md).

## 6. Supabase: apply the schema

The migrations live in `supabase/migrations/`:

- `20260515193702_initial_schema.sql` — `partners`, `products` (placeholder), `server_specs` (placeholder), `submissions`, RLS, `is_admin()`.
- `20260519052732_step5_submissions_and_seeds.sql` — `submissions.groups_payload`, server_specs bandwidth-gate relaxation, 6 placeholder family rows.
- `20260521190350_step3_4_products_sku_pk.sql` — replaces `products` + drops `server_specs`; new SKU-PK shape with inline `max_cameras` + `max_storage_tb`; migrates `submissions.recommended_product_id` UUID → TEXT; seeds 6 mid-tier VideoX SKUs with real MSRPs. See [ADR 0031](./decisions/0031-step-3-4-schema-migration.md) and [ADR 0032](./decisions/0032-sku-level-recommendation-algorithm.md).

Apply them to a fresh project:

```bash
SUPABASE_DB_PASSWORD='<db-password>' supabase db push
```

You'll be prompted to confirm. Type `Y`. The CLI runs the three files in timestamp order. The 2026-05-21 migration is destructive: it `drop ... cascade`s the prior `products` + `server_specs` tables. On a fresh project this is a no-op (those tables only exist after the first two migrations land); on an existing project, see the rollback recipe at `supabase/rollback/step-3-4-rollback.sql` + the JSON-dump script `scripts/backup-tables.ts` before re-running.

For a true reset on a cloud project, drop the schema from the dashboard SQL editor and re-push.

## 7. Supabase: verify RLS

```bash
node --env-file=.env.local --import tsx scripts/test-rls.ts
```

Expected output ends with `All authenticated RLS tests passed.` and zero failures. The suite provisions two ephemeral test users, runs cross-partner access checks, and tears them down — there should be no residual state in the cloud project afterwards.

If you don't have `tsx` installed yet: `npm install --save-dev tsx`.

## 8. Supabase: configure auth URLs

In the dashboard at **Authentication → URL Configuration**:

- **Site URL**: `https://portal-arxys.vercel.app` (swap to `https://portal.arxys.com` once the custom domain is wired)
- **Redirect URLs** (Allow List):
  - `http://localhost:3000/**`
  - `https://portal-arxys.vercel.app/**`
  - `https://*.vercel.app/**` (covers preview deployments)

These control which URLs Supabase will redirect to from email links (invites, password resets). Save before bootstrapping any users — otherwise the email links will refuse to land on the portal.

## 8a. Supabase: custom SMTP for auth emails

The Portal sends all auth emails (invite, magic link, password reset, confirm signup) via the same Gmail Workspace SMTP used by the calculator notification path. Without this, Supabase ships its defaults from `noreply@mail.app.supabase.io` and most corporate inboxes will spam them.

In the dashboard at **Project Settings → Authentication → SMTP Settings**:

1. Toggle **Enable Custom SMTP** on.
2. **Sender email**: `sales@arxys.com`. **Sender name**: `Arxys Partner Portal`.
3. **Host**: `smtp.gmail.com`. **Port**: `587`.
4. **Username**: the Google account that owns the App Password (`andy.newbom@arxys.com` per ADR [0002](./decisions/0002-gmail-smtp-over-siteground.md); `sales@arxys.com` is a "Send mail as" alias on that account, not its own auth identity).
5. **Password**: the 16-character Gmail App Password — same value as Vercel env `SMTP_PASS`. Paste, do not type; App Passwords are 16 chars with no spaces in Supabase even though Google displays them grouped.
6. **Minimum interval between emails**: `60` seconds (default).
7. Save.

Email templates live in [`docs/email-templates/*.html`](./email-templates/). To deploy: copy each file's HTML into Supabase Auth → Email Templates → corresponding template, update the subject per the table in ADR [0025](./decisions/0025-supabase-custom-smtp-and-branded-templates.md), save.

If the Gmail App Password rotates, update **both**:

- Vercel env `SMTP_PASS` (production + preview).
- Supabase Auth → SMTP Settings → Password field.

## 8b. Vercel: production deployment protection

For the Portal project: **Settings → Deployment Protection → Vercel Authentication**.

- **Production**: **Disabled** — invitees with no Vercel account need to reach `/login` on the live host.
- **Preview**: **Only Vercel Team** (or default) — keeps preview deploys gated to the org.

Verify by opening `https://portal-arxys.vercel.app` in an incognito browser window. Must land on the portal's `/login` page, not Vercel's SSO.

## 9. Create the first admin user

```bash
node --env-file=.env.local --import tsx scripts/bootstrap-admin.ts \
  --email you@arxys.com --name "Your Name" --company Arxys
```

Prints a generated password once. Save it to your password manager **immediately** — the script does not store it. The user is created with `email_confirm: true` (no verification email needed) and `partners.role = 'admin'`.

Idempotent: re-running for the same email upserts the partner row without recreating the auth user.

Sign in at `http://localhost:3000/login` (dev) or `https://portal-arxys.vercel.app/login` (prod). Land at `/dashboard`.

## 10. Vercel: connect & deploy

1. In the Vercel dashboard, import the GitHub repo `Arxys-Projects/Portal`.
2. **Settings → General → Framework Preset** = **Next.js** (essential — without this, App Router routes won't be served, you'll see a 404 on `/`).
3. **Settings → General → Root Directory** = empty (project lives at repo root).
4. **Settings → Git → Production Branch** = `main`.
5. **Settings → Environment Variables** — add the 10 keys from `.env.local`. Service-role key marked Sensitive. Apply to Production + Preview + Development.
6. Trigger a deploy (push to `main` or click *Redeploy* on the latest commit).
7. Visit the production alias (e.g. `portal-arxys.vercel.app`). It's protected by Vercel SSO; auth with your Vercel account, then the Next.js default landing page should render.
8. **Link this working copy to the `portal` project so the CLI is unambiguous:**

   ```bash
   vercel link --yes --project=portal
   ```

   This writes `.vercel/project.json` (already gitignored). Without it, `vercel deploy` from this folder will prompt to pick a project — and if you (or another tool, including another Claude Code session) accept the first option, an unrelated codebase can land on `portal-arxys.vercel.app` as a manual production deploy. See the recovery procedure in §13.
9. **Keep a separate placeholder project per sibling app** (e.g. `forecast`, `arxys-com`). When unrelated repos on the same Mac run `vercel deploy`, the CLI's "link to existing project?" prompt should have a clear correct destination. With only one project in the org, the prompt's only suggestion is `portal`, which is exactly how the Portal got clobbered once. Create empty projects in the Vercel dashboard — no GitHub connection needed.

## 11. GitHub SSH multi-account setup

If your default GitHub identity is for a different organization and you need a dedicated key for the `Arxys-Projects` org, do this once:

```bash
ssh-keygen -t ed25519 -C "your-email@arxys.com (Arxys Portal)" -f ~/.ssh/id_ed25519_arxys -N ""
chmod 600 ~/.ssh/id_ed25519_arxys
chmod 644 ~/.ssh/id_ed25519_arxys.pub
```

Append to `~/.ssh/config` (create the file with mode 600 if it doesn't exist):

```ssh-config
Host github.com-arxys
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_arxys
  IdentitiesOnly yes
  AddKeysToAgent yes
  UseKeychain yes
```

Add `~/.ssh/id_ed25519_arxys.pub` to your Arxys-Projects GitHub account at `https://github.com/settings/keys`.

Always use the alias in remote URLs: `git@github.com-arxys:Arxys-Projects/Portal.git` (not plain `github.com:`). See [`decisions/0007-ssh-multi-account-github.md`](./decisions/0007-ssh-multi-account-github.md).

## 12. Day-to-day commands

| Task | Command |
|---|---|
| Start dev server | `npm run dev` |
| Build + type-check | `npm run build` |
| Lint | `npm run lint` |
| Run unit tests (recommendation algorithm, etc.) | `npm test` |
| Direct TypeScript check (faster than `next build`'s in-process check) | `npx tsc --noEmit` |
| Run RLS regression suite | `node --env-file=.env.local --import tsx scripts/test-rls.ts` |
| Create a new admin user | `node --env-file=.env.local --import tsx scripts/bootstrap-admin.ts --email ... --name ... --company ...` |
| New migration | `supabase migration new <name>` (creates a timestamped empty SQL file) |
| Apply pending migrations | `SUPABASE_DB_PASSWORD='...' supabase db push` |
| Read cloud schema | curl PostgREST: `curl -H "apikey: $SERVICE_KEY" $SUPABASE_URL/rest/v1/` |
| Patch cloud auth config | `curl -X PATCH -H "Authorization: Bearer $PAT" -d '{...}' https://api.supabase.com/v1/projects/<ref>/config/auth` |

## 13. Troubleshooting

- **`next build` fails with `Cannot find module 'next/types.js'`**: stale `node_modules`. `rm -rf node_modules .next && npm ci && npm run build`.
- **`git push` returns 403**: macOS Keychain has a cached identity from a different GitHub account. Check `git remote -v` uses `github.com-arxys:...`, not `github.com:...`.
- **Vercel deployment shows 404 on `/`**: Framework Preset is unset. Settings → General → Framework Preset → Next.js → Save → Redeploy.
- **`source .env.local` in bash fails on `SMTP_PASS`**: Gmail app passwords contain spaces. Use `node --env-file=.env.local` instead of sourcing.
- **`supabase login` errors with "Could not create the CLI sign-in session"**: use a PAT — `supabase login --token sbp_...`. Browser flow is unreliable.
- **`supabase db dump` complains about Docker**: install Docker Desktop, or skip — `db dump` is for local-dev workflows. Cloud verification is `db push` + the test-rls script.
- **`portal-arxys.vercel.app` is serving a different app** (e.g. shows "Arxys Forecast" or any non-Portal content): another `vercel deploy` was promoted to production from the wrong folder — typically a sibling Claude Code session that ran `vercel deploy` via Terminal.app, hit the "link to existing project?" prompt, and accepted `portal` because no other project existed in the org. Recovery:
  1. Confirm: `vercel inspect https://portal-arxys.vercel.app` — the `target=production` deployment will be from an unexpected commit/source.
  2. Force the GitHub webhook to redeploy `main`:
     ```bash
     git commit --allow-empty -m "chore: redeploy"
     git push
     ```
     Vercel auto-promotes the resulting build because `main` is the Production Branch.
  3. Verify: `vercel inspect https://portal-arxys.vercel.app` shows the new deployment Ready and `curl -sI https://portal-arxys.vercel.app/login` returns the Portal.
  4. Prevention: do §10 step 8 (`vercel link`) in this folder and §10 step 9 (create sibling Vercel projects) so the next stray `vercel deploy` has somewhere else to land.
