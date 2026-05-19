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

The migration is already in the repo at `supabase/migrations/20260515193702_initial_schema.sql`. To apply it to a fresh project:

```bash
SUPABASE_DB_PASSWORD='<db-password>' supabase db push
```

You'll be prompted to confirm. Type `Y`. The migration is idempotent on `pgcrypto` and uses `create extension if not exists`, so re-runs are safe up to that point — but Postgres will refuse to re-create tables that already exist. For a true reset, do it from the Supabase dashboard.

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
