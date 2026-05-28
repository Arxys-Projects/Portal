# Phase 3 Step 2 — Portal polish + Support + Docs scaffold + Deal-Reg email button

**Model:** Sonnet 4.6
**Schema:** None
**Blocker:** Step 1 (closed 2026-05-26)
**Predecessor patterns:** Phase 2 Step 1 (branding); Phase 2 Step 8a/8b (price book content shape)

## Overview

Phase 3 Step 2 ships the largest single batch of UI/content work in Phase 3: dashboard polish, shared footer extraction, price book content updates (header copy, images, Enterprise Grade box, H.265 card, link additions), a new Support card on the dashboard, a documentation scaffold per family, and a simple Deal-Registration email button. All changes are pure UI/content/email — no schema, no RLS changes, no migrations.

Large by item count, but each item is small and well-scoped. Pre-seeded content for the substantive text items is below; use verbatim where given.

## Manual prereqs (Andy)

Before the session starts:

1. **Image assets in place.** Copy these two files to `public/price-book/`:
   - `Windows_Server_2022.png` (shows both 2022 and 2025 editions)
   - `5_year_warranty-circle-2.png` (Five Year Warranty circular badge)
2. **Deal-reg email recipient.** Default: `process.env.INTERNAL_NOTIFICATION_EMAIL` (already configured per Phase 1 setup, sends to Andy). Confirm this is correct or override here.

## Pre-session reading (Claude Code)

In order:

1. `docs/JOURNAL.md` — top entry is Step 1 (domain cutover); Phase 2 closure entry below; Phase 2 Step 8a/8b entries explain the price book content conventions.
2. `docs/README.md` — three-doc discipline.
3. `docs/RUNBOOK.md` — relevant sections for env vars + email setup.
4. `docs/phase-3-plan.md` — current phase, scope, locked decisions.
5. This brief in full.

Then survey:

