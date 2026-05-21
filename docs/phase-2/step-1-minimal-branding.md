# Phase 2 Step 1 — Minimal portal branding (scoping brief)

> **For a fresh chat session.** Reads cold. Self-contained. No prior conversation needed.
>
> **Model recommendation**: Sonnet (default Claude Code), no extended thinking. This step is ~3-5 file edits; deep reasoning isn't needed.

## What Step 1 is

Give the portal its first visible Arxys identity. Two outputs:

1. **Arxys logo** in the app header (both the authed-app shell and the auth pages — login, forgot-password, reset-password).
2. **Arxys Gold (`#fbb040`)** on primary action buttons across the app.

Half-day of work. Independent — doesn't depend on any other Phase 2 step. Ships first so internal testers see brand identity from day one of Phase 2.

## What Step 1 is NOT

- Not a full design system / component refactor. Touch only what the two outputs above require.
- Not a Montserrat font rollout. Body stays on system fonts. Defer typography to a later step (Step 8 if reached).
- Not a dark-mode pass. ADR [0026](../decisions/0026-light-mode-only-in-phase-1.md) keeps the portal light-mode-only.
- Not a color overhaul. Secondary buttons (`Admin`, `Sign out`, table actions, etc.) stay on the current neutral palette. Only **primary** buttons get Gold.
- Not a logo replacement effort. Use the existing Arxys Gold wordmark at `public/email/arxys-logo.png` unless Andy supplies a higher-res version (see Open Q1).

## Context to read before touching code

In this order:

1. **[`AGENTS.md`](../../AGENTS.md)** — Next.js 16 caveat ("This is NOT the Next.js you know") + three-doc discipline. Skim the relevant guide in `node_modules/next/dist/docs/` if you reach for Next.js APIs you're uncertain about.
2. **[`docs/phase-2-plan.md`](../phase-2-plan.md)** — Phase 2 work-unit table + locked decisions.
3. **[`docs/decisions/0025-supabase-custom-smtp-and-branded-templates.md`](../decisions/0025-supabase-custom-smtp-and-branded-templates.md)** — **brand tokens canon source.** Arxys Gold `#fbb040` (CTA + accents), Arxys Grey `#d1d2d4` (borders only — too light for text). CTA text color `#1a1a1a` on Gold (WCAG AAA 9.5:1; white-on-Gold fails AA at 2.0:1).
4. **[`docs/decisions/0026-light-mode-only-in-phase-1.md`](../decisions/0026-light-mode-only-in-phase-1.md)** — light-mode-only constraint; don't reintroduce `prefers-color-scheme: dark`.
5. **[`src/app/globals.css`](../../src/app/globals.css)** — current Tailwind v4 setup (config-less; uses `@theme` directive inline in CSS). No `tailwind.config.ts` exists; brand tokens go in `globals.css` via `@theme`.
6. **[`src/app/(app)/layout.tsx`](../../src/app/(app)/layout.tsx)** — current app shell header. Line 46-87. Currently renders "Arxys Partner Portal" as text — that's the swap target.
7. **[`src/app/(auth)/layout.tsx`](../../src/app/(auth)/layout.tsx)** — auth-page card. Currently renders the same text title. Logo goes here too.

## Andy's prereqs / decisions (please do or confirm before code starts)

1. **Logo asset decision (Open Q1 — call below).** Either:
   - (a) Reuse `public/email/arxys-logo.png` (250×43, transparent, Arxys Gold wordmark). May pixelate slightly when rendered at portal-header sizes on retina; usually acceptable.
   - (b) Provide a higher-res version (recommended ~600×100 PNG with transparent BG, or SVG). If supplied, drop at `public/arxys-logo.png`. The email logo at `public/email/arxys-logo.png` stays untouched — email templates reference that path absolutely.
   - **Andy decision**: which one, and if (b), provide the file.

2. **Confirm primary-button audit (Open Q2).** Below is the assistant's first-pass list of primary buttons across the app — please add/remove anything missed before code starts:
   - `/login` submit ("Sign in")
   - `/forgot-password` submit ("Send reset link")
   - `/reset-password` submit ("Set password" / "Reset password")
   - `/calculator` submit ("Save & submit calculation")
   - `/admin/partners/new` submit ("Invite partner")
   - Row actions on `/admin/partners`: "Suspend" — **leave neutral**, this is a destructive action; warn/danger semantic is more important than brand
   - Row actions: "Reactivate", "Resend Invite" — neutral

