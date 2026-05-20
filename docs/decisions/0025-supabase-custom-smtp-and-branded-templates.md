# 0025 — Custom SMTP and branded auth email templates in Supabase

- **Status**: Accepted
- **Date**: 2026-05-20

## Context

First live test of the Step 9 invite flow surfaced two onboarding blockers:

1. Supabase's default invite email ships from `noreply@mail.app.supabase.io` with generic "Powered by Supabase" copy and a sending-domain reputation that lands in Spam at most corporate tenants.
2. The link in the email landed on Vercel's own SSO page (Vercel Deployment Protection was enabled on Production), surfacing a "no Vercel account for this email" error and sending a Vercel-branded "registration" email to the invitee.

The Vercel issue is fixed by toggling Production Deployment Protection off (a separate dashboard change, not covered by this ADR). This ADR covers the email side.

## Options considered

- **Customise the Supabase template only, leave Supabase's SMTP in place.** Cheapest but still ships from `mail.app.supabase.io` — sending-domain reputation problem unsolved.
- **Switch only the invite to a custom `generateLink` + nodemailer flow.** Pixel-perfect HTML control for invites, but reset-password and magic-link still flow through Supabase's defaults — fixes 25% of the problem, requires maintaining a parallel path.
- **Custom SMTP in Supabase + customise all four templates.** Single configuration change fixes every auth email at once; reuses the Gmail Workspace SMTP already proven by the calculator notification path (ADR [0002](./0002-gmail-smtp-over-siteground.md)).

## Decision

**Custom SMTP via Gmail Workspace + Arxys-branded templates for all four flows** (Invite, Magic Link, Reset Password, Confirm Signup).

- SMTP: `smtp.gmail.com`, port `587` (STARTTLS — the port Supabase recommends; the existing nodemailer path uses `465`/SSL with the same host, both work against Gmail).
- Sender display: `Arxys Partner Portal <sales@arxys.com>`. Reply-To: `sales@arxys.com` (replies route to the monitored sales mailbox).
- The username Supabase authenticates as is the Google account that owns the App Password (currently `andy.newbom@arxys.com` per ADR 0002). `sales@arxys.com` must be configured as a "Send mail as" alias on that account, exactly as it already is for the calculator notification path.
- Canonical template HTML lives in [`docs/email-templates/*.html`](../email-templates/) — version-controlled, code-reviewable.
- Supabase dashboard is the deploy target only; if templates are edited there directly, the change must be ported back to the repo within the same day.
- Brand colors and fonts pulled from the `arxys-company` skill's Brand Identity section (Gold `#fbb040`, Grey `#d1d2d4`, Montserrat 400/700 with system fallback stack). Arxys Grey is used for borders only — its 1.7:1 contrast against white fails WCAG for text. CTA uses dark text on Gold (9.5:1, AAA) rather than white (2.0:1, fails AA).
- Logo hosted at `public/email/arxys-logo.png`, referenced absolutely as `https://portal-arxys.vercel.app/email/arxys-logo.png` (the current production URL — update when the `portal.arxys.com` custom domain lands).
- **CTA URL uses `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<flow>&next=<path>`** — NOT `{{ .ConfirmationURL }}`. The legacy `{{ .ConfirmationURL }}` variable resolves to Supabase's `/auth/v1/verify` endpoint, which returns the session as a URL fragment (`#access_token=...`). Our `/auth/confirm` route handler (`src/app/auth/confirm/route.ts`) reads `token_hash` + `type` from **query params** (modern OTP / `@supabase/ssr` PKCE flow); URL fragments are invisible to it server-side, so a `{{ .ConfirmationURL }}` link redirects through `/login?error=missing_token`. Constructing the URL with `{{ .TokenHash }}` lands directly on our handler with the right shape — no Supabase verify round-trip, no fragment.

## Consequences

**Positive:**

- All Supabase auth emails (invite, magic link, reset password, confirm signup) ship Arxys-branded from a domain with established DKIM via Google Workspace.
- No new infra — reuses the existing Gmail SMTP credentials and the existing `sales@arxys.com` alias.
- Future auth flows added by Supabase (e.g. email change) inherit the branded chrome.
- Templates are in the repo, so anyone reading the codebase can see the actual onboarding copy without dashboard access.

**Negative:**

- Two places to update if the Gmail App Password rotates: Vercel env (`SMTP_PASS`) and Supabase Auth → SMTP Settings.
- Supabase template editor is the only deploy path; no scripted sync. Drift is possible if templates are edited in-dashboard.
- Hard-coded `portal-arxys.vercel.app` in the logo URL and the `mailto:` footer — must be updated when a custom domain ships. Tracked in this ADR's "When to revisit."
- App Password remains bound to `andy.newbom@arxys.com` (per ADR 0002) — Supabase auth mail and calculator notification mail share that single point of failure.

## When to revisit

- When `portal.arxys.com` (or another custom domain) goes live, update the Site URL in Supabase and every `portal-arxys.vercel.app` reference inside `docs/email-templates/*.html`. Re-paste into Supabase.
- If Gmail Workspace sending limits become a bottleneck (~2000 messages/day per account), migrate to a transactional provider (Resend, Postmark) and update the Supabase SMTP block.
- If the Supabase template editor proves too restrictive (no variables we need, weird HTML stripping), switch the invite flow specifically to `generateLink` + nodemailer.