- `src/app/(app)/dashboard/page.tsx` — existing dashboard structure
- `src/app/(app)/price-book/page.tsx` — existing price book index
- `src/app/(app)/price-book/[slug]/page.tsx` — existing family detail page
- `src/lib/price-book/families.ts` — family data shape (especially `datasheetUrl`)
- `src/app/globals.css` — existing tokens: `--color-arxys-gold` (#fbb040), the navy variants, Poppins/Montserrat font stacks scoped to `.price-book-route`
- `src/lib/email/submission-notification.ts` — existing nodemailer pattern to mirror for deal-reg

## Code work

Ten items, suggested execution order. Items can split across commits.

### A1 — Dashboard title + card styling

**File:** `src/app/(app)/dashboard/page.tsx` (and `globals.css` if needed)

- Page title: change to **"Arxys Partner Dashboard"**
- Card headers: increase font size for clear hierarchy (target `text-xl` or equivalent ~18–20px)
- Card borders: increase width by 2–3px from current
- Page background: subtle off-white or light gray (e.g. `bg-neutral-50` or `bg-stone-50`) — not pure white
- Subtle card shadows for depth (`shadow-sm` or custom)

Verify all existing cards still render correctly after the styling change.

### A2 — Shared footer extraction

Survey first: locate the existing footer in the price book (likely in `src/app/(app)/price-book/page.tsx` or a layout component scoped to that route).

Steps:
1. Extract to `src/app/(app)/_components/footer.tsx` as a Server Component.
2. Replace the inline footer on the price book page with `<Footer />`.
3. Add `<Footer />` to the bottom of the dashboard page.

Footer renders identically on both pages.

### A4 — Price Book header copy

**File:** `src/app/(app)/price-book/page.tsx`

Three changes:

**(a) "VIDEOX V5" title sizing.** Make "VIDEOX V5" visually as large as "MSRP Price Book". Keep existing Arxys Gold (`var(--color-arxys-gold)` / `#fbb040`). Both titles read as co-equal header elements.

**(b) Subtitle text — replace existing with this verbatim:**

> VideoX Enterprise IP video servers give security professionals a winning competitive edge with AI-optimized performance, ultra-reliable uptime, and plug-and-play scalability—purpose-built to handle today's demanding VMS workloads without compromise. Run modern CODECS at line speed, double your camera counts per server, and deliver advanced analytics—while protecting 30% more margin than quoting VMS branded Dell. That's your competitive edge.

**(c) Disclaimer text at page bottom — replace existing with this verbatim:**

> Prices and specs subject to change without notice. All tariff taxes are passed on to buyers. Prices and quotes expire immediately upon new prices and quotes. Prices, specs and availability superseded by latest Arxys price list on that date. We put our best effort and knowledge to maintain the accuracy of specifications and price. Should there be any discrepancies we reserve the right to follow our specifications and pricing. In case of a newer component or part we reserve the right to change to the newer part at our discretion. Thanks for your understanding.

### A5 — Price Book Windows Server + warranty images

**File:** `src/app/(app)/price-book/page.tsx`

Add the two image assets (in `public/price-book/` per manual prereq) to the empty space on the right side of the blue header box:

- `Windows_Server_2022.png`
- `5_year_warranty-circle-2.png`

Sizing: ~80–120px height. Layout side by side or stacked depending on available width. Use Next.js `<Image>` with explicit dimensions to avoid CLS.

### A6 — Enterprise Grade highlighted box

**File:** `src/app/(app)/price-book/page.tsx`

Position: top of the page, below the blue header box, above the first product card.

**Pre-seeded content (verbatim):**

> **Enterprise Grade:** Arxys VideoX servers come standard with:
> - Microsoft Windows Server 2022 or 2025
> - Hot-swap, enterprise class HDDs and SSDs
> - Hot-swap and redundant power and cooling
> - Dedicated secure remote management
> - Resilient Hardware RAID with cachevault protection
> - Rack slide rails, and lockable drive access

**Styling:** Light background (e.g. `bg-stone-50` or `bg-neutral-100`) with an Arxys Gold left border accent (`border-l-4 border-[var(--color-arxys-gold)]`). Two-column bullet layout at `md:` breakpoint and above; single column on mobile. "Enterprise Grade:" heading in bold.

### B5 — H.265 performance card

**File:** `src/app/(app)/price-book/page.tsx`

Placement: default to a full-width banner card between the Enterprise Grade box (A6) and the product listings. If the existing layout makes a different placement more natural, choose that.

**Pre-seeded content (verbatim):**

- Heading: **"VideoX V5 Drives H.265 Performance"**
- Body: "V5's AMD Zen5 architecture delivers 2.3x more H.265 streams per server, eliminating the performance penalty that forces most NVRs to fall back to H.264. Run modern codecs at full speed without compromising camera counts or analytics."
- CTA: **"Learn More"** link → `https://www.arxys.com/videox-v5-launch-deliver-on-the-promise-of-h-265-today/` (`target="_blank"`, `rel="noopener noreferrer"`)

Match existing card patterns. If feasible, include a small CSS/SVG "H.265 HEVC" badge — otherwise omit.

### B6 — arxys.com link additions

**Files:**
- `src/app/(app)/price-book/page.tsx`
- `src/app/(app)/_components/footer.tsx` (the footer extracted in A2)

**Links:**

| Link Text | URL | Placement |
|---|---|---|
| View all VideoX Appliances | `https://www.arxys.com/videox-appliances/` | Price Book header area |
| Contact Sales for Custom Configurations | `https://www.arxys.com/contact/` | Price Book footer area |
| About Arxys | `https://www.arxys.com/about/` | Footer (shared) |
| Support & Resources | `https://www.arxys.com/support/` | Footer (shared) |

All use `target="_blank"` and `rel="noopener noreferrer"`. Style as subtle text links — not banner CTAs. If only 2–3 fit naturally without crowding, skip the rest.

### F — Support box on dashboard

**File:** `src/app/(app)/dashboard/page.tsx`

New dashboard card titled **"Support"**, styled to match the other dashboard cards (after A1's new styling lands):

- **Link:** "Support Documentation" → `https://www.arxys.com/company/support/` (`target="_blank"`, `rel="noopener noreferrer"`)
- **Button:** "Open a Support Ticket" → `https://arxys.supportsystem.com/` (`target="_blank"`, `rel="noopener noreferrer"`)

The button is the primary action (Arxys Gold or matching primary style); the documentation link is secondary.

### G — Documentation library scaffolding

**Scope:** Scaffolding only. Each family detail page gets a Documentation section. For now, only the datasheet link surfaces (per `families.ts` `datasheetUrl`, which is null for 4 of 10 families). Other doc types (install guide, network diagram, VMS config notes) are not yet authored — section structure ships now; content fills in over time.

**File:** `src/app/(app)/price-book/[slug]/page.tsx`

**Behavior:**
- Render a Documentation section heading below the existing content
- If `family.datasheetUrl` is non-null: one card with link to the datasheet (existing behavior — make sure it lives in this new section rather than the existing standalone button)
- If `family.datasheetUrl` is null: render the section heading with a small "Documentation coming soon" subtext, or omit the section entirely for that family. **Default: omit entirely** (cleaner than empty placeholders)
- Do NOT scaffold empty cards for other doc types. Future steps add real content + new card types.

Minimal by design. The point is the section pattern, not the content.

### Deal-Registration email button (B-lite)

**Files:**
- `src/app/(app)/dashboard/page.tsx` — new card with the button
- New: `src/app/(app)/dashboard/register-deal-form.tsx` (Client Component using `useActionState`)
- New: Server Action in `src/app/(app)/dashboard/actions.ts` (or extend if exists)
- Email rendering: mirror `src/lib/email/submission-notification.ts`

**Behavior:**

1. Dashboard card titled "Register a Deal" with brief explanatory text ("Lock in partner protection on a specific opportunity — Andy will follow up.") and a button.
2. Button reveals an inline form (default: state-driven, no separate route):
   - **Project Name** — text input, required, min 3 chars, max 200 chars
   - **Notes** — textarea, optional, max 1000 chars
3. Submit: Server Action validates with zod, sends email via the existing nodemailer setup.
4. Email content:
   - **To:** `process.env.INTERNAL_NOTIFICATION_EMAIL`
   - **From:** existing `sales@arxys.com` alias (matches Phase 1 SMTP config)
   - **Subject:** `Deal Registration: {projectName} — {partner.company_name}`
   - **Body (plain text):**
     ```
     New deal registration request:

     Partner: {partner.company_name}
     Contact: {partner.contact_name}
     Email: {partner.email}
     Partner ID: {partner.id}

     Project: {projectName}

     Notes:
     {notes || '(none)'}
     ```
5. Success state: form clears, success message "Thanks — Andy will be in touch."
6. Error state: surface the Server Action error via `useActionState`.

**Auth:** Server Action runs in the `(app)` layout group; `auth.uid()` is the partner. Pull partner info via the existing dashboard pattern (likely already loaded in the dashboard page).

**No database write.** Fire-and-forget email only. If email fails, surface error to the user — don't pretend success.

## Verification gates

1. **`npm run build`** — clean. Turbopack output should show one or two new routes if the form is route-based; same route count otherwise.
2. **`npm run lint`** — 0 errors. Preserve existing `<img>` warnings if still present; introduce no new ones (use `<Image>` for A5).
3. **`npm test`** — all unit tests pass. No new tests required (no business logic added). Bonus: a test for the deal-reg Server Action's zod validation if time permits.
4. **`scripts/test-rls.ts`** — 10/10 pass. No RLS changes in this step.
5. **Manual smoke** (Andy runs):
   - Dashboard renders all cards (existing + new Support, Deal Reg)
   - Footer renders on dashboard and price book
   - Price book renders new header copy, images (no CLS), Enterprise Grade box, H.265 card, link additions
   - Documentation section renders on each family detail page that has a datasheet
   - Deal Reg button submits → Andy receives email at `INTERNAL_NOTIFICATION_EMAIL`
   - All external links open in new tab

## Definition of done

- All 10 items shipped (A1, A2, A4, A5, A6, B5, B6, F, G, deal-reg email)
- All verification gates green
- JOURNAL entry drafted (Claude Code drafts; Andy reviews before commit)
- README forward-looking-plans table updated if relevant
- Local commits grouped sensibly (suggested grouping: A1+A2 dashboard chrome; A4+A5+A6+B5 price book content; B6 link pass; F support card; G docs scaffold; deal-reg email)
- Not pushed until Andy confirms
- No ADRs expected; if an architectural decision surfaces, document and ask before creating an ADR

## Open questions to lock before execution

- **Q1 — A6 styling:** Confirm Arxys Gold left border + light gray background, or alternative? *Default: that combo unless it conflicts with existing patterns.*
- **Q2 — B5 placement:** Where does the H.265 card sit? *Default: full-width banner card between A6 Enterprise Grade box and product listings.*
- **Q3 — Deal-reg form: inline modal vs sub-page?** *Default: inline state-driven form revealed on button click. Fewer files, faster ship.*
- **Q4 — G docs section: omit-when-no-datasheet vs "Coming soon" placeholder?** *Default: omit entirely. Cleaner than empty placeholders.*
- **Q5 — Footer extraction:** what else lives in the current price-book footer beyond the disclaimer? (Discoverable during extraction — flag any surprises.)

If a question surfaces a real ambiguity during execution, stop and ask Andy via chat before deciding.
