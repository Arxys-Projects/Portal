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

The migrations live in `supabase/migrations/` (21 files as of 2026-06-16; applied in timestamp order by `db push`):

**Foundation (2026-05)**
- `20260515193702_initial_schema.sql` — `partners`, `products` (placeholder), `server_specs` (placeholder), `submissions`, RLS, `is_admin()`.
- `20260519052732_step5_submissions_and_seeds.sql` — `submissions.groups_payload`, server_specs bandwidth-gate relaxation, 6 placeholder family rows.
- `20260521190350_step3_4_products_sku_pk.sql` — replaces `products` + drops `server_specs`; new SKU-PK shape with inline `max_cameras` + `max_storage_tb`; migrates `submissions.recommended_product_id` UUID → TEXT; seeds 6 mid-tier VideoX SKUs with real MSRPs. See [ADR 0031](./decisions/0031-step-3-4-schema-migration.md) and [ADR 0032](./decisions/0032-sku-level-recommendation-algorithm.md).

**Phase 3–4 and product_specs (2026-05 – 2026-06)** — adds `product_specs` (bandwidth / storage specs), `camera_specs`, `submission_revisions`, and various column/index additions. See the individual SQL files for detail.

**Phase 10 — Project Quote (2026-06-16)**
- `20260616000001_phase10_camera_search_rpc.sql` — `camera_aliases_text` immutable helper + `search_camera_specs` SECURITY INVOKER RPC + trigram indexes; powers the calculator camera-model picker.
- `20260616000002_phase10_project_quotes.sql` — `project_quotes` table (immutable snapshot store); RLS: partner SELECT/INSERT blocked, internal/admin SELECT allowed, internal INSERT-for-self allowed, UPDATE/DELETE blocked for everyone. Paired with the 19a–19h `test-rls.ts` block. **Applied to cloud 2026-06-16; confirmed applied in the Step 6 stop-and-flag.**

Apply them to a fresh project:

```bash
SUPABASE_DB_PASSWORD='<db-password>' supabase db push
```

You'll be prompted to confirm. Type `Y`. The CLI runs all files in timestamp order. The 2026-05-21 migration is destructive: it `drop ... cascade`s the prior `products` + `server_specs` tables. On a fresh project this is a no-op; on an existing project, see `supabase/rollback/step-3-4-rollback.sql` + `scripts/backup-tables.ts` before re-running.

For a true reset on a cloud project, drop the schema from the dashboard SQL editor and re-push.

## 6a. Push the Master Sheet to the portal (Supabase) and/or Pipedrive

`products` is **append-only** (migration `20260702000001`): each price change is a new
row for the SKU with its own `effective_date`, and the portal + Excel read the
`current_products` view (latest row with `effective_date <= today`). Pipedrive is **never**
pushed automatically — only an explicit `--target` run pushes it. `push-prices.ts` takes
`--target=portal|pipedrive|all` (default `all`).

After applying migrations, `products` has 6 V-family seed rows. Load the full ~36-row Sheet:

```bash
# 1. Pre-push backups (both targets)
node --env-file=.env.local --import tsx scripts/backup-tables.ts pre-step-5-6-real-pricing
node --env-file=.env.local --import tsx scripts/backup-pipedrive-products.ts

# 2. Dry-run — review the preview (old→new price, effective date, Touches Pipedrive: Y/N)
node --env-file=.env.local --import tsx scripts/push-prices.ts --dry-run

# 3. Real push — portal + Pipedrive, effective today (the monthly cycle) — type CONFIRM
node --env-file=.env.local --import tsx scripts/push-prices.ts
```

Split usage (decoupled effectivity):

```bash
# Portal only — stage prices now, effective on a FUTURE date (portal/Excel adopt it that day)
node --env-file=.env.local --import tsx scripts/push-prices.ts --target=portal --effective-date=2026-08-01

# Portal only — effective today (default effective date)
node --env-file=.env.local --import tsx scripts/push-prices.ts --target=portal

# Pipedrive only — push current-as-of-today prices, whenever you choose (idempotent)
node --env-file=.env.local --import tsx scripts/push-prices.ts --target=pipedrive
```

