# Supabase auth email templates — canonical source

These four HTML files are the **source of truth** for the Arxys-branded auth emails. The Supabase dashboard (Authentication → Email Templates) is the **deploy target only** — when these files change, copy the new HTML into the dashboard and update the subject line per the table below. If templates are ever edited directly in the dashboard, port the change back here the same day.

See [`docs/decisions/0025-supabase-custom-smtp-and-branded-templates.md`](../decisions/0025-supabase-custom-smtp-and-branded-templates.md) for the design rationale.

## Per-template subject lines

| File | Supabase template | Subject |
|---|---|---|
| [`invite.html`](./invite.html) | Invite user | `You're invited to the Arxys Partner Portal` |
| [`magic-link.html`](./magic-link.html) | Magic Link | `Your sign-in link for Arxys Partner Portal` |
| [`reset-password.html`](./reset-password.html) | Reset Password | `Set or reset your Arxys Partner Portal password` |
| [`confirm-signup.html`](./confirm-signup.html) | Confirm Signup | `Confirm your Arxys Partner Portal account` |

## Template variables and the CTA URL

These templates use `{{ .SiteURL }}` and `{{ .TokenHash }}` (Go template syntax) and construct the CTA URL manually — they do **not** use `{{ .ConfirmationURL }}`. The reason is that `{{ .ConfirmationURL }}` resolves to Supabase's legacy `/auth/v1/verify` endpoint, which returns the session as a URL **fragment** (`#access_token=...`). Our `/auth/confirm` route handler (`src/app/auth/confirm/route.ts`) reads `token_hash` + `type` from **query params** (modern OTP / `@supabase/ssr` PKCE flow) — fragments are invisible to it server-side, so a `{{ .ConfirmationURL }}` link redirects through `/login?error=missing_token`.

The CTA URLs constructed by these templates land directly on our route handler with the right query params, no Supabase round-trip:

| Template | CTA `href` |
|---|---|
| `invite.html` | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/reset-password` |
| `magic-link.html` | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next=/dashboard` |
| `reset-password.html` | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password` |
| `confirm-signup.html` | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/dashboard` |

In the HTML these appear with `&amp;` for ampersands (XML-escaped) — Supabase does not double-escape them; the email client decodes the entities back to `&` before opening the link. Do not change to literal `&`.

`{{ .SiteURL }}` resolves to Supabase Auth → URL Configuration → Site URL — keep that field aligned with the current portal production URL.

## Logo hosting

Logo is `public/email/arxys-logo.png` in this repo, served absolutely as `https://portal.arxys.com/email/arxys-logo.png` (the canonical custom domain, live since 2026-05-26). If the canonical domain ever changes, update every occurrence in these four files **and** re-paste into Supabase.

## Brand tokens (locked)

Source: the `arxys-company` skill's Brand Identity section.

- Arxys Gold (CTA + accents): `#fbb040`
- Arxys Grey (borders only — too light for text): `#d1d2d4`
- Heading: `#1a1a1a` / Body: `#333333` / Footer: `#888888`
- Heading font: Montserrat 700 / Body: Montserrat 400
- Fallback stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`
- CTA text color: `#1a1a1a` (dark on Gold — WCAG AAA contrast; white on Gold fails AA)
