# Supabase auth email templates — canonical source

These four HTML files are the **source of truth** for the Arxys-branded auth emails. The Supabase dashboard (Authentication → Email Templates) is the **deploy target only** — when these files change, copy the new HTML into the dashboard and update the subject line per the table below. If templates are ever edited directly in the dashboard, port the change back here the same day.

See [`docs/decisions/0025-supabase-custom-smtp-and-branded-templates.md`](../decisions/0025-supabase-custom-smtp-and-branded-templates.md) for the design rationale.

## Per-template subject lines

| File | Supabase template | Subject |
|---|---|---|
| [`invite.html`](./invite.html) | Invite user | `You're invited to the Arxys Partner Portal` |
| [`magic-link.html`](./magic-link.html) | Magic Link | `Your sign-in link for Arxys Partner Portal` |
| [`reset-password.html`](./reset-password.html) | Reset Password | `Reset your Arxys Partner Portal password` |
| [`confirm-signup.html`](./confirm-signup.html) | Confirm Signup | `Confirm your Arxys Partner Portal account` |

## Template variable

Only one Supabase template variable is referenced: `{{ .ConfirmationURL }}` (Go template syntax). Supabase substitutes the full verify URL at send time — leave it as-is.

## Logo hosting

Logo is `public/email/arxys-logo.png` in this repo, served absolutely as `https://portal-arxys.vercel.app/email/arxys-logo.png`. When the `portal.arxys.com` custom domain ships, update every occurrence in these four files **and** re-paste into Supabase.

## Brand tokens (locked)

Source: the `arxys-company` skill's Brand Identity section.

- Arxys Gold (CTA + accents): `#fbb040`
- Arxys Grey (borders only — too light for text): `#d1d2d4`
- Heading: `#1a1a1a` / Body: `#333333` / Footer: `#888888`
- Heading font: Montserrat 700 / Body: Montserrat 400
- Fallback stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`
- CTA text color: `#1a1a1a` (dark on Gold — WCAG AAA contrast; white on Gold fails AA)