Expected on the first `--target=all` run: ~30 new versioned rows + the 6 seed SKUs get a
new version, 0 Supabase errors. Pipedrive row counts depend on the account (all 36 SKUs may
already exist as updates). Every mode is idempotent: `portal` re-runs only version changed
SKUs (same-day re-runs overwrite that day's row); `pipedrive` re-runs push only rows that
differ from live Pipedrive, so a second run is a no-op.

Capacity columns (`max_cameras`, `max_storage_tb`) are preserved automatically — the script
carries the SKU's current values forward into each new versioned row.

**Retiring a SKU (EOL or rename).** Deactivate the SKU in the portal (`active=false`) — this
hides it from partners + the Excel export. Pipedrive retirement is now automatic: the next
`push-prices.ts --target=pipedrive` (or `--target=all`) run archives any portal-inactive SKU
in Pipedrive (`active_flag=false`, **not** delete — deal history preserved), instead of
re-pushing it active. The dry-run preview lists them under `[Pipedrive ARCHIVE …]`; review it
first. Idempotent — an already-archived SKU is skipped. No separate archive step or hardcoded
SKU list to maintain. See ADR 0078.

```bash
# Preview what will be pushed AND archived, then push
node --env-file=.env.local --import tsx scripts/push-prices.ts --target=pipedrive --dry-run
node --env-file=.env.local --import tsx scripts/push-prices.ts --target=pipedrive
```

## 6b. Supabase: load the camera_specs seed

The calculator's camera-model picker reads `camera_specs` reference data. Load each per-vendor seed file through the validated, idempotent loader. Single-sensor files load first, then the multisensor extension files (ADR 0058, 0071). Each file is validated before any write and upserts on the `(vendor, model)` natural key, so re-running applies only changed rows.

```bash
# Pre-load backup (covers camera_specs)
node --env-file=.env.local --import tsx scripts/backup-tables.ts

# Validate, then load each file (dry-run first; type CONFIRM at the prompt to write)
for f in axis hanwha avigilon; do
  node --import tsx scripts/validate-camera-specs.ts data/$f-camera-specs.json
  node --env-file=.env.local --import tsx scripts/load-camera-specs.ts data/$f-camera-specs.json --dry-run
  node --env-file=.env.local --import tsx scripts/load-camera-specs.ts data/$f-camera-specs.json
done

# Multisensor extension files
for f in axis hanwha avigilon; do
  node --import tsx scripts/validate-camera-specs.ts data/$f-camera-specs-multisensor.json
  node --env-file=.env.local --import tsx scripts/load-camera-specs.ts data/$f-camera-specs-multisensor.json --dry-run
  node --env-file=.env.local --import tsx scripts/load-camera-specs.ts data/$f-camera-specs-multisensor.json
done
```

Expected on a fresh project: 68 single-sensor rows then 39 multisensor rows, 107 total (Axis 35, Hanwha 42, Avigilon 30). A re-run reports `0 new` with the file's row count as updates.

## 7. Supabase: verify RLS

```bash
node --env-file=.env.local --import tsx scripts/test-rls.ts
```

Expected output ends with `All authenticated RLS tests passed.` and zero failures. The suite provisions two ephemeral test users, runs cross-partner access checks, and tears them down — there should be no residual state in the cloud project afterwards.

If you don't have `tsx` installed yet: `npm install --save-dev tsx`.

Then round-trip the live `product_specs` rows through the admin form's own zod schema:

```bash
node --env-file=.env.local --import tsx scripts/roundtrip-product-specs.mts
```

Read-only — a single `SELECT`, no writes. Expected output ends with `All 21 live rows parse
clean through the form's own schema, preserve every value, and every live column is
reachable.` Three `WARN` lines about the V100 rows carrying `raid_level_display = 'NA'` are
expected until those rows are corrected through the form (design §7 step 6); warnings do not
fail the run.

This is the acceptance check for the `/admin/specs` form, and it catches a class of bug the
unit tests structurally cannot — see [ADR 0096](./decisions/0096-product-specs-canonical-admin-editable.md)
and the script's own header.

Then the same check for the `/admin/appliance-specs` form:

```bash
node --env-file=.env.local --import tsx scripts/roundtrip-appliance-specs.mts
```

Also read-only. On a fresh project `appliance_specs` is **empty** — the seven management / ACM /
workstation rows are typed in through the admin form and are never seeded by a migration
([ADR 0097](./decisions/0097-datasheet-surfaces-join-admin-editable-pattern.md) §8) — so the
expected output is `0 rows — nothing to round-trip yet, coverage unchecked.` and exit 0. Once
the rows are entered it reports `7 live rows … every live column is reachable`.

## 8. Supabase: configure auth URLs

In the dashboard at **Authentication → URL Configuration**:

- **Site URL**: `https://portal.arxys.com` (canonical custom domain, live since 2026-05-26). This is the host baked into every email link via `{{ .SiteURL }}`, so it must be the production domain — not the vercel.app fallback.
- **Redirect URLs** (Allow List):
  - `http://localhost:3000/**`
  - `https://portal.arxys.com/**`
  - `https://portal-arxys.vercel.app/**` (no-cost fallback domain)
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

## 8c. Supabase: enable leaked-password protection

In the dashboard at **Authentication → Sign In / Providers → Password** (Auth settings), enable **Leaked password protection**. This rejects passwords found in the HaveIBeenPwned breach corpus at signup/reset. It's off by default and is flagged by the Security Advisor; the Portal is invite-only with passwords, so it's a free hardening win. Dashboard-only — there is no migration for it. See ADR [0053](./decisions/0053-security-advisor-function-grants.md).

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

## 11a. Adding product / rear-panel photos for the datasheet

The datasheet reads its two photo frames from files under `public/`, not from Supabase storage
([ADR 0107](./decisions/0107-datasheet-photos-are-public-paths.md)), so a new shot arrives by
deploy. The intake convention is [ADR 0108](./decisions/0108-product-photo-intake.md).

1. Drop the raw shots into `staging/product-photos/` (gitignored — create it if absent):
   ```bash
   mkdir -p staging/product-photos
   ```
2. Rename each into `public/datasheet/` as `{model}-front.png` or `{model}-rear.png`, model
   lowercased:
   ```bash
   mv "staging/product-photos/Videox-V400.png" public/datasheet/v400-front.png
   mv "staging/product-photos/V400 -rear.png"  public/datasheet/v400-rear.png
   ```
3. Confirm each is a PNG and check whether it carries a real alpha channel. Alpha is preserved
   where the source has it and never manufactured where it does not:
   ```bash
   file public/datasheet/v400-*.png
   ```
   `8-bit/color RGBA` means an alpha channel is present; `RGB` means the background is baked
   in. Both are acceptable — the frame is `objectFit: contain` on a white page. Note this is a
   smoke test only: it cannot tell a *used* alpha channel from one that is opaque everywhere,
   which passes the header check and still renders a hard rectangle. If that distinction
   matters, render and look (step 4).
4. Visual check — render the sheet and look at the page-1 hero and the page-2 rear I/O panel:
   ```bash
   node --env-file=.env.local --import tsx scripts/render-datasheet.ts --model V400
   ```
   This writes `staging/v400-datasheet.pdf` (gitignored) and is a **real V400 datasheet**: it
   uses the same adapters, copy and template the portal's download route uses, so what you
   see is what a partner would get. It reports the page count against what the template is
   specced at, and names any spec gaps.
   Note the ordering, which changed with ADR 0110: the script reads the photo path **off the
   live row**, so the frame stays held until step 5 has saved the path. Do step 5, then
   re-run this to see the photo land. Run it from the repo root, since `loadPng` resolves
   against the working directory.
5. Paste the path into the admin form's **Datasheet content → Product photo path** /
   **Rear I/O photo path** fields, as `/datasheet/v400-front.png`. The form is the only
   supported write path for these columns — never `UPDATE product_specs` / `appliance_specs`
   directly. The form warns on a URL, a missing leading slash, or a non-`.png` extension.
6. Commit the files and deploy. A path saved before the file ships renders an empty frame,
   indistinguishable from "not shot yet".

Design targets: the page-1 hero frame is 720×240 at the sheet's full measure, the rear I/O
frame 720×200. Sources at those pixel dimensions fill the frame exactly. Tighter cropping
helps — surplus whitespace baked into the canvas shrinks the drawing inside a `contain` fit.

**Those targets are the Ledger template's** — the two-column server sheet used by the V100–V800
NVRs and the V250/V255 management servers. The SW workstations use a different template ("Rail",
a single page with a 214px left rail), whose photo slot is **513×110 bleeding right by the 44px
content padding, so a 557×110 source is correct there**. Establish which template a photo belongs
to before judging its dimensions; `datasheets/design_handoff_videox_datasheet/README.md` is the
authority on both. A workstation photo is checked in its own frame with the Rail render script,
which reads the path straight off the live row:

```bash
node --env-file=.env.local --import tsx scripts/render-datasheet.ts --model SW10
```

Genuinely off-size sources still render, but badly, and the fit is `contain` so the failure is
silent — an undersized hero upscales to meet the measure (softening it) and then letterboxes,
and a hero with a baked background stops reaching the frame edges and reads as unfinished. There
is no error either way. Check the render against the right template, not just the file.

## 11b. Generating a datasheet from the portal

Datasheets are generated on demand from the live spec tables — there is no snapshot, so a
download always states today's specs ([ADR 0110](./decisions/0110-datasheet-generation-in-the-portal.md)).

1. Sign in as an admin or an internal partner and open **Admin → Datasheets**
   (`/admin/datasheets`). Access is admin-and-internal for now; the intent is to widen it to
   every signed-in partner once the authored copy has had a marketing pass, which is a
   one-line change in `src/lib/datasheet/guard.ts`.
2. Click **Download PDF** on a model. That is `GET /api/datasheet/{model}` — **one sheet per
   SHEET, not per SKU**: `/api/datasheet/V400` renders one sheet whose ordering table lists
   VX5-V400-128, -160 and -192, and `/api/datasheet/V250` renders the "V250 / V255" sheet
   covering both management variants. `/api/datasheet/V255` resolves to that same sheet. A
   part number is not a valid path segment.
3. Read the two coloured boxes on a card before sending the PDF anywhere:
   - **Red, "needs fixing before sending to a customer"** — the PDF comes out defective.
     Today the only such check is a `usage_paragraph` over 324 characters, which pushes the
     footer onto a fourth page. Shorten it in **Admin → Product Specs**.
   - **Amber, "renders with gaps"** — blank spec columns that are honestly left off the
     sheet. Fill them in through the spec form; never `UPDATE` the table directly.
4. Three of the fourteen models have no sheet and say so on their own card: the ACM rows
   V150, V260 and V265, because no template was ever designed for the access control line.
5. The **V250 / V255** sheet renders, but prints an em dash for throughput and cameras
   managed until those figures are entered on **Admin → Appliance Specs** — neither is on the
   source factsheet, so nothing is assumed. Fill *Cameras managed — to* on the V250 (a
   ceiling) and *Cameras managed — from* on the V255 (a floor); see
   [ADR 0111](./decisions/0111-management-is-a-ledger-variant.md). This needs migration
   `20260731000001` applied first — [apply note](./apply-notes/0111-management-cameras-managed.md).

To render the same sheets locally, byte-for-byte what the route produces:

```bash
node --env-file=.env.local --import tsx scripts/render-datasheet.ts --all
```

That writes every sheet into `staging/` and checks each against its specced page count —
Ledger 3, Rail 1, both with little slack. Run it after changing anything on a page, because
an overflow is silent in a PDF reader.

**If a deployed sheet renders held frames or dashed warranty circles where the local render
shows real images, the asset trace is the cause, not the data.** Every datasheet asset is read
off disk through `process.cwd()`, which `@vercel/nft` cannot trace, so `next.config.ts` lists
them explicitly under `outputFileTracingIncludes` for `/api/datasheet/*`. Adding an asset in a
new directory means adding it there too. The PNG failure mode is silent — `loadPng` catches
and returns null — while a missing font fails the render outright.

## 12. Day-to-day commands

| Task | Command |
|---|---|
| Start dev server | `npm run dev` |
| Build + type-check | `npm run build` |
| Lint | `npm run lint` |
| Run unit tests (recommendation algorithm, etc.) | `npm test` |
| Direct TypeScript check (faster than `next build`'s in-process check) | `npx tsc --noEmit` |
| Run RLS regression suite | `node --env-file=.env.local --import tsx scripts/test-rls.ts` |
| Round-trip live `product_specs` through the admin form's schema (read-only) | `node --env-file=.env.local --import tsx scripts/roundtrip-product-specs.mts` |
| Round-trip live `appliance_specs` through its admin form's schema (read-only) | `node --env-file=.env.local --import tsx scripts/roundtrip-appliance-specs.mts` |
| Render one datasheet from live spec data, read-only (any model, either template) | `node --env-file=.env.local --import tsx scripts/render-datasheet.ts --model V800` |
| Render every datasheet and check each against its specced page count | `node --env-file=.env.local --import tsx scripts/render-datasheet.ts --all` |
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