3. **No dashboard/Vercel/Supabase config changes needed for this step.** Pure code change.

## Code work — file-by-file task list

### 1. `src/app/globals.css` — add brand tokens to the `@theme` block

Tailwind v4 setup is config-less: theme tokens live inline via the `@theme` directive in `globals.css`. Add:

```css
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  /* NEW — Arxys brand tokens. Source: ADR 0025. */
  --color-arxys-gold: #fbb040;
  --color-arxys-gold-hover: #e69e2c;  /* ~10% darker for hover */
  --color-arxys-text-on-gold: #1a1a1a; /* WCAG AAA on Gold */
  --color-arxys-grey: #d1d2d4;         /* borders only */
}
```

This makes Tailwind classes `bg-arxys-gold`, `hover:bg-arxys-gold-hover`, `text-arxys-text-on-gold`, `border-arxys-grey` available everywhere.

### 2. Logo asset

- If Andy chose Q1(a): no asset change. Reference `/email/arxys-logo.png` from the layout files.
- If Andy chose Q1(b): drop the supplied logo at `public/arxys-logo.png`. Don't modify `public/email/arxys-logo.png`.

### 3. `src/app/(app)/layout.tsx` — swap text title for logo

Replace lines 50-64 (the current `<div>` with text title + partner info) with:

```tsx
<div className="flex items-center gap-3">
  <img
    src="/arxys-logo.png"  // or /email/arxys-logo.png per Q1
    alt="Arxys"
    width={140}
    height={24}
    style={{ height: "auto" }}
  />
  {partner ? (
    <p className="text-xs text-neutral-500">
      {partner.company_name} · {partner.contact_name}
      {partner.role === "admin" ? " · admin" : null}
    </p>
  ) : (
    <p className="text-xs text-amber-600">
      Your account is missing a partner record. Contact an admin.
    </p>
  )}
</div>
```

Note: use plain `<img>`, not `next/image` — the logo is small, served from `public/`, no real benefit from Next's image optimization at this size. (`next/image` with a static `public/` asset works but adds a layout shift unless `priority` is set; not worth the complexity.)

### 4. `src/app/(auth)/layout.tsx` — add logo to auth card

Replace the existing `<h1>` (lines 7-11) with the logo:

```tsx
<div className="mb-6 text-center">
  <img
    src="/arxys-logo.png"  // or /email/arxys-logo.png per Q1
    alt="Arxys Partner Portal"
    width={140}
    height={24}
    style={{ height: "auto", display: "inline-block" }}
  />
</div>
```

The visual subtext ("Partner Portal") is dropped from the auth card because the logo conveys "Arxys" and the page context (login form, reset form) is unambiguous.

### 5. Update primary buttons across the app

For each button in the Q2 audit list, swap the current `bg-*` and `text-*` classes for:

```tsx
className="rounded bg-arxys-gold px-4 py-2 text-sm font-semibold text-arxys-text-on-gold hover:bg-arxys-gold-hover disabled:opacity-50"
```

Sizes/padding (`px-4 py-2`) and rounding can match the existing button style on each form for consistency — only the colors swap. Submit-pending state should keep its existing `disabled:opacity-50` or equivalent.

Don't update `Suspend` action buttons on `/admin/partners` — those should stay on a destructive-action style (probably the current red or neutral; whichever is there). Brand color on a destructive action confuses semantics.

## Tailwind v4 specifics — heads-up

This project uses Tailwind v4 (via `@tailwindcss/postcss` per `postcss.config.mjs`). There is **no `tailwind.config.ts`**. Don't reach for it. Theme tokens go in `globals.css` via `@theme`. If a Tailwind v3 doc page says to extend `theme.extend.colors`, that's the old API — the v4 equivalent is the `@theme inline { --color-foo: ... }` pattern shown above.

The Tailwind v4 docs live at `node_modules/tailwindcss/...` if you need to verify syntax mid-task.

## Verification gates

In order:

1. `npm run lint` — clean.
2. `npm test` — 19/19 still passing (these don't touch UI but make sure nothing regressed).
3. `npm run build` — turbopack, ~6s. Clean.
4. `npm run dev` → visit `localhost:3000`:
   - `/login` — logo visible in card, submit button is Gold.
   - `/forgot-password` — logo visible, submit Gold.
   - `/reset-password` — same.
   - After sign-in: `/dashboard` — logo in app header, navigation cards render unaffected.
   - `/calculator` — submit button Gold; everything else neutral.
   - `/admin/partners` — list renders; "Suspend" is NOT Gold; "Invite partner" CTA is Gold; row actions for Reactivate/Resend Invite are neutral.
5. Optional but recommended: open `localhost:3000/login` on a phone-sized viewport (devtools responsive mode); confirm logo doesn't overflow the auth card.

## Definition of done

- [ ] Brand tokens in `globals.css` `@theme`.
- [ ] Logo asset in place (per Q1 choice).
- [ ] Logo visible in app header on every authed page.
- [ ] Logo visible in auth card on `/login`, `/forgot-password`, `/reset-password`.
- [ ] All audited primary buttons render with `bg-arxys-gold` + dark text + Gold-hover.
- [ ] Destructive buttons (`Suspend`) untouched.
- [ ] All four verification gates pass.
- [ ] JOURNAL entry written — see "Docs check" below.
- [ ] Working tree clean; commit message in `docs:` or `feat(ui):` scope (project convention — see `git log --oneline -20`).
- [ ] Optional: push to `origin/main` only if Andy says so (don't push unprompted).

## Open questions to lock before starting

1. **Logo asset**: reuse `public/email/arxys-logo.png` (acceptable but ~250×43 — slight pixelation at desktop), or wait for Andy to supply a higher-res version at `public/arxys-logo.png`?
   - **Recommendation**: ask Andy first. If he doesn't have a higher-res version handy, fall back to the email logo — it's the same wordmark and will look crisp at the 140px header render size.

2. **Primary-button audit**: any buttons missing from the list above? Anything in the list that should stay neutral?
   - **Recommendation**: paste the list back at Andy and have him add/strike before code starts. Cheaper than a re-pass later.

3. **`<img>` vs `next/image`**: this brief recommends plain `<img>`. The new Next.js (16) supports `<Image>` with a `priority` prop to avoid layout shift on a static asset — slightly more code, slightly better LCP. Either works.
   - **Recommendation**: stick with `<img>`. The "minimal" framing in this brief argues for the simpler tag.

4. **Hover-color choice**: this brief proposes `#e69e2c` as Gold-hover (~10% darker). The email templates don't have a hover (emails don't have :hover state) so there's no canon source.
   - **Recommendation**: ship with `#e69e2c`. If Andy wants something else, swap the CSS var value — single source of truth.

## Docs check (per AGENTS.md three-doc discipline)

- **`docs/JOURNAL.md`**: append a new "Phase 2 Step 1 — minimal portal branding" entry at the top. Include the brand tokens added to `globals.css`, the logo asset decision (Q1 outcome), the primary-button audit list (final), and the verification result. Note this is the first `Phase 2 Step N` entry per ADR 0029.
- **`docs/RUNBOOK.md`**: probably no change. The brand tokens are part of the codebase, not the setup recipe. Unless Andy's logo asset workflow becomes part of "how to recreate from zero" — unlikely.
- **`docs/decisions/`**: probably no new ADR. Brand tokens are derived from the canon source (ADR 0025); button-color application is implementation, not architecture. Write an ADR only if a non-obvious choice surfaces during the work (e.g. if `<img>` vs `next/image` becomes contentious, or if you end up extending the brand palette beyond ADR 0025's tokens).

## Out of scope reminders (don't drift)

- No Montserrat. No font rollout.
- No `tailwind.config.ts`.
- No dark-mode toggle.
- No price-display work (that's Step 6).
- No new routes.
- No partner discount logic.
- No Pipedrive changes.

## Effort estimate

~3-4 hours of focused work including verification + JOURNAL entry. The longest variable is the primary-button audit pass — if there are 8-10 buttons across the app, each is a 30-second swap but they add up.

## When you finish

1. Make sure all four verification gates passed.
2. Write the JOURNAL entry.
3. Commit with a clear scope-prefixed message (`feat(ui):` or `docs:`).
4. **Don't push without Andy's nod** — current cadence is "commit locally, push on Andy's go."
5. Surface a brief summary back to Andy noting which files changed + that verification was clean.
