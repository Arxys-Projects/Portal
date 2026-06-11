# Project Journal

Chronological narrative of work on the Arxys Partner Portal. Newest entry at top. Each step gets a *Work done* subsection and (where applicable) a *Detours & fixes* subsection.

---

## 2026-06-11 — Remove SFP28 NIC upgrades from V200 / V250 / V260

### Work done

Dropped the two SFP28 NIC upgrade lines — `VX5-NIC-SFP28` (SFP28 optical NIC
card, $670) and `VX5-NIC-SFP28x10` (2× 10Gb SFP28 transceivers, $300) — from
three families' `upgradeSkus` in [`families.ts`](../src/lib/price-book/families.ts):

- **V200** (`v200`): `["VX5-GPU-A1000", "VX5-NIC-SFP28", "VX5-NIC-SFP28x10"]` → `["VX5-GPU-A1000"]` (GPU upgrade retained).
- **V250** (`v250`): `["VX5-NIC-SFP28", "VX5-NIC-SFP28x10"]` → `[]`.
- **V260** (`v260`): `["VX5-NIC-SFP28", "VX5-NIC-SFP28x10"]` → `[]`.

The family-page Upgrade section is already guarded by `upgradeSkus.length > 0`
([`page.tsx`](<../src/app/(app)/price-book/[slug]/page.tsx>) lines 160 and 336),
so V250/V260 now render with no Upgrades section rather than an empty heading.
The SKU/price rows themselves live in the products table and are untouched —
this only removes the upgrade options surfaced on these three product pages;
V400–V800 keep their SFP28 options. `npm run build`, `npm test` (86 pass),
`eslint` all clean.

## 2026-06-11 — Pipedrive custom field rename (Recording / CODEC / Scene Complexity)

### Work done

Three admin-curated Pipedrive deal fields were renamed in the Pipedrive UI. The
integration matches these fields **by display-name string** (not by hashed API
key): [`CALCULATOR_FIELD_NAMES`](../src/lib/pipedrive/lookups.ts) is matched
against the live `/v1/dealFields` `name` to discover each field's hashed key at
runtime, and the `set("Display Name", …)` call-sites in
[`deal.ts`](../src/lib/pipedrive/deal.ts) look the key up by that same string. A
label rename therefore breaks the name match — the field would be logged as
missing and silently skipped, saving the deal without it. So the rename did
require a code change.

- **Display-name strings updated** in both source files, in lockstep with the
  derived `CalculatorFieldName` union:
  - `Recording` → `Recording New`
  - `CODEC` → `CODEC New`
  - `Scene Complexity` → `Complexity Scene-Motion`
- **Untouched on purpose:** the separate `Recording hours` field (partial-match
  hazard — a naive `Recording` → `Recording New` replace would have corrupted
  it); all numeric **option IDs** (CODEC 138/139/286, Recording 118/119,
  Complexity 287/288/289) — those are keyed by ID and a label rename doesn't
  touch them; the calculator UI's own "Recording" mode selector and the
  codec/complexity *concepts* in the form (not Pipedrive fields).
- **Tests** ([`deal.test.ts`](../src/lib/pipedrive/deal.test.ts)): the
  `CALC_FIELD_KEYS` fixture keys and all assertions updated to the new names,
  including switching `CALC_FIELD_KEYS.Recording` / `.CODEC` dot-access to
  bracket notation (the new names contain spaces).
- **ADR [0041](./decisions/0041-multi-group-pipedrive-field-aggregation.md)**
  amended: an `Amended: 2026-06-11` note added and the three field-name tokens
  in the body rewritten. Older dated JOURNAL entries and the phase-2 planning
  snapshot were **left as historical record** — they describe what was true at
  the time; this entry supersedes them.
- `npm run build`, `npm test` (86 pass), `eslint` on the pipedrive module all
  clean. (Pre-existing unrelated `tsc` noise in `pdf/render.test.ts` and
  `price-book/xlsx.test.ts` is untouched and excluded from the production build.)

### Detours & fixes

- **Old-name strings from the brief didn't exist in the repo.** The rename
  brief listed the old names as `Recording old` / `CODEC old` / `Scene old`, but
  grep (case-sensitive and insensitive, whole repo) found zero matches — the
  code referenced `Recording` / `CODEC` / `Scene Complexity`. Confirmed with Andy
  that these were the real current Pipedrive labels and mapped accordingly,
  rather than assuming a latent skip bug.
- **Test failures after the first pass.** The fixture-key rename broke
  `CALC_FIELD_KEYS.Recording` / `.CODEC` dot-access (the new keys have spaces),
  so those lookups returned `undefined` and four assertions failed. Root cause:
  the initial grep only caught the quoted `"Scene Complexity"` form, missing the
  dot-notation. Fixed by switching to bracket notation.

---

## 2026-06-09 — Human-readable PDF filename + Pipedrive deal title

### Work done

The downloaded estimate's filename ended in the submission UUID and the
Pipedrive deal title was just the project name — neither was scannable.

- **PDF filename** ([`pdfFilename` in render.ts](../src/lib/pdf/render.ts)):
  `Arxys-Report-YYYY-MM-DD-<UUID>.pdf` → `Company - Project - YYYY-MM-DD.pdf`
  (dashes, UUID dropped). Company/project run through `sanitizeFilenamePart`
  (strips `\ / : * ? " < > |` and collapses whitespace) so a name can't break
  the filename. Blank project → "Untitled Project". Both the download route and
  the email attachment pick up the new name (they already pass the full
  `SubmissionPdfInput`).
- **Pipedrive deal title** ([`deal.ts`](../src/lib/pipedrive/deal.ts)):
  `Company Name | Project Name | YYYY-MM-DD` (pipes), "Untitled Project" when
  blank. Added a `submissionDate` field to `DealSubmissionInput`, supplied by
  [`actions.ts`](../src/app/(app)/calculator/actions.ts) from the same
  `generatedAt` the PDF filename uses, so the file and the deal always show one
  date.
- Updated the two title assertions + fixture in `deal.test.ts`. `npm run build`,
  `npm test` (86 pass), `eslint` all clean.

---

## 2026-06-09 — System Estimate PDF: surface new calculator labels + restructure camera schedule

### Work done

The customer-facing System Estimate PDF still spoke the pre-rework calculator
language (tier words "high"/"low", "REC HRS") and its camera-schedule table was
too narrow for the new long descriptive complexity labels. Fixed both —
**labels, copy and layout only; no calculation touched.**

- **Verification gate first.** Traced `groups_payload` → `render.ts` → PDF.
  Found `complexityLabel` and `recordingMode` were already banked at write time
  ([actions.ts](../src/app/(app)/calculator/actions.ts)) but dropped by
  `mapGroups` — the PDF's `GroupsPayload` / `SubmissionPdfGroup` types simply
  omitted them, so it fell back to the legacy `complexity` tier. No upstream
  plumbing needed; the gap was the mapping layer only.
- **Surfaced the banked fields.** Added `complexityLabel` + `recordingMode` to
  [`types.ts`](../src/lib/pdf/types.ts) and the `render.ts` `GroupsPayload` type,
  and mapped them in `mapGroups` with a coarse fallback for legacy rows
  (`fallbackComplexityLabel`, `recordingMode ?? "constant"`). The second PDF
  builder in `actions.ts` (email-attachment path) was updated to pass the full
  label + mode from `r.input` directly.
- **Restructured the camera schedule** ([`SubmissionPdf.tsx`](../src/lib/pdf/SubmissionPdf.tsx))
  from wide per-group rows into two-tier blocks: one column-header row at the
  top; per group a full-width header line (`Group name · N camera streams`,
  count lifted out of its own column); then a full-width 7-column specs row with
  room for the long scene label and the operation-hours text. Totals row stays
  as the bottom summary, now reading "N camera streams" and aligned under the
  Bandwidth/Storage columns.
- **Copy fixes:** scene cell shows the full descriptive label; recording mode is
  folded into the operation-hours cell (`18 (motion 40%)` / `24 (constant)`);
  column header "REC HRS" → "Operation hrs"; footer disclaimer reworded
  "industry-standard compression ratios" → "validated compression modeling"
  (no vendor name, no "certified").
- **Verified** by rendering a 7-group new submission (motion group + six-level
  label) and a legacy submission (null serverSpec, coarse fallback label) to
  PDF — both render correctly, blocks don't split across the page break.
  `npm run build`, `npm test` (86 pass), `eslint` all clean.

### Decisions captured

- [`0052-pdf-reads-banked-complexity-recording-fields.md`](./decisions/0052-pdf-reads-banked-complexity-recording-fields.md)

---

## 2026-06-08 — Calculator field explainers (inline tooltips + FAQ panel)

### Work done

Partners had no in-page guidance for the calculator's many fields after the
recent bitrate/complexity/recording rework — they'd have to ask or guess. Added
plain-speak help everywhere, reusing the existing `Tooltip` (ⓘ) component so
nothing new had to be learned.

- **Filled every tooltip gap** in [`calculator-form.tsx`](../src/app/(app)/calculator/calculator-form.tsx):
  inputs that previously had none (Project Name, Which VMS?, Add-ons + each
  checkbox, Video Streams, Resolution, FPS) and **all** calculated outputs that
  had none (the three summary cards — Total Cameras/Bandwidth/Storage — and the
  four per-group results — Bitrate/Bandwidth/Storage/Daily). The 7 pre-existing
  tooltips were left as-is (already good voice).
- **Output copy is plain-speak + "why it matters"**, deliberately no formulas
  (e.g. Bitrate: "how much data one camera produces per second… resolution, FPS,
  and how busy the scene is all push it up or down").
- **New collapsible FAQ panel** (`<details className="ax-faq">`) at the bottom:
  a two-column "What you enter / What we calculate" bullet reference covering
  every field, ending with a "rough estimate for planning, your Arxys team
  confirms the final sizing" disclaimer. Native `<details>` — no JS, keyboard-
  accessible. Styling added to [`calculator.css`](../src/app/(app)/calculator/calculator.css)
  to match the existing card/tooltip look; collapses to one column ≤1024px.

Verified: ESLint clean on the route; `tsc` shows only pre-existing errors in
unrelated test files. Andy eyeballed tooltips + FAQ in the local preview.

### Decisions captured

No ADR — additive UX using the established tooltip pattern; the "tooltips +
FAQ panel both" and "no formulas in output copy" choices were Andy's calls
captured here rather than as a standalone decision.

---

## 2026-06-08 — Partner onboarding/login fixes

### Work done

Partners reported they couldn't log in, and the admin partners list showed
*"A user with this email address has already been registered"* on Resend. A
read-only diagnostic (`scripts/diagnose-partners.ts`, cross-referencing
`partners` against `auth.users`) confirmed it was **not** DB corruption — 17
partners, 17 auth users, no orphans. Every *external* partner was stranded at
`status='invited'`: six had confirmed + signed in but never reached
`/dashboard`; five never confirmed at all (corporate domains). Internal/admin
accounts had all auto-activated fine.

Root causes and fixes:

- **Onboarding confusion** — invite link logs the user in and drops them on a
  "set password" screen they didn't understand; they abandoned it and then tried
  to "sign in" with a password that never existed. *Fix:* one-page approach with
  clearer copy. Login page gained a "First time here? You don't have a password
  yet" panel and a friendly expired-link banner; `/reset-password?new=1` now
  reads "Create your password" for invitees vs "Set a new password" for
  returners; forgot-password reframed as "Get a sign-in link" that works for
  first-timers too.
- **Single-use tokens burned by email scanners** — `/auth/confirm` ran
  `verifyOtp` on GET, so Safe Links / Mimecast / Proofpoint pre-fetches consumed
  the token before the human clicked. *Fix:* converted `/auth/confirm` to a
  click-through interstitial (page + server action under the `(auth)` group, URL
  unchanged); the token is only verified on the explicit POST. `type=invite`
  routes to `/reset-password?new=1`.
- **Resend was structurally broken** — `resendInvite` re-called
  `inviteUserByEmail`, which Supabase always rejects for an existing user. *Fix:*
  switched to `resetPasswordForEmail` (recovery), which works for any existing
  user; button relabelled "Resend sign-in link."
- **Email copy** — invite + recovery templates (`docs/email-templates/`) now
  state plainly that the user has no password yet and is creating one. These are
  the canonical source and must be re-pasted into the Supabase dashboard.
- **Remediation** — `scripts/resend-onboarding.ts` re-sends working set-password
  links to all 11 stuck partners (dry-run by default, `--send` to fire; `--test
  <email>` previews the flow against one address).

Verified the four auth states render correctly in the dev preview (login panel,
expired banner, interstitial without token consumption, create-password screen)
and that a bad-token POST fails gracefully to `/login?error=expired_or_invalid`.

**Rollout (same day):** confirmed the Supabase dashboard Site URL =
`https://portal.arxys.com` (canonical since the 2026-05-26 cutover) and that the
updated templates were pasted in; sent a `--test` recovery email to
`andy.newbom@arxys.com` and clicked the full chain (branded email → interstitial
→ set-password) successfully; then ran `--send` to all 11 stuck partners — every
address returned ✓, no failures. Also aligned all email-link/logo references in
the repo from the `portal-arxys.vercel.app` fallback to the canonical
`portal.arxys.com` (templates, README, RUNBOOK).

### Detours & fixes

- **"DB issue" was a misdiagnosis** — the `invited` status is a *symptom* of
  never completing set-password, not corruption. The auto-activate (invited →
  active on first app-page load, shipped 2026-05-20) works; the stuck partners
  simply never reached an app page.
- **Dashboard config lives outside this repo** — the token-scanner and
  link-validity fixes depend on Supabase dashboard settings. Verified at
  rollout: Authentication → URL Configuration → **Site URL** =
  `https://portal.arxys.com`; **custom email templates** pasted in with the
  updated copy; redirect allow-list covers `/auth/confirm`. Remaining drift: the
  repo templates' logo URL was changed to `portal.arxys.com` *after* the
  dashboard paste, so a fresh re-paste is needed to make the live email logo
  match (cosmetic — the vercel.app logo still resolves).

### Decisions captured

- [`0051-auth-onboarding-interstitial.md`](./decisions/0051-auth-onboarding-interstitial.md)

## 2026-06-05 — Calculator: control-row layout + UX fixes (post-review)

### Work done

Follow-up polish on the camera-group control row after a UI review of the
recording/complexity rework (entry below).

- **Save hint reworded** — "Configure a camera group below, then save to notify
  Arxys sales." → "Configure all cameras, then save to send the project to
  Arxys for review and a quote." (reflects the actual save-and-quote flow).
- **Complexity column widened** (`wx` 170→212px) so its longest label,
  "Medium detail, high motion", reads in full instead of truncating.
- **Motion/Event % is now a number box, not a slider** — simpler and less
  confusing per the review. Number input (20–100, step 5), disabled and greyed
  under Constant recording (shows 100). Removed the now-dead range-slider
  disabled CSS.
- **Tooltips no longer clip at the card edge** — root cause was
  `overflow: hidden` on `.ax-cam`, which clipped the column-header tooltips
  (the reason their copy had been forced to one line). Removed it and rounded
  the header (`.ax-ch`) top corners and results row (`.ax-cr`) bottom corners
  instead, so the card still reads as a rounded panel while tooltips escape its
  bounds. Verified all three right-edge tooltips render fully within the
  viewport with no clipping ancestor.
- **Control row stays on ONE line** — switched `.ax-cb` to `flex-wrap: nowrap`
  at desktop with shrinkable cells (`flex: 0 1 <basis>`); the ≤1024px breakpoint
  still uses `flex-wrap: wrap` + `flex: 1` for tablet/mobile. Also tightened
  padding (40→20) / gap (16→10) and dropped control font 14→13, and aligned the
  example line + results row padding to the control row.

### Detours & fixes

- **`flex-shrink` doesn't prevent wrapping under `flex-wrap: wrap`** — first
  attempt kept `wrap` and made cells shrinkable, expecting them to compress onto
  one line. They didn't: flexbox wraps overflowing items first and only shrinks
  *within* each resulting line, so Motion/Event % still dangled. The real fix is
  `flex-wrap: nowrap` (shrink-to-fit on one line) for the desktop range, letting
  the existing ≤1024px media query take over below that.
- **Fixed-width fitting was flaky** — the panel's content width fluctuates a few
  dozen px between measurements, so a "just-fits" no-shrink row wrapped
  unpredictably ("regardless of window size"). `nowrap` + shrinkable bases makes
  it width-robust: full size when there's room, graceful compression when tight.

### Verification gates

| Gate | Result |
|---|---|
| Single-line @1440px (panel 1234) | ✅ 8 cells one row, 86px headroom, full Complexity label |
| Single-line @1080px (just above breakpoint) | ✅ one row, Complexity shrinks 212→177, no overflow / no page scroll |
| ≤1024px | ✅ falls back to balanced wrap (tablet layout) |
| Motion number box | ✅ greyed/disabled under Constant; enabled under Motion-only, 40% → storage 2.68→1.40 TB |
| Tooltip clipping | ✅ right-edge tooltips fully within viewport, no clipping ancestor |
| `npm run build` / `npm test` / `npx eslint` | ✅ clean / 86 pass / 0 errors |

---

## 2026-06-05 — Calculator: fix two pre-existing ESLint errors in `calculator-form.tsx`

### Work done

- Drove the Save button's saving state off `useActionState`'s own pending flag (renamed the unused third binding `isSubmitting` → `isSaving`), deleting the redundant `isSaving` `useState`, the status-watching `useEffect` (`react-hooks/set-state-in-effect`), and the now-orphaned `flushSync` import/call — same pattern as `partner-row-actions.tsx`. UX unchanged: the pending flag flips true on dispatch, so the spinner still paints immediately. Verified `eslint` clean, `npm run build` + `npm test` (86/86) green.

## 2026-06-05 — Calculator: re-anchor bitrate engine, six-level complexity, motion/recording rework

### Work done

Re-derived the calculator's math against Milestone's XProtect calculator (the
agnostic-bridge conservative bound) and reworked the recording/motion UX. Did
the math behind a hard verification gate first, then the UI. Files live under
`src/lib/calculator/` and `src/app/(app)/calculator/` (the brief referenced
`src/lib/calc/` — corrected to the real path).

- **Six-level complexity** (`tables.ts`) — replaced the 3 vague levels with six
  descriptive Avigilon-style scene labels (multipliers 1.0 / 1.5 / 2.25 / 3.375
  / 5.0 / 7.0), each carrying an `example` field on the `Complexity` type for
  tooltips/helper text. New default is index 2, "Medium detail, low motion".
- **Codec re-anchor** (`compute.ts`) — `CODEC_BITRATE.h265` 0.07 → **0.037**
  (h264 0.0634, smart 0.0444, derived from H.265 by the prior ratios). The old
  factors ran ~2× hot vs Milestone. Anchored so 4MP (2560×1440)/15fps/H.265/Low
  lands ~1966 Kbit/s.
- **Motion idle floor** (`compute.ts`) — `applyMotionAdjustment` 30% → **20%**
  (`0.2 + 0.8·P`). Documented as a weighted-average bitrate model and that it is
  bitrate-weighting only — it never touches recorded hours (those are
  `recordingPercent` / Operation Hours, left unchanged).
- **Verification gate** (`compute.test.ts`) — new `describe` asserting all six
  levels' per-camera bitrate within ±2% of the audited Milestone numbers (sixth
  = 1966×7.0 = 13762 by construction) plus the 20% floor (motion 20% ⇒ ~708).
  Computed values land at a uniform +1.63% (the conservative bias from rounding
  the factor up to 0.037).
- **UI** (`calculator-form.tsx`, `calculator.css`) — complexity dropdown now has
  an info tooltip and a per-card example line that updates on selection. Added a
  **Recording** mode selector (Constant | Motion-only; no Speedup — out of
  scope). Relabeled Hrs/Day → **Operation** hours (1–24, always active). The
  **Motion/Event %** slider is now 20–100 and is disabled+greyed under Constant
  (which pins motion to 100%), mirroring the Milestone UI.
- **Persistence / round-trip** (`actions.ts`, `rehydrate.ts`) — added
  `recordingMode` to the group schema (defaults `"constant"` for old rows) and
  banked `complexityLabel` in `groups_payload`. Rehydration now resolves
  complexity by unique label first (tier alone is ambiguous across six levels →
  it would collapse the two med/low levels to one), then tier, then raw index.
  Operation Hours and Motion% round-trip via the existing `recordingPercent` /
  `motionPercent` fields, so the PDF, Pipedrive sync, and submission-detail view
  needed **no changes** (they still read those two fields). Server-side, Constant
  pins `motionPercent` to 100 as defense-in-depth against a hand-crafted POST.

### Detours & fixes

- **"One combined hours field" in the brief didn't match the live UI** — the
  form already had separate Hrs/Day and Motion controls. Followed the real
  structure: added the Recording selector and rewired motion gating rather than
  splitting a field that wasn't combined.
- **Complexity round-trip would have silently collapsed** — the existing
  rehydrate resolves complexity by `tier`, but six levels map to three tiers, so
  a re-opened "Medium detail, high motion" quote would have come back as
  "Medium detail, low motion". Fixed by banking and resolving on the unique
  `complexityLabel`; added a regression test proving the disambiguation.
- **No version bump needed** — rehydration *defaults* the absent `recordingMode`
  rather than branching on a version, so `INPUT_STATE_VERSION` stayed 1.
- **Two pre-existing ESLint errors in `calculator-form.tsx`** (unused
  `isSubmitting`; `react-hooks/set-state-in-effect` in the save-spinner effect)
  — confirmed present on `HEAD` via a one-file stash, unrelated to this change.
  Left untouched: the set-state-in-effect fix is a behavioral refactor of the
  save spinner, outside this task's scope. Flagged for a separate cleanup.
- **Browser verification of `/calculator` was initially blocked by the auth
  gate** — the preview session started unauthenticated and there is no static
  dev account. First verified the UI's *data path* via `computeGroup` directly
  (per-level bitrate matches the gate; Motion-only @50%/@20% drops storage to
  60%/36% of Constant; Operation hours scales linearly). Once a session was
  available, completed the live in-browser check: complexity dropdown renders
  all six levels with the example line updating on selection; Low/low shows 1.95
  Mbps and Med/low 4.39 Mbps; switching to Motion-only enables the slider and
  drops storage to 60% at 50% motion; switching back to Constant re-greys it at
  100% and restores storage; zero console errors.

### Decisions captured

- [`0049-milestone-complexity-curve.md`](./decisions/0049-milestone-complexity-curve.md)
  — Milestone curve + codec damping over a vendor blend; six descriptive levels.
- [`0050-codec-bitrate-reanchor.md`](./decisions/0050-codec-bitrate-reanchor.md)
  — re-anchor to the live Milestone audit; 20% motion floor; motion = bitrate
  weighting, hours = Operation Hours.

### Verification gates

| Gate | Result |
|---|---|
| Bitrate verification gate (6 levels + motion floor, ±2%) | ✅ All land +1.63%, within ±2% |
| `npm test` | ✅ 86/86 (was 77; +7 gate, +2 rehydrate round-trip) |
| `npm run build` | ✅ Clean (TypeScript passed) |
| `npx eslint` (changed files) | ✅ 0 new errors; 2 pre-existing in `calculator-form.tsx` (confirmed on HEAD, unrelated, left per scope) |
| UI data-path check (`computeGroup`) | ✅ Bitrate/storage/hours behavior correct |
| In-browser `/calculator` visual + interaction check | ✅ 6 levels, example updates, bitrate matches, motion gating + storage drop, no console errors |

---

## 2026-06-05 — Fix: dashboard deal registration + header nav labels

### Work done

- **Register a Deal was broken** — submitting failed with the raw Zod message "Too small: expected string to have >=1 characters". Root cause: `dashboard/page.tsx` selected a non-existent `email` column from `partners` (emails live on `auth.users`, not `partners`). Supabase returned an error, but only `data` was destructured so the error was swallowed and `partner` came back `null`. That made the hidden `partnerId` field empty, so the action's `partnerId: z.string().min(1)` check failed with its default message. Fixed by dropping `email` from the select and sourcing the partner email from `user?.email` (the form's existing fallback). The form's other partner fields now populate correctly too.
- **Header nav wrapped to two lines** — renamed "My Pipeline" → "Pipeline" and "All Submissions" → "Submissions" in `layout.tsx` so the admin/internal nav fits on one line.

### Detours & fixes

- The swallowed-error pattern (`const { data } = await supabase...`, no `error`) is what hid this for so long — the page rendered fine apart from the empty partner context, so it only surfaced when the deal form tried to use `partnerId`. Worth watching for elsewhere, but not refactored here.

### Verification gates

| Gate | Result |
|---|---|
| `npx eslint` (2 changed files) | ✅ 0 errors (pre-existing `<img>` warning in layout.tsx unchanged) |
| `npm run build` | ✅ Clean |
| Confirmed `partners` has no `email` column (initial schema migration) | ✅ |

---

## 2026-06-05 — Admin-editable partner company + contact name

### Work done

Admins can now edit a partner's (or internal user's) display **company name and contact name** from the partners list, to fix test records and align names with the matching Pipedrive organization/contact.

- **`src/app/(app)/admin/partners/actions.ts`** — `updatePartnerCompanyName` and `updatePartnerContactName` server actions, both thin wrappers over a shared `updatePartnerNameField(formData, column, formField, label)` helper. Gated by the local admin-only `requireAdmin()` (not `requireAdminOrInternal`, matching suspend/reactivate/internal-toggle). Validates with `nameFieldSchema` (`z.string().trim().min(1).max(120)`, same bounds as the invite form), writes the target column via the service-role admin client, then `revalidatePath("/admin/partners")`.
- **`src/app/(app)/admin/partners/partner-row-actions.tsx`** — `EditableName` client component, generic over the field: takes `value`, `fieldName`, `label`, and the server `action` as props so one component serves both columns. Display mode shows the value plus an "Edit" button; edit mode swaps in a text input with Save / Cancel.
- **`src/app/(app)/admin/partners/page.tsx`** — the Company and Contact cells each render `EditableName` (with the matching action) when `isAdmin`, otherwise plain text (internal users keep read-only access, same gating as the other row controls).

No migration and no RLS change: both columns already exist, and every admin mutation on this page already goes through the service-role client (which bypasses RLS). Admin-only is enforced server-side in the action, not just in the UI. The names copied into auth `user_metadata` at invite time are intentionally left untouched — they are never read after the invite; the `partners` table is the source of truth everywhere the portal reads it (calculator, submissions, PDF).

**Manual verification:** as an admin, open `/admin/partners`, click **Edit** on a row's Company or Contact cell, change the value, and **Save** — the row refreshes with the new value and it flows through to that partner's submissions/PDF. Confirm an internal (non-admin) user sees both names as plain text with no Edit control.

### Detours & fixes

- **`setState` in `useEffect` rejected by lint.** First pass closed the editor from a `useEffect` watching the action result; the React 19 `react-hooks/set-state-in-effect` rule errors on that, and it also mishandled re-editing after a save (stale "ok" state). Reworked to call the action inside `useTransition` and collapse the editor (or set the error) from the transition callback — no effect, and the state resets cleanly per edit.

### Verification gates

| Gate | Result |
|---|---|
| `npx eslint` (3 changed files) | ✅ 0 errors |
| `npm run build` | ✅ Clean |
| `npm test` | ✅ 77/77 (no test-covered logic changed) |

---

## 2026-06-05 — Phase 9 Step 1: System estimate PDF

### Work done

Replaced the basic calculator PDF (`src/lib/pdf/SubmissionPdf.tsx`) with a polished, customer-ready "System Estimate" document. The download route (`/api/submissions/[id]/pdf`) and render entry points are unchanged; the template and its view model grew.

- **`src/lib/pdf/SubmissionPdf.tsx` rebuilt** with seven sections top to bottom: (1) header — Arxys logo image, "Purpose-built video surveillance infrastructure" tagline, and a right-aligned block with a navy "SYSTEM ESTIMATE" pill, date, project, and "Prepared for" company, separated by a navy rule; (2) camera schedule table (group, cameras, resolution, codec, FPS, scene complexity, recording hours, bandwidth, storage) with a highlighted Totals row and an italic retention + even-distribution note; (3) three capacity bars (Total storage, Bandwidth, System utilization) rendered as nested `<View>` rectangles with percentage-width fills — navy for storage/bandwidth, gold for utilization, plus a "20% headroom built in" note; (4) recommended-server block — product hero image (left) and model name + SKU line + 2-column spec grid (right); (5) navy pricing row (Unit MSRP / Quantity / Deployment total, total in gold); (6) five value-prop badges (navy circle + letter abbreviation, since `@react-pdf/renderer` has no icon-font support); (7) footer with the standard planning-estimate disclaimer and company line.
- **`src/lib/pdf/assets.ts` (new)** — loads the logo (`public/email/arxys-logo.png`) and the recommended product's hero (`public/price-book/*.png`) off disk into cached base64 data URIs. Hero selection reuses the canonical `productGroupToFamilySlug` → `families.ts heroImage` mapping. Returns `null` on a missing file so the template degrades to text rather than crashing.
- **`next.config.ts`** — added `outputFileTracingIncludes` for `/api/submissions/*/pdf` so the logo and price-book PNGs ship with the serverless function (the hero path is dynamic and can't be statically traced). See ADR 0046.
- **`src/lib/pdf/render.ts`** — `loadSubmissionPdfInput` now also joins `product_specs` on `id = recommended_product_id` (the migration made `product_specs.id` the SKU, so this is a direct key match — no `product_sku` indirection needed). New exported helpers: `buildServerSpec()` (fetch + map a SKU's spec, shared with the calculator action) and `usableCapacityTb()` (RAID-net capacity from `storage_raw_tb` + `hdd_count` + `raid_level_display`). The view model carries the resolved `serverSpec`, the logo/hero data URIs, and the submission's `storageTb`/`bandwidthMbps` for the capacity bars.
- **`src/lib/pdf/types.ts`** — added `SubmissionPdfServerSpec` plus the new top-level fields. QuickCompare columns are nullable; the template renders "—" for any null (per brief).
- **`src/app/(app)/calculator/actions.ts`** — the in-memory view model built for the emailed PDF now calls `buildServerSpec()` and the asset loaders too, so the attachment matches the downloadable PDF.
- **`src/lib/pdf/colors.ts`** — added `ARXYS_NAVY` (#1a365d) and `TRACK_GRAY`.
- **`src/lib/pdf/render.test.ts`** — fixture updated for the new required fields; added a second case that renders with `serverSpec: null` (legacy submission) to lock in the no-crash-on-null contract. 77/77 green.

**Manual verification:** navigate to `/submissions`, click **PDF** on any submission, and confirm the downloaded file shows all seven sections with real data — logo and product image render, the camera schedule totals reconcile with the rows, the capacity bars fill proportionally, and the pricing row multiplies MSRP by unit count. Multi-server (`recommended_units > 1`) shows "N × SKU" in the SKU line and per-deployment totals in the bars. During development the layout was rasterized with `pdftoppm` and inspected page-by-page for a single-group (one page) and a three-group (two pages, clean section break) calc.

### Detours & fixes

- **One-page fit fought the fixed footer.** The brief wants a single-group / single-server calc on one page. With everything in, the five value badges (a `wrap={false}` block) kept jumping to page 2 even with visible whitespace above the footer, because the footer is `position: absolute` + `fixed` and `paddingBottom` governs where content stops flowing. Tightening `paddingBottom` to 50 pulled the badges back onto page 1, but then the badge subtitles painted *under* the fixed footer. The fix was a second pass trimming ~15pt of inter-section margins (capacity bars, recommended block, pricing) so the badges end above the footer band. Single-group now fits one page cleanly; three-group breaks between the recommended-server block and the pricing row (a whole-section boundary, never mid-section).
- **`product_specs` vs `products`.** The brief refers to `product_specs` and its QuickCompare columns. The recommendation engine and the old PDF used the separate `products` table (SKU-PK). The Phase 6 migration set `product_specs.id` to the SKU string, so joining the spec is a direct `id = recommended_product_id` match — confirmed by reading the migration's `where id like 'VX5-V%-%'` clauses. Both tables are now queried: `products` for covered cameras/storage (existing behavior preserved as a fallback), `product_specs` for the spec grid + RAID inputs.
- **No usable-capacity utility existed.** Implemented `usableCapacityTb()` as a RAID-level approximation (ADR 0047) rather than reaching for the Price Book's per-SKU net-usable strings.
- **Dropped the warnings note box.** The old template rendered `recommendation.warnings` (e.g. "verify rack space and power before quoting") in a yellow note box. Those are integrator/sales-facing, not end-customer-facing, so they are intentionally omitted from this customer-ready document. The multi-unit signal they carried is now conveyed structurally by the "N × SKU" line and the capacity bars. No data or algorithm changed — only what the customer PDF surfaces.

### Decisions captured

- [`0046-pdf-image-assets-via-file-tracing.md`](./decisions/0046-pdf-image-assets-via-file-tracing.md)
- [`0047-raid-usable-capacity-approximation.md`](./decisions/0047-raid-usable-capacity-approximation.md)

### Verification gates

| Gate | Result |
|---|---|
| `npm test` | ✅ 77/77 (added one PDF null-spec render test) |
| `npm run build` | ✅ Clean — 18 routes, 0 errors |
| `npx eslint` (8 changed files) | ✅ 0 errors (two react-pdf `<Image>` a11y warnings suppressed inline — not HTML img, no alt concept) |
| `no-ai-slop` audit on template strings | ✅ No banned phrases; no em dashes in prose. The only "—" are the brief-mandated null placeholders and the middot "·" separators match the comparison-PDF footer. |
| Manual PDF inspection (single- and three-group) | ✅ All 7 sections render with images; single-group fits one page; multi-group breaks on a section boundary. |

---

## 2026-06-04 — Phase 8 Step C: internal user role escalation

### Work done

- **Migration `20260604000002_internal_user_read_submissions.sql`** — additive. One `submissions_select_internal` policy that grants SELECT to any partner with `is_internal = true`. Postgres OR's permissive SELECT policies, so `submissions_select_own_or_admin` keeps covering regular partners and admins unchanged. Mutating policies (`submissions_update_own`, `submissions_delete_own_draft`) are untouched, so internal users get read-only cross-partner access. Paired rollback at `supabase/rollback/phase-8-step-c-rollback.sql` drops exactly the new policy.
- **`src/lib/auth/require-admin-or-internal.ts`** — new shared helper. Returns `{ ok: true, userId, isAdmin, isInternal }` on pass, `{ ok: false, error }` otherwise. Status must be `active`; admin OR internal qualifies. Used by the admin layout, the partners list/invite pages, and the admin submissions page.
- **`src/app/(app)/admin/layout.tsx`** — gate switched from inline `role === "admin"` check to `requireAdminOrInternal()`. Same `notFound()` failure mode, so non-admin-non-internal partners get a 404, not a 403. Internal users now reach `/admin/partners`, `/admin/submissions`, and `/admin` (the overview is read-only RLS-scoped, so it shows the same partner + submission counts admins see).
- **Invite flow** — `invitePartner` action now calls `requireAdminOrInternal()`. The `isInternal` form input is honoured only when `gate.isAdmin` is true; non-admin callers get `is_internal = false` written regardless of what they submit (server-side enforcement, defence-in-depth on top of the now-conditional UI). The "Internal user" checkbox in `invite-form.tsx` is gated behind a new `showInternalToggle` prop; the new-partner page passes `gate.isAdmin` into it. Other partner actions (`suspendPartner`, `reactivatePartner`, `resendInvite`, `setPartnerInternal`) keep the local admin-only `requireAdmin()` helper.
- **`admin/partners/page.tsx`** — page-level `requireAdminOrInternal()` to compute `isAdmin`. Internal users see the table but the `InternalToggle` is replaced with a static "Internal ✓" / "—" label, and `PartnerRowActions` is replaced with "—". The "Invite partner" link stays for both.
- **`admin/submissions/page.tsx`** — page-level `requireAdminOrInternal()` to compute `isAdmin`. The XLSX export button (`showExport`) is gated on `isAdmin`. In the flat project view, the per-row `RowControls` (status select + Delete) is replaced for non-admins by a plain `STATUS_META[...].label` span. The partner-grouped view has no edit controls of its own, so internal users see the full accordion + drill-down read-only. The XLSX route (`/api/admin/forecast/xlsx`) already gates on `role = admin` → 403 for internal users; no change needed there. Action handlers (`adminUpdateStatus`, `adminDeleteSubmission`) keep their `role = admin` re-check.
- **`src/app/(app)/layout.tsx`** — `partner` SELECT now pulls `is_internal`. New `isAdminOrInternal` flag exposes nav links to `/admin/submissions?groupBy=partner` ("All Submissions") and `/admin/partners` ("Partners") whenever the flag is true. The orange "Admin" pill remains admin-only.
- **`scripts/test-rls.ts`** — `provisionPersona()` gains an `isInternal` option; a new `internalPersona` is provisioned alongside A, B, and the admin persona. Four new assertions: 8d (internal SELECTs B's submissions), 8e (internal UPDATE on B's row → 0 affected), 8f (internal DELETE on B's row → 0 affected), 8g (regular partner A still cannot SELECT B's submissions — confirms the policy doesn't leak). Cleanup tears down the internal persona too.

### Detours & fixes

- **Where the gate lives.** The brief reads as "change `requireAdmin()` to `requireAdminOrInternal()` at the page level," but the admin pages don't have page-level `requireAdmin()` calls in the first place — gating is done by `admin/layout.tsx` for the whole subtree, plus per-action checks. Moved the layout gate to the new helper (which fail-closes the same way for non-admin-non-internal) and added per-page `requireAdminOrInternal()` calls only where the page needs `isAdmin` as data to gate sub-controls (partners list, submissions list). The new-partner page gets a defence-in-depth re-call so the `isAdmin` it passes to `InviteForm` can't be spoofed by editing the URL.
- **Suspended-internal-user case.** The helper requires `status = "active"` for both paths. A suspended internal user falls through to "Not authorized." → layout `notFound()` → same behaviour as a suspended admin. The RLS policy itself is unguarded by status (it only checks `is_internal = true`), but the layout closes the door before the page can issue any queries. If we ever needed to enforce this purely at the policy level, the policy would also need `and partners.status = 'active'` — flagged here, not changed today.
- **Internal user reaching `/admin` overview.** Brief is silent on this. The overview is read-only and shows the same data internal users will see via the explicit nav links anyway; gating it separately would add a special-case rendering path for no obvious benefit. Left it accessible.
- **RLS tests not run in this session.** `scripts/test-rls.ts` needs service-role creds (same constraint flagged in the Phase 7 Step 1 journal entry). The test additions are reviewed visually and the policy is constructively safe (no `for all`, only `for select`; admin/own-row policies are unchanged). Andy will run the script after `supabase db push` per the verification recipe.

### Verification gates

| Gate | Result |
|---|---|
| `npm test` | ✅ 76/76 green (no test changes; covers existing forecast/recommend suites) |
| `npm run build` | ✅ Clean — 22 routes, 0 errors |
| `npx eslint` (8 changed files + the RLS script) | ✅ 0 errors (1 pre-existing `<img>` warning in `app/(app)/layout.tsx` unchanged) |
| Migration review | ✅ One additive `create policy`; no table changes, no policy drops. Paired rollback drops exactly that policy. |
| `scripts/test-rls.ts` | ⏭ Not run (no service-role creds in this session). 4 new assertions added; runs as part of Andy's pre-push checklist. |
| `no-ai-slop` audit on new user-facing strings (`All Submissions`, `Partners` nav labels, `Internal ✓` / `—` cell placeholders) | ✅ No banned phrases. |

### Decisions captured

- No new ADR. The choice is mechanically additive (one RLS policy, layout gate widening, per-control admin gates) and follows the precedent set by ADR 0045 / Phase 7 Step 1 — `is_internal` already exists as the authorization flag. No alternative was seriously considered.

---

## 2026-06-04 — Phase 8 Steps A + B: CSS/copy fixes + submissions dollar totals

### Work done

**Step A — CSS and copy fixes**

- **A1 (`videox-compare.css`)**: diff-row highlight changed from left-border-only to a full-row gold background wash (`rgba(251,176,64,0.08) !important`). Left border kept as secondary signal. The `!important` matches the existing pattern used by `.vxc-td-below`; since the below-requirement rule appears later in the file its `!important` still wins when both classes are present (red > gold for cells that are below the camera threshold AND in a diff row).
- **A2 (`videox-compare-form.tsx`, `videox-compare.css`)**: Subtitle rewritten to two clean sentences — no em dash. Element changed from `<div>` to `<p>`. CSS `.vxc-st` max-width tightened from `620px` to `480px`; `text-align: center` added explicitly so the constrained block centers its text symmetrically within the gold-underlined header.
- **A3 (`dashboard/page.tsx`)**: All three em dashes removed (Server Comparison description, VideoX QuickCompare description, Register a Deal description). QuickCompare description text updated to match A2 wording. All five text-link-with-arrow actions converted to filled gold `bg-[#fbb040]` buttons matching the existing "Open a Support Ticket" treatment: Compare servers, Compare models, Open price book, Support Documentation, Download XLSX. Arrows dropped. For cards where the whole card is a `<Link>`, the button is a `<span>` (valid — no nested interactive element). For the Support Documentation link (a real `<a>` inside a non-Link card) the class was applied directly to the `<a>` tag.

**Step B — Submissions page dollar totals**

- **`submissions/page.tsx`**: Added `partner_id` to the Supabase SELECT (already a NOT NULL column; no migration). Added `import { groupIntoDeals, computeWeightedForecast, type SubmissionRow }` from the forecast library. After loading rows, maps them to `SubmissionRow[]` and calls `groupIntoDeals(forecastRows, [])` — empty partners array is intentional: display names aren't needed for dollar summation, and on-behalf grouping still works correctly because the FK and free-typed company fields are in each row. Pre-filters out `lost` deals before `computeWeightedForecast` (see Detours). Passes `totalOpenPipeline` and `weightedForecast` as new optional props to `<Pipeline>`.
- **`submissions/pipeline.tsx`**: Added `totalOpenPipeline?: number` and `weightedForecast?: number` props (optional so the admin view's absence of these props is a no-op). Added `fmtAmount()` helper: `$0` for zero, no decimals for round integers, two decimals otherwise. Summary bar renders between the status filter pills and the error/content block; subdued `bg-neutral-100` background with `text-sm text-neutral-600` body text — smaller than the project group headers. Bar shows even when totals are zero. Bar is hidden if props are undefined (admin context).
- **`forecast.test.ts`**: Added one test (`computeWeightedForecast — lost excluded from open pipeline (pre-filter pattern)`) demonstrating the `deals.filter(d => d.status !== "lost")` pattern used in the page. 76/76 green.

### Detours & fixes

- **`computeWeightedForecast` includes `lost` in `totalOpenPipeline`.** The existing function skips `draft` and `null` but keeps `lost` (it just weights it at 0 for `weightedForecast`). For the dashboard funnel card this behaviour was intentional (it reports all-time pipeline volume). For the submissions bar the requirement explicitly excludes lost from the open-pipeline total. Rather than change the shared function (which would break the existing dashboard test and funnel card semantics), I pre-filter at the call site: `const openDeals = deals.filter(d => d.status !== "lost")`. When the user is on the "Lost" status filter, the bar correctly shows `$0 · $0`.
- **"at a glance" in A2/A3 copy.** The general rule bans it, but the brief provides it verbatim as the required replacement text. Kept per explicit instruction. Flagged here.

### Verification gates

| Gate | Result |
|---|---|
| `npm test` | ✅ 76/76 green (75 prior + 1 new lost-exclusion test) |
| `npm run build` | ✅ Clean — 22 routes, 0 errors |
| `npx eslint` (5 changed files) | ✅ 0 errors |
| Em-dash audit (`dashboard/page.tsx`) | ✅ 0 em dashes remain |
| Em-dash audit (`videox-compare-form.tsx`) | ✅ 0 em dashes remain |
| Scope guard: no migration, no admin view changes, no RLS changes | ✅ Confirmed |

---

## 2026-06-04 — Phase 7 Step 1: internal "on behalf of" calculations

### Work done

- **Migration `20260604000001_phase7_on_behalf.sql`** — additive, RLS-neutral. `partners.is_internal boolean not null default false`; `submissions.on_behalf_of_partner_id` (FK → partners) + `submissions.on_behalf_of_company_name` (text) + an index on the FK. No policy changes — the creator-based insert/select policies already cover on-behalf rows (`partner_id` stays = creator), and admins already read across partners.
- **`src/lib/pipeline/forecast.ts`** — new `effectivePartner()` helper computes the bucket as `COALESCE(on_behalf_of_partner_id, lower(trim(company_name)), partner_id)` and resolves the display label. `groupIntoDeals` now groups by the effective partner, so every consumer follows automatically. Added the two columns to `SubmissionRow` (optional, so existing fixtures/callers compile unchanged).
- **`SubmissionRow` queries** updated to select the new columns: admin submissions (partner-grouped view), dashboard, and the forecast XLSX route. The dashboard also resolves on-behalf FK targets' names via the admin client (the rep can't read other partners under their own RLS scope), so its grouped view shows a company name rather than a UUID.
- **`src/app/(app)/calculator/actions.ts`** — `onBehalfOf` added to the submission schema; caller `is_internal` loaded alongside status; server-side authorization (a target is honoured only for internal callers). A typed value that exactly (case-insensitively) matches an existing partner's company binds the FK (and resolves the target's email for the Pipedrive person); otherwise it banks as free text (org-only deal). At most one of the two columns is set. The deal is billed against the target; the rep is credited via a pinned note.
- **`src/lib/pipedrive/deal.ts`** — `DealPartnerInput.contactName/email` made optional; `createDealFromSubmission` skips the person upsert when no email is supplied (free-typed org-only) and accepts an optional pinned `onBehalfNote`. Same person guard applied to `createComparisonDeal` for type-safety.
- **Calculator UI** — `page.tsx` loads `is_internal` and (for internal users only, via the admin client since RLS blocks listing partners) the partner company-name suggestions. `calculator-form.tsx` renders an "On behalf of" free-text + datalist field, gated on `isInternal`, mirroring the Project Name pattern.
- **Admin surface** — invite form gains an "Internal user" checkbox (`invitePartner` writes `is_internal`); partners table gains an "Internal" column with a per-row `InternalToggle` (new `setPartnerInternal` action, `requireAdmin`-gated) to retrofit existing staff.
- **Tests** — 4 new `groupIntoDeals` cases (FK roll-up, grouping with the target's own submissions, free-typed normalisation + label, self-serve unchanged). Full suite green (75 tests).

### Detours & fixes

- **Considered denormalising the company name into both columns** to give every grouped view an inline display label. Backed out to honour the brief's locked "at most one set" invariant (DB CHECK enforces it). The one place this bites — the RLS-scoped rep dashboard, which can't read other partners' names from a bare FK — is handled with a scoped service-role name lookup in the dashboard loader instead. Rationale in ADR 0045.
- **Narrow `deal.ts` touch for the free-typed case.** `upsertPerson` has no graceful empty-email path — a free-typed target would have created a junk person. The brief sanctioned a minimal branch; `createDealFromSubmission` now skips the person upsert when no email is supplied (same guard applied to `createComparisonDeal` for type-safety). The 13 `deal.test.ts` cases stay byte-for-byte green.
- **Post-deploy bug: ambiguous PostgREST embed (PR #3).** Adding `on_behalf_of_partner_id` gave `submissions` a *second* FK to `partners`, so every `partners!inner(...)` embed broke with "more than one relationship was found" — taking out `/admin`, `/admin/submissions`, and `/admin/submissions/[id]` once the migration went live. Root cause: I added the FK without auditing existing embeds. Fix: pin each of the three embeds to the creator relationship via the constraint hint `partners!submissions_partner_id_fkey!inner(...)`. Verified against the live DB. Lesson: a new FK to an already-embedded table is a breaking change for PostgREST resource embedding — grep for `<table>!inner` before adding one.
- **Follow-up: surface the target company on `/submissions` "My Pipeline" (PR #4).** On-behalf submissions recorded the target correctly but the pipeline view grouped by project name only, so a rep couldn't tell which partner a project was for. Added an "On behalf of {company}" badge on the project-group header, resolving FK targets' names via the admin client (same RLS-scoped pattern as the dashboard).

### Verification gates

- `npm run build` — clean, all 18 routes in the manifest (`/calculator`, `/dashboard`, `/admin/partners` included).
- `npx eslint` on all 13 changed files — 0 errors.
- `npm test` — 75/75 green, including 4 new `groupIntoDeals` on-behalf cases and the unchanged 13 `deal.test.ts` cases.
- `scripts/test-rls.ts` — not run (no service-role creds in this session). The change is RLS-neutral by construction: no policies added or altered, `partner_id` stays = creator, so `submissions_insert_self` / `submissions_select_own_or_admin` already cover on-behalf rows.
- Migration reviewed: additive ALTERs + a CHECK constraint, valid syntax; paired rollback at `supabase/rollback/phase-7-step-1-rollback.sql` drops exactly the three columns (+ constraint + index). `scripts/backup-tables.ts` is a pre-push step — due before `supabase db push`, not run yet (nothing pushed).
- `no-ai-slop` audit over user-facing strings + this entry — 0 AI-isms.

### Decisions captured

- [`0045-on-behalf-of-calculations.md`](./decisions/0045-on-behalf-of-calculations.md)

## 2026-06-02 — Phase 6 Step 2: VMS Selector + Validation Sheets

### Work done

- **`src/lib/videox-compare/vms.ts`** — new constants file. `VMS_OPTIONS` (three entries: Avigilon/ACC7, Milestone/Xprotect, Genetec/Omnicast), each with `id`, `name`, `vmsProduct`, `sheetUrl`, and `sheetLabel`. Exports `VmsId` union type derived from the `as const` array. No external deps.
- **`src/app/(app)/videox-compare/videox-compare-form.tsx`** — added `selectedVms: VmsId | null` state (default `null`). VMS toggle row: three pill buttons (`Avigilon | Milestone | Genetec`) rendered below the camera filter, above the table. Click selects; click again deselects (returns to `null`). VMS banner: shown when `selectedVms !== null`; text "VideoX V5 is validated for [name] [vmsProduct]"; download link styled as secondary button opens PDF in new tab; defensive `sheetUrl` null-check renders muted "coming soon" text (not currently reachable). Controls are fully independent — VMS selection does not affect compare mode, camera filter, or table data.
- **`src/app/(app)/videox-compare/videox-compare.css`** — added `.vxc-vms-toggle`, `.vxc-vms-pill`, `.vxc-vms-pill--active`, `.vxc-vms-banner`, `.vxc-vms-banner-text`, `.vxc-vms-sheet-link`, `.vxc-vms-sheet-pending` all scoped under `#arxys-vxc-root`. Responsive: pills wrap on narrow screens; banner stacks vertically below 640 px.

### Verification gates

| Gate | Result |
|---|---|
| `npm run build` | ✅ Clean — `/videox-compare` in manifest |
| `npx eslint` (changed files) | ✅ 0 errors |
| `npm test` | ✅ 71/71 pass |
| Language audit | ✅ "certified" appears nowhere in changed files |

---

## 2026-06-02 — Phase 6 Step 1: VideoX QuickCompare

### Work done

- **`supabase/migrations/20260602000001_quickcompare_columns.sql`** — additive migration adding 25 nullable columns to `product_specs` (rack_units, drive_bays, max_bandwidth_mbps, os_edition, ram_spec, cpu_model_full, cpu_turbo_ghz, cores_threads, cpu_cache, mem_bandwidth, avx_512, workload_affinity, chiplet_arch, infinity_guard, hotswap_power, hdd_count, hdd_mtbf, raid_level_display, battery_raid, os_ssd_type, os_redundancy, gbe_1_ports, gbe_10_ports, sfp_addon, avigilon_gpu). One `UPDATE … WHERE id LIKE 'VX5-Vnnn-%'` per family seeds identical values across each family's SKU tiers. No existing columns, rows, indexes, or RLS policies touched. Source: `VideoX-QuickCompare-V5.xlsx`, "Arxys V5" sheet. Matching rollback at **`supabase/rollback/quickcompare-columns-rollback.sql`** (drops exactly the 25 columns).
- **`src/lib/comparison/types.ts`** — extended `ProductSpec` with the 25 new fields as optional/nullable. The comparison & calculator tools are unaffected: their `DISPLAY_SPECS` reference only `SharedSpecKey` fields.
- **`src/lib/videox-compare/{types,data,specs}.ts`** — `QuickCompareModel` type (camelCase, family-level); `getQuickCompareModels()` queries `product_specs` (`id LIKE 'VX5-V%'`), dedupes to the first row per family, and returns the 7 families ordered V100→V800; `QUICK_COMPARE_SPECS` (26 rows across Overview/System/Storage/Networking), `SECTIONS`, verbatim `TOOLTIPS`, and `FOOTNOTE`.
- **`src/app/(app)/videox-compare/page.tsx`** — Server Component, calls `getQuickCompareModels()`, mirrors `/comparison`'s back-link layout.
- **`src/app/(app)/videox-compare/videox-compare-form.tsx`** — Client Component. Full sticky-label/sticky-header table; compare mode (checkbox per model header → 2+ checked collapses to selected columns, "Show all models" reset); diff highlighting (gold left-border on rows whose displayed values differ across selected models); "Minimum cameras needed" filter (below-requirement header badge + red-tinted Max Cameras cell, works in both views); CSS tooltips on technical rows (hover + keyboard focus); verbatim footnote.
- **`src/app/(app)/videox-compare/videox-compare.css`** — scoped to `#arxys-vxc-root` (prefix `vxc-`), mirroring the comparison tool's scoping; uses global Arxys brand tokens, no new fonts.
- **`src/app/(app)/dashboard/page.tsx`** — "VideoX QuickCompare" card added after Server Comparison.
- **`src/app/(app)/layout.tsx`** — "QuickCompare" nav link added before Price Book.

### Detours & fixes

- **No V900, and it can't go in `product_specs`.** The brief assumed all 8 V5 families were in `product_specs`, but the table holds only 7 (V100–V800, 21 rows); there is no V900 anywhere in the repo. Adding V900 would require fabricating the NOT NULL base columns (`msrp`, `storage_raw_tb`, `cpu_passmark`, …), which breaks the "no pricing" rule and would leak a fake V900 into `/comparison` and `/calculator`. Per decision, V900 is **ignored** — QuickCompare ships 7 families. Revisit when V900 has real `product_specs` rows.
- **Column-name collision.** The brief's new `cpu_model` column collides with the existing NOT NULL `product_specs.cpu_model`. Renamed the QuickCompare column to `cpu_model_full` (same pattern the brief used for `raid_level_display` vs `raid_support`).
- **Missing `max_bandwidth` column.** The Overview "Max Bandwidth" row had no backing column in the brief's list nor in `product_specs`. Added `max_bandwidth_mbps`.
- **V600 rack-unit typo in source spreadsheet — resolved.** The QuickCompare spreadsheet listed **V600 = 2U**, but `product_specs.form_factor` *and* the in-repo price-book both say **3U** ("3U 16Bay"), and 16 bays in 2U is physically implausible. Flagged it; Andy confirmed **3U** (2026-06-02), so the migration seeds `rack_units = '3U'` for V600. The spreadsheet value was a typo.
- **Note — QuickCompare CPU specs differ from comparison-tool columns by design.** For V100/V200 the sheet says 6C/12T (matches the price-book), while the existing `cpu_cores_threads` says 8C/16T. The new columns hold QuickCompare's marketing-canonical values; the old columns stay untouched for the comparison tool. Not a bug.
- **Migration not yet pushed to cloud.** The new columns don't exist on the cloud DB yet, so `getQuickCompareModels()` returns rows with the new fields null and the page renders em-dashes until `supabase db push` runs. Graceful by design (all new fields are nullable / `?? null`).

### Verification gates

| Gate | Result |
|---|---|
| `npm run build` | ✅ Clean — `/videox-compare` route in manifest |
| `npx eslint` (new/changed files) | ✅ 0 errors (lone pre-existing `<img>` warning in layout.tsx) |
| `npm test` | ✅ 71/71 pass — no regressions |
| `scripts/test-rls.ts` | ✅ All pass — no RLS regressions (no policy changes) |
| Migration SQL review | ✅ Additive ALTER + per-family UPDATE; valid syntax |
| Rollback SQL review | ✅ Drops exactly the 25 added columns, nothing else |

### Decisions captured

- [`0044-quickcompare-extends-product-specs.md`](./decisions/0044-quickcompare-extends-product-specs.md)

---

## 2026-05-29 — Phase 5 Step 3: PDF + quote action

### Work done

- **`src/lib/pdf/comparison-template.tsx`** — `@react-pdf/renderer` Document with header (ARXYS logo, date, partner name), competitor→Arxys match row, 3-column spec table (Specification | Competitor | Arxys VideoX), pricing section (competitor quote, Arxys MSRP, savings per server, deployment total), fixed footer. Exports `ComparisonPdfInput`, `renderComparisonPdfBuffer()`, `comparisonPdfFilename()`.
- **`src/app/(app)/api/comparison/pdf/route.ts`** — POST route (nodejs runtime, force-dynamic). Auth-gated (returns 401 for unauthenticated). Accepts `Omit<ComparisonPdfInput, 'generatedAt'>` JSON body, generates PDF, streams with `application/pdf` Content-Disposition header.
- **`src/app/(app)/comparison/actions.ts`** — `requestComparisonQuote()` Server Action. Validates with zod, looks up partner record RLS-scoped, calls `createComparisonDeal()`, sends internal notification email (no PDF attachment, no partner email). Email failure is non-blocking.
- **`src/lib/pipedrive/deal.ts`** — added `createComparisonDeal()`. Title prefix `"Comparison:"` + pinned note with `lead_source: comparison_tool`, competitor model, Arxys match ID, server count. Same pipeline/stage as sizing deals. See ADR 0043.
- **`src/app/(app)/comparison/comparison-form.tsx`** — buttons wired: `handleDownloadPdf()` (POST fetch → blob → anchor download), `handleRequestQuote()` (Server Action call). Quote button disabled after success (idempotency). Success/error feedback inline. PDF and quote status tracked independently.
- **`src/app/(app)/comparison/comparison.css`** — active button styles, `.ac-cta-success`, `.ac-cta-error`.

### Verification gates

| Gate | Result |
|---|---|
| `npm run build` | ✅ Clean — `/api/comparison/pdf` route compiled |
| `npx eslint` (new/changed files) | ✅ 0 errors |
| `npm test` | ✅ 71/71 pass |
| `scripts/test-rls.ts` | ✅ 18/18 pass |

### Decisions captured

- [`0043-comparison-pipedrive-deal.md`](./decisions/0043-comparison-pipedrive-deal.md)

---

## 2026-05-29 — Phase 5 Step 2: Comparison UI

### Work done

- **`src/lib/comparison/display-specs.ts`** — `DISPLAY_SPECS: DisplaySpec[]` (13 rows, `os` excluded per `show_in_calculator=NO`, `cpu_architecture` renamed to `cpu_passmark`) and `MESSAGES: Record<string, string>` from the JSON messages array.
- **`src/lib/comparison/data.ts`** — `getComparisonData()` server function; fetches both tables, returns `productSpecs` (Record indexed by id) and `competitorsByVendor` (grouped with brandName/productLine metadata).
- **`src/app/(app)/comparison/page.tsx`** — Server Component; calls `getComparisonData()`, passes typed props + constants to `ComparisonForm`.
- **`src/app/(app)/comparison/comparison-form.tsx`** — client component. State: `selectedVendor`, `selectedModelId`, `userPrice`, `serverCount (1–25)`. Renders vendor select → model select → results panel (spec table, pricing section, deployment multiplier slider, three callouts, CTA buttons). Results panel hidden until model is selected. Advantage column: numeric delta/percentage for numeric fields; fixed "Arxys advantage" badge for string fields with `highlight_if_better=true`. CTA buttons present but disabled (wired in Step 3).
- **`src/app/(app)/comparison/comparison.css`** — scoped to `#arxys-cmp-root`; mirrors calculator CSS approach. Advantage badges: gold for string fields, green for numeric wins, red for numeric losses. Mobile: advantage column hidden below 600px.
- **`src/app/(app)/dashboard/page.tsx`** — added "Server Comparison" card above Price Book.

### Verification gates

| Gate | Result |
|---|---|
| `npm run build` | ✅ Clean — `/comparison` route compiled |
| `npx eslint` (new/changed files) | ✅ 0 errors |
| `npm test` | ✅ 71/71 pass — no regressions |
| `scripts/test-rls.ts` | ✅ 18/18 pass |

---

## 2026-05-29 — Phase 5 Step 1: Comparison schema + seed

### Work done

- **`data/server-specs.json`** committed to repo (copied from `~/Downloads/arxys-compare/data/`). This is the WP plugin's authoritative data file and the single source of truth for both new tables.
- **Migration `20260529000001_phase5_product_specs.sql`** — creates `product_specs` table (text PK matching JSON IDs, 19 columns including `cpu_passmark` mapped from JSON's `cpu_architecture`). RLS: enabled, authenticated SELECT always permitted. Seeded 21 Arxys VideoX rows inline (V100×3, V200×3, V400×3, V500×3, V600×3, V700×3, V800×3).
- **Migration `20260529000002_phase5_competitor_products.sql`** — creates `competitor_products` table with FK `arxys_match_id → product_specs(id)`. RLS: same pattern. Seeded 14 Milestone Husky IVO + 20 Avigilon NVR6 rows (34 total). Avigilon `msrp_current` rows seed as NULL (competitor pricing not displayed).
- **`scripts/update-comparison-data.ts`** — idempotent upsert script for future JSON refreshes. Accepts `--path` override; requires CONFIRM before writing. Mirrors `push-prices.ts` structure.
- **`src/lib/comparison/types.ts`** — `ProductSpec`, `CompetitorProduct`, `SharedSpecKey`, `NumericSpecKey`, `DisplaySpec`, `ComparisonMessage` types derived from the JSON/DB schema.
- **Open questions OQ-1 through OQ-3 confirmed**: separate table (not extending products), inline seed, numeric delta + badge for string fields.
- One naming decision: `cpu_architecture` in the JSON stores Passmark scores; mapped to `cpu_passmark` in both DB tables and the TypeScript types for clarity.

### Verification gates

| Gate | Result |
|---|---|
| `npm run build` | ✅ Clean — no new routes yet |
| `npx eslint` (new files) | ✅ 0 errors |
| `supabase db push` | ✅ Both migrations applied cleanly |
| `scripts/test-rls.ts` | ✅ 18/18 pass — no regressions |
| Manual: row counts | ✅ 21 + 34 rows; 0 broken FK refs; 0 null MSRPs |
| Manual: update script dry-run | ✅ Parses JSON correctly, reports correct counts |

### Decisions captured

- [`0042-comparison-data-architecture.md`](./decisions/0042-comparison-data-architecture.md)

---

## 2026-05-28 — Multi-group aggregation of Pipedrive per-stream deal fields

### Work done

- **Problem**: deals with multiple camera groups only showed the *primary* group's per-stream values (resolution, FPS, codec, complexity, recording, motion) — sales perceived this as "averaging" / hidden data. Applies to every deal write, not just revisions.
- **`buildDealFields` now aggregates across `submission.groups`** ([`deal.ts`](../src/lib/pipedrive/deal.ts)), per Pipedrive field type:
  - Free-text (Frame Rate, Motion Activity %, Recording hours): distinct values, sorted ascending, comma-separated via `distinctSortedNumberList` (e.g. `"10, 15, 20"`).
  - Resolution: forced to uniform megapixels via `resolutionLabelToMp` (parse the `(W×H)` suffix → `round(W·H/1e6)`, floor 1MP), distinct + sorted → `"2MP, 4MP, 8MP"`. Pixel dimensions and marketing labels dropped.
  - Scene Complexity (multi-select set): all distinct tier option IDs comma-joined (`"287,289"`).
  - Recording (single-select enum): any group < 100% duty cycle ⇒ "On Motion" (119), else "Continuous" (118).
  - CODEC (single-select enum, can't list multiple): dominant codec by total cameras across groups; ties first-seen.
- **`DealSubmissionInput.primaryGroup` replaced by `groups: DealGroup[]`** (each carries `cameras`). [`actions.ts`](../src/app/(app)/calculator/actions.ts) now maps the full `computed` array into `groups` for both the create and revision paths, so aggregation is identical for new submissions and revisions.
- **Tests** ([`deal.test.ts`](../src/lib/pipedrive/deal.test.ts)): fixture switched to a `groups` array; single-group assertions updated (Resolution `"4MP (2560×1440)"`→`"4MP"`, Scene Complexity `288`→`"288"` string set); new multi-group test asserting all five aggregation rules at once (FPS `"10, 15, 20"`, MP `"2MP, 4MP, 8MP"`, recording hours `"12, 24"`, complexity set `"287,289"`, Recording 119, dominant CODEC 139).

### Decisions captured

- [`0041-multi-group-pipedrive-field-aggregation.md`](./decisions/0041-multi-group-pipedrive-field-aggregation.md)

### Verification gates

| Gate | Result |
|---|---|
| `npm test` | ✅ **71/71 pass** (+1 multi-group aggregation test) |
| `npm run build` | ✅ Clean — same route manifest |
| `npx eslint` (touched files) | ✅ 0 errors |
| `npx tsc --noEmit` | ✅ Only the 2 pre-existing errors in untouched test files (`pdf/render.test.ts`, `price-book/xlsx.test.ts`) |

### Smoke test (manual, deferred to Andy)

Create/revise a quote with **three groups** at distinct FPS / resolutions / codecs / complexities, then open the Pipedrive deal and confirm:

- **Frame Rate** lists every distinct FPS, ascending (e.g. `10, 15, 20`).
- **Resolution** shows MP only, distinct + ascending (e.g. `2MP, 4MP, 8MP`) — no pixel dimensions.
- **Motion Activity %** and **Recording hours** list all distinct values ascending.
- **Scene Complexity** shows every tier used (e.g. `Low, High`).
- **Recording** = "On Motion" if any group is < 100%, else "Continuous".
- **CODEC** = the codec used by the most cameras.

---

## 2026-05-28 — Phase 4 Step 3: Quote revision + non-destructive Pipedrive deal update

### Work done

- **Rehydration module** — new [`src/lib/calculator/rehydrate.ts`](../src/lib/calculator/rehydrate.ts). `normalizeInputState(raw)` coerces a raw `input_state` blob into a fully-defaulted, range-clamped shape (tolerates null/partial/old rows). `fromStoredSubmission(row)` builds the form's initial state, resolving each group's resolution/codec/complexity index by the banked `groups_payload` *value* (label / codec value / tier) first — order-independent — and falling back to the raw stored index, then clamping. Add-on booleans are gated on a new additive `version` stamp (`INPUT_STATE_VERSION = 1`); pre-stamp rows default add-ons to false. New [`rehydrate.test.ts`](../src/lib/calculator/rehydrate.test.ts) (10 tests) including an index-shift resilience case proving stale raw indices are corrected via banked labels. **No migration** — the version stamp is just another key in the existing `input_state` JSON.
- **Version stamp in [`actions.ts`](../src/app/(app)/calculator/actions.ts)** — `input_state` is now written as an explicit object `{ version: INPUT_STATE_VERSION, ...calculator inputs }` rather than the raw parsed payload, so the revision flags never leak into the banked state.
- **Form rehydration** — [`calculator-form.tsx`](../src/app/(app)/calculator/calculator-form.tsx) accepts optional `initialState` + `sourceSubmissionId` props seeding all `useState` initializers. A rehydrated form starts `hasInteracted = true` (immediately re-submittable). New `revisionSourceId` state is tracked so `reset()` clears the revision link (a reset-then-submit saves a fresh quote, not a blank-data mutation of the old deal). Submit payload gains `isRevision` + `sourceSubmissionId`.
- **Entry points** — `/calculator?revise={id}` loader in [`page.tsx`](../src/app/(app)/calculator/page.tsx) reads the source row RLS-scoped (`select id, input_state, groups_payload`) and passes rehydrated `initialState`; a forbidden/missing row silently yields a fresh calculator. "Edit / revise quote" link added to the partner submission-detail action bar and a "Revise" link to each pipeline row.
- **Pipedrive PUT support** — [`client.ts`](../src/lib/pipedrive/client.ts) `request()` now allows `"PUT"`; added `updateDeal(id, payload)` → `PUT /v1/deals/{id}` and an `UpdateDealPayload` type that has no routing fields.
- **Shared `buildDealFields()`** — [`deal.ts`](../src/lib/pipedrive/deal.ts) extracts the calculator-derived payload portion (value + six `arxys_*` + admin calculator fields, **no** title/currency/user_id/person_id/org_id/pipeline_id/stage_id). `createDealFromSubmission` spreads it and adds the routing fields; new `updateDealFromRevision(dealId, submission, recommendation)` sends it verbatim, resolves only field keys (never pipeline/stage/owner, no person/org upsert), and posts a single "Revised from portal {date}" note (try/catch, non-blocking). The create path's payload is byte-for-byte unchanged — verified by the existing 9 deal tests.
- **Revision branch in `actions.ts`** — accepts `isRevision`/`sourceSubmissionId` in the schema; on a revision it reads the source `pipedrive_deal_id` RLS-scoped → if present, `updateDealFromRevision` + links the new row to the same deal id; if absent or the PUT 404s, falls back to `createDealFromSubmission`. **No new sales-notification email on a revision** (both PDF render and email send are skipped).

### Verification gates

| Gate | Result |
|---|---|
| `npm test` | ✅ **70/70 pass** (13 new: 10 rehydrate incl. index-shift + 3 deal-update) |
| `npm run build` | ✅ Clean — TypeScript passes, same route manifest |
| `npm run lint` | ✅ 0 errors — same 2 pre-existing `<img>` warnings |
| `scripts/test-rls.ts` | ✅ **18/18 pass** — new Test 18: partner A cannot SELECT B's submission to revise it |
| Manual smoke | ⏳ Deferred to Andy — calculator needs an authed session; see checklist below |

The deal-update test explicitly asserts `stage_id` / `user_id` / `pipeline_id` (and `title`/`currency`/`person_id`/`org_id`) are **absent** from the PUT body, and that no pipeline/stage/owner/contact lookups fire on a revision.

### Manual smoke checklist (for Andy)

1. **Revise entry point**: open a past submission → click "Edit / revise quote" (detail page) or "Revise" (pipeline row) → calculator opens pre-filled with that quote's groups, retention, VMS, project name, add-ons.
2. **Rehydrated form is submittable**: the Save button is enabled immediately (no need to touch a field first).
3. **Save a revision**: change a camera count → Save → a *new* draft submission appears in the pipeline (the original is untouched).
4. **Deal updated in place**: open the source quote's Pipedrive deal → confirm `value`, camera count, and portal URL refreshed; **stage, owner, and pipeline unchanged**; a pinned "Revised from portal {date}" note added.
5. **No new email**: confirm sales did *not* receive a new submission-notification email for the revision.
6. **Reset clears revision link**: on a rehydrated form, click Reset → Save → confirm this creates a brand-new deal (not an update of the old one).
7. **Fallback to create**: revise a quote whose source has no Pipedrive deal (or whose deal was deleted) → confirm a new deal is created instead of erroring.
8. **RLS**: confirm you cannot reach another partner's quote via `/calculator?revise={their-id}` (form loads empty/fresh).

### Decisions captured

- [`0039-quote-revision-rehydration.md`](./decisions/0039-quote-revision-rehydration.md) — new-row-not-mutate, value-first index resolution, additive version stamp, no migration.
- [`0040-pipedrive-deal-update-on-revision.md`](./decisions/0040-pipedrive-deal-update-on-revision.md) — non-destructive field subset via shared builder, RLS-scoped deal lookup, fallback-to-create, single revision note, no revision email.

---

## 2026-05-28 — Phase 4 Step 2: Calculator improvements

### Work done

- **Bug fix — reset leaves stale result.** Added `resultDismissed` boolean state to `calculator-form.tsx`. `reset()` sets it to `true`; `touch()` sets it to `true` when `submitState.status === "ok"` (dismisses panel on first input change after a successful submit); the submit button click sets it to `false` so the new result always shows. The `RecommendationPanel` and error div are both gated on `!resultDismissed`.
- **`formatNumber` fix** (`src/lib/calculator/compute.ts`): the `>=1000` branch was calling `.replace(/\.\d+$/, s => s.slice(0, 2))` which truncated to one decimal. Removed the replace; `withThousands()` already uses `.toFixed(2)` so the output is now `"1,234.57"` rather than `"1,234.5"`. New `src/lib/calculator/compute.test.ts` covers the fix plus `formatStorageGb` and `formatBandwidthMbps`.
- **Results-table "Rec" column** now shows hours (`Math.round((recordingPercent / 100) * 24) hrs`) instead of a raw percent, matching the Hrs/Day input. No PDF change needed — the PDF already used hours.
- **Transient empty numeric inputs.** Added `numericDrafts` Map state. While typing, the raw string is stored as a draft (so the field can be visually empty); on `onBlur`, the draft is cleared and the clamped integer value is committed to state. Applies to: cameras, FPS, Hrs/Day (per group) and Retention days (global).
- **A11y.** `aria-label` added to the motion `<input type="range">` per group (`"Scene motion level for {name}, {pct}%"`). `Tooltip` trigger gains `tabIndex={0}` so it's keyboard-focusable; the existing CSS `.ax-tip:focus-within .ax-tt` reveals the tooltip on focus (verified the CSS rule was already present via `:focus-within`).
- **Add-on toggles → Pipedrive note.** Two checkboxes ("Failover Recorder", "Management Server") in the global-settings block of `calculator-form.tsx`. Both booleans flow into the submit payload → `submissionSchema` (optional, default false) → `input_state` automatically → `createDealFromSubmission`. In `deal.ts`, after `createDeal` succeeds, if either add-on is checked, a pinned note is posted via `pipedriveClient.createNote`; the note call is wrapped in its own try/catch so a note failure never blocks the deal. Both toggles reset on `reset()`.
- **Min/max options display.** New `src/lib/recommend/headroom.ts`: `pickHeadroomOption(winner, alternatives)` — returns the cheapest alternative whose `coveredCameras` and `coveredStorageTb` both strictly exceed the winner's (fewer units on cost tie), or `null` if none exists. `RecommendationPanel` now renders: winner (recommended), up to 2 cheapest runner-ups (alternatives), and the headroom pick (room to grow) with capacity details. No change to the recommendation algorithm.

### Verification gates

| Gate | Result |
|---|---|
| `npm test` | ✅ **57/57 pass** (14 new: 8 compute + 6 headroom) |
| `npm run build` | ✅ Clean — same route manifest as Step 1 |
| `npm run lint` | ✅ 0 errors — same 2 pre-existing `<img>` warnings |
| `scripts/test-rls.ts` | ✅ **17/17 pass** — no RLS changes; Step 2 is calculator-only |
| Manual smoke | ⏳ Deferred to Andy — see click-through checklist below |

### Manual smoke checklist (for Andy)

1. **Reset clears panel**: submit a quote → see the recommendation panel → click Reset → panel disappears.
2. **Input change clears panel**: submit a quote → see the panel → change any camera count or FPS → panel disappears.
3. **New submit shows new result**: after dismissal, click "Save & request quote" again → new recommendation panel appears.
4. **Transient empty field**: click into the "Video Streams" field, select-all and delete → field shows blank (no snap to 1) → blur → field snaps to 1.
5. **Rec column shows hours**: check the results table → the Rec column shows e.g. "24 hrs" not "100%".
6. **`formatNumber` ≥1000**: submit a configuration that produces storage in the thousands of TB; confirm the displayed number uses two decimal places and a thousands separator.
7. **Keyboard tooltip**: Tab to the Codec info icon → tooltip text appears.
8. **Keyboard slider**: Tab to the Motion range slider for a group → left/right arrow keys change the value.
9. **Add-on toggles**: check "Failover Recorder" and "Management Server" → submit → open the resulting Pipedrive deal → confirm a pinned note shows "Add-ons requested — Failover recorder: Yes · Management server: Yes". Also confirm submitting with both unchecked produces no note.
10. **Min/max display**: submit any quote that has alternatives → confirm the recommendation panel shows "Recommended", "Alternatives" (1–2 rows), and (if a headroom candidate exists) "Room to grow" with coverage details.

---

## 2026-05-28 — Phase 4 Step 1: Partner pipeline forecast

### Work done

- **`src/lib/pipeline/forecast.ts`** — Pure forecast library (no Supabase import). `STAGE_PROBABILITY` constant (on-hold 20%, sent 40%, won 100%, lost 0%); `groupIntoDeals(submissions, partners)` collapses rows to one deal per (partner_id, trimmed-lower project_name) using the preferred submission if starred, else most-recent by `created_at`; `computeWeightedForecast(deals)` filters draft/NULL before weighting and returns `{ totalOpenPipeline, weightedForecast }`.
- **`src/lib/pipeline/forecast.test.ts`** — 12 tests covering: dedup to one deal, case-insensitive/whitespace normalisation, cross-partner isolation, preferred-over-latest representative selection, weighted-sum arithmetic, draft exclusion from pipeline dollars, null-status exclusion, and null `project_name` handling.
- **`src/app/(app)/admin/submissions/page.tsx`** — Added `?groupBy=partner` toggle. Partner mode: summary cards (active partners, open-pipeline total, weighted forecast, per-status counts + separate draft count), per-partner expandable accordion → deals → submissions drill-down. Added `?status=` and `?from=` / `?to=` date-range filters across both views. Refactored the page header into a shared `PageHeader` component. Kept the existing flat project view intact; pagination, partner filter, and View links unchanged.
- **`src/app/(app)/admin/submissions/_components/partner-group-view.tsx`** — Client component for the expandable partner/deal accordion. Two-level expand: partner card → deal row → individual submissions table. Displays Pipedrive badge where `pipedrive_deal_id` is set. Weighted forecast note labels the data as pre-CRM partner activity.
- **`src/app/(app)/api/admin/forecast/xlsx/route.ts`** — Admin-only XLSX export mirroring the price-book pattern (Node.js runtime, force-dynamic, admin role+status gate). Exports the per-deal table with partner, project, status, list price, weighted value, Pipedrive deal ID, and quote date columns. Header row in Arxys Gold (#FBB040). Summary line embeds totals.
- **`src/app/(app)/dashboard/page.tsx`** — Partner-facing funnel card (hidden when the partner has no deals). Shows open pipeline, weighted forecast, per-status badge counts, and a separate draft count labelled "excluded from $". RLS-scoped automatically via the `submissions` policy — no partner_id filter needed in the query.

### Verification gates

| Gate | Result |
|---|---|
| `npm test` | ✅ **43/43 pass** (12 new forecast tests) |
| `npm run build` | ✅ Clean — new route `/api/admin/forecast/xlsx` appears in the route manifest |
| `npm run lint` | ✅ 0 errors — 2 pre-existing `<img>` warnings unchanged |
| `scripts/test-rls.ts` | ✅ **17/17 pass** — existing `submissions_select_own` policy confirms partner A cannot read partner B's submission rows, so the funnel card is isolated by RLS without any application-layer filter |
| Manual smoke | ⏳ Deferred to Andy — see click-through checklist below |

### Manual smoke checklist (for Andy)

1. **Admin — Partner view**: navigate to `/admin/submissions?groupBy=partner`. Confirm summary cards show totals; expand a partner row; expand a deal row; expand the submissions sub-table. Confirm a deal with a `pipedrive_deal_id` shows the blue badge.
2. **Admin — Filters**: apply a status filter (e.g. "Sent") and date range in partner view; confirm counts change. Switch to project view; apply partner + status filters; confirm table filters correctly.
3. **Admin — Project view intact**: navigate to `/admin/submissions` (no groupBy). Confirm the existing table, pagination, and View links are unchanged.
4. **XLSX export**: in partner view, click "Export XLSX". Confirm download opens in Excel/Numbers; check the on-screen weighted forecast total matches column E in the spreadsheet.
5. **Dashboard funnel card**: sign in as a non-admin partner with at least one non-draft submission. Confirm the "My Pipeline Summary" card appears with correct status counts and dollar totals. Confirm draft submissions appear as a count only, never as a dollar value. Sign in as a second partner and confirm you see only your own data.
6. **Draft exclusion**: in partner view, confirm a deal with `status=draft` or `status=null` does not contribute to the open-pipeline or weighted-forecast totals, but does appear in the draft count.

### Decisions captured

- [`0038-partner-pipeline-forecast.md`](./decisions/0038-partner-pipeline-forecast.md)

---

## 2026-05-28 — Phase 4 scoped: quote revision, partner forecast & calculator improvements

### Work done

Reviewed the live portal calculator (`src/lib/calculator/{tables,compute}.ts`,
`src/app/(app)/calculator/{calculator-form,actions,page}.tsx`) plus the recommend and pipedrive
modules against two partner-portal ideas — reopen/revise a past quote, and a partner-grouped pipeline
forecast — and folded both plus a calculator audit into `docs/phase-4-plan.md` (3 steps, no migrations).
Phase 4 Steps 1–2 are independent of the still-pending Phase 3 domain/cohort work.

Findings from the read-through:
- `input_state` banks the form payload **index-based** (`resolutionIdx`/`codecIdx`/`complexityIdx`) —
  brittle if the lookup tables ever reorder. Mitigated: `groups_payload` already stores the resolved
  `resolutionLabel`/`codec`/`complexity` per group, so rehydration can resolve label→index rather than
  trust the raw index. No historical backfill needed.
- `total_list_price_usd` (+ `recommended_units`, `cameras_count`, `bandwidth_mbps`, `storage_tb`, `vms`,
  `retention_days`, `status`, `is_preferred`, `pipedrive_deal_id`) are all denormalized on `submissions`
  since the initial schema, so the partner forecast is queries-only — no new columns.
- `createDealFromSubmission` is POST-only (`client.ts` `request` supports GET|POST), and no note is
  created on deals today (the Phase-1 placeholder note was removed in Phase 2). Revision-time deal
  update needs PUT + an `updateDeal` method; the add-on note introduces the first `createNote`.
- Calculator audit: `reset()` doesn't clear `submitState`, so a stale recommendation panel persists —
  the one real bug. Minor cluster: `formatNumber` truncates ≥1000 to one decimal; results "Rec" shows
  percent while the input shows hours; numeric inputs snap to 1 on clear; slider/tooltip aren't
  keyboard-accessible. `RecommendationPanel` ignores the `alternatives` `recommend()` already returns.

### Decisions locked (Andy, 2026-05-28)

- Revision **updates the existing Pipedrive deal non-destructively** (calc fields + value + portal URL +
  note only; never `stage_id`/`user_id`/`pipeline_id`), falling back to create if there's no linked deal;
  no new sales email on a revision.
- Revision creates a **new** submission (status `draft`), grouped by (partner, project); no parent column.
- Forecast weights: on-hold 20% / sent 40% / won 100% / lost 0%; **drafts excluded from dollar totals**
  (count only). Constant in `src/lib/pipeline/forecast.ts`.
- Two add-on checkboxes (failover recorder, management server) → **Pipedrive note only**, no sizing impact.
- Surface runner-up + next-size-up SKUs (min/max bracket); fix all cosmetic issues.
- **No database migration** anywhere in Phase 4.

### Artifacts

- `docs/phase-4-plan.md` — executable plan: 3 steps, verification gates, ADR pointers 0038–0040, and a
  Claude Code kickoff prompt.

### Pending

- Execution handed to Claude Code per the plan's kickoff prompt. ADRs 0038 (forecast), 0039 (rehydration),
  0040 (deal-update-on-revision) to be written during execution. RUNBOOK unchanged.

## 2026-05-27 — Phase 3 Step 5: Submission lifecycle + Pipeline view + A3 hard-delete + Preferred flag

### Work done

- **Pre-migration backup** — `scripts/backup-tables.ts` → `backups/pre-step-5-pipeline-2026-05-27T18-20-09-217Z.json` (36 products, 19 submissions, 5 partners). Gitignored.
- **Schema migration (Migration #2)** — `supabase/migrations/20260527182010_step5_submission_lifecycle.sql`: two additive columns — `status TEXT` (nullable, `CHECK` ∈ draft/sent/won/lost/on-hold) and `is_preferred BOOLEAN NOT NULL DEFAULT false`. Existing 19 rows → `status=NULL`, `is_preferred=false`. Plus `GRANT UPDATE, DELETE ON submissions TO authenticated` — **required**, since the initial schema granted only SELECT+INSERT and a policy without the matching table grant has no privilege to act on. Two new RLS policies: `submissions_update_own` (own rows) and `submissions_delete_own_draft` (own rows **and** status draft/NULL — the DB-level A3 delete guard). Paired rollback at `supabase/rollback/step-5-rollback.sql`. Applied via `supabase db push`.
- **Server Actions** — `src/app/(app)/submissions/actions.ts`: `updateSubmissionStatus`, `togglePreferred`, `deleteSubmission`. RLS does the row-level work (and the delete status guard); the actions confirm a live session and treat a zero-row result as "not yours / can't delete". `togglePreferred` sets the target preferred **first**, then clears any other preferred in the same project (case-insensitive) — so a mid-operation failure leaves two preferred (self-correcting on next toggle) rather than zero (Q5: sequential, accept edge case). Shared `submissions/status.ts` is the single source for the enum + badge metadata + `isActiveStatus`/`isDeletable` helpers (no framework imports → safe in server + client bundles).
- **New-submission default** — `calculator/actions.ts` now sets `status: 'draft'` on insert (Q6); pre-Step-5 rows stay NULL.
- **Pipeline view** — `submissions/page.tsx` rewritten as **"My Pipeline"** (Q2): a Server Component that groups submissions by project name (case-insensitive), filters by status via `?status=` query (All / each status / No Status), and sorts active-status groups above draft/NULL-only groups with Ungrouped last. Client component `submissions/pipeline.tsx` renders per row: a preferred star (gold `#FBB040` when set), a colored status dropdown (Q1), View + PDF links, the product → price-book link (Step 3 B3/B4), and a draft/NULL-only inline Delete with Confirm/Cancel. Refresh model = Option A (`revalidatePath` in the action + `router.refresh()` in a transition). Pagination dropped (grouping + MVP scale).
- **Admin view** — `admin/submissions/page.tsx` gains read-only **Status** badge + **Preferred** star columns (no edit, no delete — partners own their pipeline).
- **RLS tests** — `scripts/test-rls.ts` +7 cases (11–17): partner UPDATE own status/is_preferred (pass), UPDATE another's (blocked, 0 rows), DELETE own NULL/draft (pass), DELETE own `sent` (blocked by guard, row retained), DELETE another's (blocked, row retained).

### Verification gates

| Gate | Result |
|---|---|
| Pre-migration backup | ✅ JSON dump (36 products, 19 submissions, 5 partners) |
| `supabase db push` | ✅ migration applied (1 pending) |
| Schema + RLS policies + grants | ✅ verified functionally by the 17/17 RLS suite |
| `npm run build` | ✅ clean — same route set, no new warnings |
| `npm run lint` | ✅ 0 errors — 2 pre-existing `<img>` warnings unchanged |
| `npm test` | ✅ 32/32 pass |
| `scripts/test-rls.ts` | ✅ **17/17 pass** (7 new) |
| Browser smoke (authed pipeline) | ⏳ deferred to Andy — see Detours |

### Detours & fixes

- **In-browser smoke not self-driveable this session.** The preview dev-server tool launched `npm` from the session's primary working directory (`~/`) and ignored `launch.json`'s `cwd`, so the server failed to boot; and the pipeline is auth-gated, which would need a synthetic Supabase login to exercise anyway. Rather than rabbit-hole on the launch config, compilation was taken as covered by `next build` (all routes generated) and the data layer by the 17/17 RLS suite; the authed click-through (status change, star toggle + cross-project clear, status filter, draft-only delete) was handed to Andy with a checklist. Not claimed as self-verified.

### Decisions captured

- [`0037-status-guarded-submission-delete.md`](./decisions/0037-status-guarded-submission-delete.md)

---

## 2026-05-27 — Phase 3 Step 4: Project name autocomplete + Input state persistence

### Work done

- **Pre-migration backup** — `scripts/backup-tables.ts` dumped to `backups/pre-step-4-input-persistence-2026-05-27T00-06-31-837Z.json` (36 products, 18 submissions, 5 partners). Gitignored.
- **Schema migration** — `supabase/migrations/20260527000700_step4_submissions_input_state.sql`: additive `ALTER TABLE submissions ADD COLUMN input_state JSONB DEFAULT NULL`. No constraints, no index, no new RLS policies needed (column inherits existing partner-scoped policies). Paired rollback at `supabase/rollback/step-4-rollback.sql`.
- **Input state persistence** — `actions.ts` now includes `input_state: parsed.data` in the Supabase INSERT. The schema-validated `parsed.data` is the exact structured state (projectName, vms, retentionDays, groups[] with all indices). Atomic with the existing submission creation. Pre-Step-4 submissions have `NULL`.
- **Project name autocomplete** — `calculator/page.tsx` converted to `async` Server Component; queries the partner's distinct project names from prior submissions (case-insensitive dedup, most-recent-first). Passed as `previousProjectNames: string[]` prop to `CalculatorForm`. The project name `<input>` gains a `list="ax-project-names"` attribute and a native `<datalist>` element — zero dependencies, accessible, native substring matching.

**Explicitly cut (per brief):** "Update Calculations" form rehydration from `input_state`. Data is banked; feature deferred until cohort feedback warrants it.

**Verification gates**

| Gate | Result |
|---|---|
| Pre-migration backup | ✅ JSON dump confirmed |
| `supabase db push` | ✅ migration applied cleanly |
| `npm run build` | ✅ clean — same 19 routes |
| `npm run lint` | ✅ 0 errors — 2 pre-existing `<img>` warnings unchanged |
| `npm test` | ✅ 32/32 pass |
| `scripts/test-rls.ts` | ✅ 10/10 pass |
| Manual smoke | ✅ input_state populated; autocomplete working |

---

## 2026-05-26 — Phase 3 Step 3: Calculator UX upgrade

### Work done

All 4 items shipped in one commit. No schema changes, no RLS changes, no migrations.

- **B1** — Submit button moved above the Camera Groups section (after the global settings block). Button starts disabled (`hasInteracted = false`) on fresh page load; a `touch()` latch fires on the first user interaction (any field change, group add/remove/duplicate, retention/VMS/project-name edit). Reset restores the disabled state. Hint text updated to match the new position ("Configure a camera group below, then save…"). The existing `isSubmitting` guard is preserved alongside the new `hasInteracted` check.
- **B2** — `@keyframes ax-rec-fadein` added to `calculator.css` (`opacity 0→1`, `translateY -10px→0`, 300ms ease-out) and applied to `.ax-rec`. Since `RecommendationPanel` is conditionally mounted (`status === "ok" && …`), the animation fires automatically on mount — no React state needed. Re-submissions update in place without re-animating (component stays mounted while `status` stays `ok`).
- **B3** — `productGroupToFamilySlug(productGroup: string): string | null` exported from `families.ts`. Iterates all families checking `productGroups` and `tierSections[].productGroups` case-insensitively; returns `null` for groups that don't map to a price book page (GPU, RAM, NIC, etc.). `RecommendationPanel` wraps `winner.productGroup` in `<Link href="/price-book/{slug}">` when a slug is found; falls back to plain `<span>` otherwise. Link styled via new `.ax-rec-model-link` CSS class (inherits monospace/color, adds hover underline).
- **B4** — Submission History page imports `productGroupToFamilySlug`. The Recommendation column wraps `product_group` in `<Link>` when slug resolves; legacy UUID rows and unmapped groups remain plain text.

**Verification gates**

| Gate | Result |
|---|---|
| `npm run build` | ✅ clean — same 19 routes |
| `npm run lint` | ✅ 0 errors — 2 pre-existing warnings unchanged |
| `npm test` | ✅ 32/32 pass |
| `scripts/test-rls.ts` | ✅ 10/10 pass |

---

## 2026-05-26 — Phase 3 Step 2: Portal polish + Support + Docs scaffold + Deal-Reg email

### Work done

All 10 items shipped across 2 commits. No schema changes, no RLS changes, no migrations.

**Commit 1 — Dashboard chrome + shared footer + Support card + Deal-Reg email**

- **A1** — Page title → "Arxys Partner Dashboard"; card headers `text-xl`; `border-2` card borders; `bg-neutral-50` page background; `shadow-sm` + `hover:shadow-md` card depth.
- **A2** — Extracted shared `Footer` Server Component to `src/app/(app)/_components/footer.tsx`. Rendered on both the dashboard and price book index pages. B6 footer links (About Arxys, Support & Resources, Contact Sales, www.arxys.com) live here.
- **F** — Support card on dashboard: "Support Documentation" text link → `arxys.com/company/support/`; "Open a Support Ticket" gold button → `arxys.supportsystem.com`. Both `target="_blank"`.
- **Deal-reg** — `RegisterDealForm` Client Component (`useActionState`); `registerDealAction` Server Action with zod validation (min 3 / max 200 projectName; max 1000 notes); `sendDealRegistrationEmail` mirroring `submission-notification.ts` pattern; fires to `INTERNAL_NOTIFICATION_EMAIL` with subject `Deal Registration: {projectName} — {company_name}`; no DB write; error state surfaced to form.

**Commit 2 — Price book content + docs scaffold**

- **A4** — "VIDEOX V5" and "MSRP Price Book" rendered as co-equal header elements; verbatim subtitle copy ("VideoX Enterprise IP video servers give security professionals…"); verbatim disclaimer copy ("Prices and specs subject to change…Thanks for your understanding.") replaces old short disclaimer.
- **A5** — Next.js `<Image>` for `Windows_Server_2022.png` (120×100) and `5_year_warranty-circle-2.png` (100×100) in the blue hero right column. Explicit dimensions prevent CLS. Assets placed in `public/price-book/` per manual prereq.
- **A6** — Enterprise Grade highlighted box below hero: `bg-neutral-500` (~50% black, per Andy), `text-white`, `border-l-4 border-[#fbb040]`; two-column bullet grid at `md:` breakpoint. Six standard-equipment bullets verbatim.
- **B5** — H.265 HEVC performance banner: full-width bleed (`-mx-4`, matching top hero width) with `bg-[#03396f]`; small "H.265 HEVC" badge; verbatim heading and body copy; "Learn More →" CTA → `arxys.com/videox-v5-launch-deliver-on-the-promise-of-h-265-today/`.
- **B6** — "View all VideoX Appliances" link in price book hero; four footer links in `Footer` component (About Arxys, Support & Resources, Contact Sales for Custom Configurations, www.arxys.com). All `target="_blank" rel="noopener noreferrer"`.
- **G** — Documentation section on every family detail page (below the fine-print block): if `datasheetUrl` non-null, renders a doc card with download icon; if null, renders "Documentation coming soon." Standalone hero-area datasheet buttons removed — consolidated into this section. (Q4 default was "omit when null" but Andy overrode to "coming soon" before execution.)

**Verification gates**

| Gate | Result |
|---|---|
| `npm run build` | ✅ clean — same 19 routes, no new warnings |
| `npm run lint` | ✅ 0 errors — 2 pre-existing `<img>` warnings unchanged |
| `npm test` | ✅ 32/32 pass — no new tests required (no business logic) |
| `scripts/test-rls.ts` | ✅ 10/10 pass — no RLS changes |

### Detours & fixes

- **Zod 4.x API change:** `parsed.error.errors` no longer exists; the array is `parsed.error.issues` in Zod v4. Build caught this on first compile; one-line fix.

---

## 2026-05-22 — Portal Phase 2 closure

### Work done

Portal Phase 2 closed. Decision recorded in ADR [`0036-phase-2-closure-and-phase-3-scope.md`](./decisions/0036-phase-2-closure-and-phase-3-scope.md).

**Phase 2 deliverables (Steps 1–9):**

| Step | Outcome |
|---|---|
| 1 — Minimal portal branding | Arxys Gold + logo live; portal reads as Arxys |
| 2 — Master Sheet validation | 36 SKUs validated; SKU naming convention locked (`VX5-<GROUP>-<TIER>`) |
| 3+4 — Schema migration + algorithm rewrite | `products` SKU-PK; recommend() picks specific SKUs from real MSRPs |
| 5+6 — Push script + real pricing live | Sheet → Supabase + Pipedrive; ADR 0019 closed |
| 7 — Partner XLSX download | Dashboard widget; 36 rows; MSRP-only |
| 8 — HTML price book live | `/price-book` index + 10 family pages; arxys.com-branded |
| 9 — Internal verification | Folded into Step 8 polish commits; surfaced + fixed: compliance badges, V600–V800 net storage, warranty KPIs, SW section, V700/V800 hero, dual datasheet buttons |

**Deferred to Phase 3 (per ADR 0036):**

- Step 10 — 2-3 partner cohort invite. Better sequenced *after* custom domain to avoid mid-onboarding domain switch.
- Step X — Custom domain `portal.arxys.com`. CNAME + Vercel + Supabase auth URL update + email template SiteURL.

**Numbering housekeeping done in same commit:** ADR `0032-price-book-brand-scope.md` renumbered to `0035-price-book-brand-scope.md` to resolve a double-assignment with `0032-sku-level-recommendation-algorithm.md` (Step 3+4 — kept its number, ADR rule "numbers never reused even if superseded"). One JOURNAL cross-reference updated.

**Plan + index housekeeping:**

- `docs/phase-2-plan.md` — Status header → Complete. Document stays as historical record.
- `docs/README.md` — Forward-looking-plans table updated to show Phase 2 Complete + placeholder for Phase 3 plan (to be created when scoped).

### Phase 2 retrospective

**What went well:**

- Three-doc discipline held throughout. Every step has a JOURNAL entry + ADR(s) where decisions were non-obvious. Future reader can reconstruct *why* from the docs alone.
- Step scoping briefs at `docs/phase-2/step-N-*.md` worked. Each brief was self-contained enough that a fresh session (Opus for 3+4; Sonnet for everything else) could pick it up cold.
- Backup posture innovation (Step 3+4 JSON dump + reverse-migration SQL pair) replaced the missing Supabase-Pro snapshot feature cleanly. Reusable for future destructive migrations.
- Manual smoke testing folded into the implementation step (Step 8) rather than a separate step caught real issues fast (the post-deploy `/submissions` embed-via-FK regression on Step 3+4 + the V700/V800 hero swap + the SW workstations table-column-shape requirement).

**What to carry into Phase 3:**

- ADR discipline includes uniqueness-check of next number before writing. Step 8b's session didn't realize 0032 was taken (the SKU one was committed days earlier in a different session). A fresh `ls docs/decisions/` is a 2-second pre-flight.
- When dropping or replacing FKs, grep BOTH the column name AND the PostgREST embed-alias patterns (`<col>(...)`). Step 3+4's post-deploy regression was caused by exactly this gap.
- Step briefs that pre-seed substantial content (Step 8b's families.ts seed, Step 5+6's push script field map) saved hours of Sonnet's clerical work and produced cleaner code on first pass.
- The `arxys-company` skill correctly identifies brand tokens (Gold + Grey + Montserrat) but the live arxys.com CSS adds two more: navy `#054A91` primary and Poppins headings. These are now in `globals.css` scoped to /price-book/* — Phase 3 may want to extend portal-wide.

### Decisions captured

- [`0036-phase-2-closure-and-phase-3-scope.md`](./decisions/0036-phase-2-closure-and-phase-3-scope.md)

### Pending / Phase 3 inputs

- Custom domain `portal.arxys.com` — CNAME + Vercel + Supabase auth URL + email template SiteURL. ADR [0025](./decisions/0025-supabase-custom-smtp-and-branded-templates.md) "when to revisit" is now the trigger.
- 2-3 partner cohort selection (who, in what order, canary-first cadence).
- Phase 3 plan doc (`docs/phase-3-plan.md`) when scoped.

---

## 2026-05-22 — Price book polish: compliance badges, storage data, warranty KPIs, SW section

### Work done

- Fixed upgrade options MSRP color from blue (`text-[#054A91]`) to black (`text-neutral-900`) — blue made them look like links.
- Updated compliance badges on both index and detail pages: removed "PSA Security Partner", changed "TAA & NDAA Compliant" → "NDAA Compliant", expanded "Multi-VMS Validated" to include full partner list (Milestone, Avigilon, Genetec, NXWitness, Hanwha, Exacq, Axxonsoft), increased badge text from `text-xs` to `text-sm` for readability.
- Added `skuExtraData` for V600 (224/280/336 TB), V700 (316/400/480 TB), V800 (480/600/720 TB) — fixes Net Usable Storage column showing "—" for first and third SKUs of each family. Values sourced from PPTX (not DB; `max_storage_tb` only stores raw capacity for the middle SKU).
- Updated warranty KPI to consistent format `{ label: "Warranty Support", value: "X Years", unit: "Next Business Day Parts" }` for V700, V800 (were "Warranty / 5 / years NBD") and SW (was "Warranty / 3 / years").
- Moved SW workstations from `category: "high-density"` to `category: "workstations"` and added `"workstations"` to `categoryOrder` in the index page, so SW now renders in its own "Security Workstations" section at the bottom.
- Deleted `scripts/check-storage.ts` (temp debug artifact).

---

## 2026-05-22 — Phase 2 Step 8: HTML price book live

### Work done

- Built `/price-book` index and `/price-book/[slug]` family detail routes (Next.js Server Components).
- Created `src/lib/price-book/families.ts` with all 10 family-page concepts: V100 (+ V150 tier), V250 (V255 tier skipped — single table), V260 (V270 tier skipped — single table), V200, V400, V500, V600, V700, V800, SW workstations. Content lifted verbatim from `/tmp/arxys-pricebook.txt` (pdftotext of the V5 MSRP PPTX).
- Added `cardEyebrow`, `upgradeSkus`, `skuExtraData`, and `category` fields to the Family type beyond the brief's base schema. These were necessary to: match index card copy from the mockup, encode per-family upgrade lists from the PPTX, provide static cell overrides for SSD/monitor columns not in the DB schema, and drive the 3-section index grouping.
- Parameterized SKU table column set via `SkuColumn[]` — SW workstations use `bandwidth + monitors` columns instead of `netStorage`; V250/V260 use `ssdStorage`. `skuExtraData` per-SKU overrides handle display values not stored in the DB (SSD configs as text, monitor counts for SW).
- Upgrade SKU lists are per-family (not universal) — direct reading from PPTX pages. V700/V800 include `VX5-RAM-32GB`; V100 only `VX5-GPU-A1000`; SW includes `VX5-PP5-V100`.
- Added `--color-arxys-navy`, `--color-arxys-navy-deep`, `--color-arxys-navy-soft`, `--font-poppins` to `globals.css` `@theme inline` block. Scoped Poppins headings + Montserrat body behind `.price-book-route` class on the price book layout wrapper. Print styles scoped using `body:has(.price-book-route)`.
- Google Fonts loaded via `<link>` in the price book `layout.tsx` (not CSS `@import`): PostCSS/Tailwind 4 expands `@import "tailwindcss"` inline, leaving any subsequent `@import url()` after generated rules — invalid CSS. Route-level `<link>` tags are the correct Next.js App Router pattern.
- Migrated 5 hero images from `docs/phase-2/mockups/step-8a/assets/` to `public/price-book/`. SW workstation hero is `null` — no workstation image was extracted from the PPTX at mockup time; SW index card and detail page use a gold "SW" text placeholder. Replace when asset is available.
- Added "VideoX V5 Price Book" card to dashboard page and "Price Book" nav link to the app layout (alongside Dashboard / Calculator / Submissions / Admin / Sign out).
- Wrote `src/lib/price-book/families.test.ts` (8 assertions); all pass. Also removed `import "server-only"` from families.ts — the `server-only` package throws when imported outside the Next.js runtime (the tsx test runner has no Next.js shim). The existing `xlsx.ts` in the same dir follows the same pattern of no guard; the Server Component pages are the actual gate.
- Installed `server-only` package as a dep so the import resolves during build even if not used.
- **Datasheet URL liveness probe (2026-05-22):** 6 of 10 families have published datasheets. Four return 404 and have `datasheetUrl: null` (button hidden): V250, V260, V500, SW. Six are live: V100, V200, V400, V600, V700, V800.

### Detours & fixes

- **`@import url()` in globals.css fails with PostCSS/Tailwind 4:** The brief specified adding a Google Fonts `@import url()` to `globals.css`. After `@import "tailwindcss"`, the PostCSS plugin inlines all Tailwind utilities, making any following `@import url()` invalid CSS (must precede all rules). Moving the import before `@import "tailwindcss"` is also wrong — PostCSS re-orders the output. **Fix:** moved Google Fonts to route-scoped `<link>` tags in the price book `layout.tsx`. This is the idiomatic Next.js App Router approach anyway.
- **`import "server-only"` breaks tsx test runner:** The package throws with "This module cannot be imported from a Client Component module" when called outside the Next.js runtime. Removed the guard from `families.ts`; families.ts is pure data (no server APIs) so the guard added no real protection. Tests now pass cleanly.

### Decisions captured

- [`0035-price-book-brand-scope.md`](./decisions/0035-price-book-brand-scope.md) (originally numbered 0032; renumbered at Phase 2 close to resolve a collision with `0032-sku-level-recommendation-algorithm.md` — see Phase 2 close-out entry)

---

## 2026-05-21 — Phase 2 Step 7: Partner XLSX download

### Work done

- Installed `exceljs` (90 packages, pure JavaScript, no native bindings) as a runtime dependency.
- Created `src/lib/price-book/xlsx.ts`: pure generator — `generatePriceBookXlsx(rows, generatedAt)` returns a `Buffer`; `priceBookFilename(date)` returns `Arxys-Price-List-YYYY-MM-DD.xlsx`. Arxys Gold (`#FBB040`) header row at row 4; title + generated-at stamp in rows 1–2; numeric MSRPs use `numFmt '"$"#,##0.00'`; MKT rows emit `"Market Price"`, CFQ rows emit `"Call for Quote"`.
- Created `src/lib/price-book/xlsx.test.ts`: 2 new tests (workbook shape + filename format). All 23 tests pass.
- Created `src/app/(app)/api/price-book/xlsx/route.ts`: GET handler under the `(app)` layout group. `runtime = "nodejs"` (exceljs uses Node streams); `dynamic = "force-dynamic"` (always freshly queries `products`). Unauthenticated requests are caught by the `(app)` layout first (307 → `/login`) and by an explicit `!user` 401 guard inside the handler.
- Added "VideoX price list" download card to `src/app/(app)/dashboard/page.tsx` (third card slot, before the admin card).
- `npm run build`: clean, `/api/price-book/xlsx` appears in route table as `ƒ` (dynamic).
- `npm run lint`: 0 errors, 2 pre-existing `<img>` warnings.
- `scripts/test-rls.ts`: 10/10 pass (no RLS changes in this step).

**Decisions (all recommended defaults from the step brief):**

| Q | Decision |
|---|---|
| Q1 | `exceljs` — mature, full styling, currency `numFmt`, Node-only (no client-bundle impact) |
| Q2 | Dashboard only — XLSX is reference data, not submission-related |
| Q3 | Four columns: SKU, Product Name, Product Group, MSRP |
| Q4 | `"Market Price"` / `"Call for Quote"` strings — matches future Step 8 HTML price book |
| Q5 | `Arxys-Price-List-YYYY-MM-DD.xlsx` — date-stamped, dashes-only |
| Q6 | Title + generated-at header rows (rows 1–2), column headers at row 4, data from row 5 |
| Q7 | `numFmt '"$"#,##0.00'` on the numeric cell — raw number stored, currency displayed |
| Q8 | `force-dynamic` — always fresh from Supabase |

### Decisions captured

- [`0034-xlsx-library-choice.md`](./decisions/0034-xlsx-library-choice.md)

---

## 2026-05-21 — Phase 2 Steps 5+6: Real pricing pipeline live

### Work done

Built and ran the Master Sheet → Supabase + Pipedrive push pipeline. Supabase `products` now carries all 36 Sheet rows; Pipedrive Products are in sync. `deal.ts` emits real deal values; the partner UI shows real prices. Brief: [`docs/phase-2/step-5-and-6-push-and-display.md`](./phase-2/step-5-and-6-push-and-display.md).

**Eight locked decisions (Andy, 2026-05-21):**

| Q | Choice | Implication |
|---|---|---|
| **Q1** | (b) CSV export URL, no service account | Same auth path as `validate-prices-sheet.ts`; Sheet is intentionally public-link-viewable |
| **Q2** | Existing Pipedrive entries with some matching SKUs | All 36 Sheet SKUs were already in Pipedrive (0 new, 10 updated, 940 legacy SK-* flagged print-only) |
| **Q3** | (a) MKT/CFQ prefix in Pipedrive name | `[MKT] …` / `[CFQ] …` prefix; price = 0; sales sees all SKUs |
| **Q4** | (a) Skip Pipedrive category | Categories not configured; setting unknown string would fail API |
| **Q5** | (a) Print-only removal | Flagged-for-removal rows listed in preview, never auto-deleted |
| **Q6** | VX5-PP5-V100 not in Sheet | Push = 36 rows; add in a follow-up push when Andy updates the Sheet |
| **Q7** | (a) `value = winner.totalCostUsd` | Pipedrive deal `value` now shows the real total list price |
| **Q8** | (a) ADR 0019 → Superseded by #0033 | ADR 0033 written; ADR 0019 closure note added |
| **Legacy display** | (b) Show `"(legacy pricing — pre-Phase-2)"` | 12 pre-migration submissions no longer show misleading $1–$57 placeholder totals |

**New scripts:**
- `scripts/backup-pipedrive-products.ts` — dumps `GET /v1/products` (paginated) to `backups/pipedrive-products-pre-step-5-<timestamp>.json`.
- `scripts/push-prices.ts` — full pipeline: `validateSheet()` → CSV fetch → Supabase + Pipedrive diff → CONFIRM gate → UPSERT. `--dry-run` flag prints preview without writing. Capacity columns (`max_cameras`, `max_storage_tb`) preserved from existing Supabase rows so the 6 V-family seed rows keep their calculator capacity.

**Backups taken (pre-push):**
- Supabase JSON: `backups/pre-step-5-6-real-pricing-2026-05-21T23-29-23-087Z.json` (6 products, 13 submissions, 4 partners)
- Pipedrive Products JSON: `backups/pipedrive-products-pre-step-5-2026-05-21T23-29-26-179Z.json` (1019 products — includes legacy SK-* / SC-* lines)

**Push results (first real run):**
- Supabase: 36 upserted (30 new + 6 updated seed rows), 0 errors
- Pipedrive: 36 upserted (10 updated + 26 no-ops matched by code), 0 errors
- Idempotent re-run: 0 new, 0 updated in both targets — fully in sync

**Surgical consumer fixes (Step 6):**
- `src/lib/pipedrive/deal.ts`: `value: 0` → `value: winner.totalCostUsd`; portal URL → `/submissions/${submissionId}` permalink; Phase 1 placeholder note creation removed.
- `src/app/(app)/_components/submission-detail.tsx`: legacy submissions (UUID-shaped `recommended_product_id`) show `"(legacy pricing — pre-Phase-2)"` instead of the stored $1–$57 placeholder totals.
- `src/lib/pipedrive/deal.test.ts`: updated `value` assertion (0 → 222144), portal URL assertion, removed "pins a Phase 1 placeholder note" test.

**ADRs:**
- [`0019`](./decisions/0019-defer-real-pricing-to-phase-2.md) — status updated to Superseded by #0033
- [`0033`](./decisions/0033-real-pricing-live-in-phase-2.md) — new; captures Q1–Q8 outcomes

### Detours & fixes

- **`backup-tables.ts` referenced dropped `server_specs`**: The script still listed `server_specs` in `TABLES` after Step 3+4 dropped the table. Fix: removed `server_specs` from the `TABLES` const.
- **Validator `main()` ran twice on import**: `validate-prices-sheet.ts` calls `main()` unconditionally at module level. When `push-prices.ts` imports `validateSheet`, the `main()` ran as a side effect, producing duplicate validation output. Fix: guarded with `if (process.argv[1]?.includes("validate-prices-sheet"))`.
- **Supabase untyped client + upsert literal table name**: `admin.from("products").upsert(chunk)` fails type check because Supabase resolves the insert row type to `never` when no `Database` generic is provided and the table name is a string literal. Used `chunk as unknown as never[]` double assertion (same escape as `deal.ts` uses for `payload as Parameters<...>[0]`).

### Decisions captured

- [`0033-real-pricing-live-in-phase-2.md`](./decisions/0033-real-pricing-live-in-phase-2.md)

---

## 2026-05-21 — Phase 2 Steps 3+4: Schema migration + recommendation algorithm rewrite

### Work done

Replaced the 6-row family `products` table with the proposal's SKU-PK schema and rewrote the recommendation algorithm to pick a specific SKU instead of a V-family. One coherent commit; brief at [`docs/phase-2/step-3-and-4-schema-and-algorithm.md`](./phase-2/step-3-and-4-schema-and-algorithm.md).

**Five locked decisions (Andy, 2026-05-21):**

| Q | Choice | Implication |
|---|---|---|
| **Q1** | (b) Drop FK; `submissions.recommended_product_id` UUID → TEXT | 12 historical UUIDs preserved as opaque strings; submission-detail + PDF render "(legacy data)" |
| **Q2** | (ii) Inline `max_cameras` + `max_storage_tb` on products; drop `server_specs` | Calculator action queries products only |
| **Q3** | (b) Per-family `max_cameras` from old server_specs | V200→100, V400→200, V500/V600→275, V700/V800→325 |
| **Q4** | (a) Filter `recommend()` to `price_type='numeric'` | MKT (`VX5-RAM-32GB`) + CFQ (`VX5-SW30-300`, `VX5-SW35-300`) never recommended |
| **Q5** | (a) Family-friendly Pipedrive string | `arxys_recommended_models` + admin `Recommended Server` stay `"N × V800"` via `winner.productGroup` |

ADR [`0031`](./decisions/0031-step-3-4-schema-migration.md) records Q1–Q5 + the backup posture; ADR [`0032`](./decisions/0032-sku-level-recommendation-algorithm.md) records the algorithm-rewrite decisions (numeric-only filter, tighter-fit tie-break, warning shape).

**Backup posture (free-plan substitute, see Detours).** Free-plan Supabase has no dashboard snapshots, so the recoverable-backup gate for this destructive migration is a pair of locally-produced artifacts:

1. Service-role JSON dump → `backups/pre-step-3-4-sku-pk-migration-2026-05-21T19-01-41-093Z.json` (30 KB; 6 products + 6 server_specs + 12 submissions + 4 partners). Produced by the new `scripts/backup-tables.ts`. Gitignored (`/backups/` added to `.gitignore` — real partner data never enters git).
2. Reverse-migration SQL → `supabase/rollback/step-3-4-rollback.sql` (lives outside `supabase/migrations/` so the CLI never auto-applies it). Reverts the schema; pairs with `scripts/restore-tables.ts` to fully restore.

This pair is documented in ADR 0031 as the recoverable-backup pattern for every future destructive Phase 2 migration on the free plan.

**Migration** — `supabase/migrations/20260521190350_step3_4_products_sku_pk.sql`:

1. Drop `submissions_recommended_product_id_fkey`.
2. `drop table server_specs cascade; drop table products cascade;`.
3. `alter table submissions alter column recommended_product_id type text using recommended_product_id::text;`
4. Create new `products`: `sku TEXT PK`, `product_name`, `msrp NUMERIC nullable`, `price_type CHECK in ('numeric','market','call_for_quote')`, `product_group`, `sort_order`, `active`, `max_cameras`, `max_storage_tb`, `updated_at`. Plus `CHECK (price_type='numeric' implies msrp not null)` and four indexes.
5. RLS: `products_select_active_or_admin` (same shape as before).
6. Seed 6 mid-tier VideoX SKUs verbatim from the live Master Sheet validated in Step 2:

   | SKU | product_group | MSRP | max_cameras | max_storage_tb |
   |---|---|---|---|---|
   | VX5-V200-80 | V200 | $16,640 | 100 | 80 |
   | VX5-V400-160 | V400 | $26,910 | 200 | 160 |
   | VX5-V500-240 | V500 | $35,926 | 275 | 240 |
   | VX5-V600-320 | V600 | $41,659 | 275 | 320 |
   | VX5-V700-480 | V700 | $54,512 | 325 | 480 |
   | VX5-V800-720 | V800 | $74,048 | 325 | 720 |

   Step 5's push script UPSERTs the full ~36-row Sheet over this seed.

**Algorithm rewrite** — `src/lib/recommend/algorithm.ts`:

1. Filter the pool to `priceType === 'numeric'` (defensive; calculator action also filters at the query layer).
2. Evaluate each SKU: `units = max(1, ceil(cams/maxCams), ceil(storage/maxStorageTb))`; `totalCost = units × msrp`; `driverDimension = storage > cameras ? 'storage' : 'cameras'`.
3. Rank by `(totalCost ASC, units ASC, excess-in-driver-dimension ASC, sku ASC)`.
4. Warnings: `units > 1` → "Workload exceeds a single {productGroup}; recommendation stacks {units} units of {sku}." + "exceeds the largest single VideoX SKU" when either dimension overflows.

Candidate shape now carries `sku`, `productGroup`, `productName`, `unitMsrp` directly — no second lookup needed by Pipedrive deal builder or PDF render.

**Consumer updates:**

- `src/lib/recommend/types.ts` — new candidate shape (sku, productGroup, productName, unitMsrp). `ServerSpec` mirrors the new products columns.
- `src/lib/recommend/algorithm.test.ts` — 8 original tests rewritten with SKU-level fixtures + real MSRPs; +2 new tests (MKT/CFQ exclusion, tighter-fit tie-break); +1 throw-when-pool-empty. 11 cases total.
- `src/app/(app)/calculator/actions.ts` — dropped server_specs join; query `products` with `active=true AND price_type='numeric'`; persists `winner.sku` as TEXT into `submissions.recommended_product_id`.
- `src/lib/pipedrive/deal.ts` — derives `"N × {productGroup}"` from `winner.productGroup` (Q5a).
- `src/lib/pipedrive/deal.test.ts` — fixture updated to new candidate shape.
- `src/lib/email/submission-notification.ts` — sales + partner notification emails reference `winner.productGroup` (family-friendly).
- `src/app/(app)/calculator/calculator-form.tsx` — post-submit "Recommended configuration" panel shows `winner.productGroup`.
- `src/lib/pdf/render.ts` — `loadProductBySku()` replaces `loadProductAndSpec()`; renders `"(legacy data — product details unavailable)"` when `recommended_product_id` is UUID-shaped (pre-migration). Uses `productGroup` for the displayed model code.
- `src/app/(app)/_components/load-submission.ts` — splits into two queries (submission, then product-by-SKU) since PostgREST embed-via-FK no longer works (the FK was dropped).
- `src/app/(app)/_components/submission-detail.tsx` — new product shape (sku, product_name, product_group); "Product notes" row → "Product family"; legacy-data rendering matches PDF.
- `scripts/test-rls.ts` — +9a (partner SELECT new products shape) + 9b (inactive products invisible to partner). 10 cases total.

**Verification gates** (11 from the brief):

1. ✅ Read migration carefully before push.
2. ✅ Backup taken (JSON dump + reverse migration; recorded above).
3. ✅ `supabase db push` — applied cleanly (Andy ran).
4. ✅ Schema verified via service-role: 6 products in SKU-PK shape; `server_specs` absent (`PGRST205: Could not find the table 'public.server_specs'`).
5. ✅ Seed verified: 6 rows, all numeric, sort_order 1–6.
6. ✅ Historical data: 12 submissions all carry UUID-shaped TEXT in `recommended_product_id`.
7. ✅ `npm run lint` — 0 errors, 2 pre-existing `<img>` warnings from Step 1.
8. ✅ `npm run build` — clean, 15 routes (Turbopack, 2.7s).
9. ✅ `npm test` — 22/22 pass (was 19; +3 from new MKT/CFQ + tighter-fit + Pipedrive fixture-shape coverage).
10. ✅ `scripts/test-rls.ts` — 10/10 pass (was 8; +9a + 9b).
11. ⚠️ Manual dev-server smoke — **deferred** with documented residual risk. The risk surface is bounded: build type-check passes; unit + Pipedrive tests cover logic; RLS tests cover policies; SubmissionPdf component didn't change shape; only the SKU-by-product loader changed in render.ts (mirror of the same pattern that already passed type-check). A live UI smoke remains the canonical confirmation, deferred to the next session when Andy is at the keyboard.

**Recommendation outcomes vs Phase 1 (sanity check):**

With real MSRPs from the seed, the algorithm now picks differently for the same workload. Example: workload (150 cameras, 100 TB):

- **Phase 1 (placeholder $1–$6)**: 2× V200 ties 1× V400 at totalCost=$2; V200 wins on unit-price tiebreak.
- **Phase 2 (real MSRPs)**: 2× V200 = $33,280 vs 1× V400 = $26,910 → **1× VX5-V400-160 wins** on primary cost. Materially different from Phase 1 and matches sales intuition (one bigger box vs two smaller ones at a real price gap).

### Detours & fixes

- **Free Supabase plan has no dashboard snapshots.** The brief's "Backup before migrating" §1 recommends "Database → Backups → Create backup" but that feature is Pro-only ($25/mo). Andy surfaced this when the question was raised. Resolved by writing `scripts/backup-tables.ts` (service-role SELECT * → JSON file; 60 lines) and pairing it with `supabase/rollback/step-3-4-rollback.sql` (hand-written reverse migration that recreates the pre-migration shape so the JSON can be restored). The pair lives in repo as the new free-plan-compatible backup pattern for any future destructive migration. Documented in ADR 0031.

- **Brief's tertiary tie-break wording was self-contradictory.** "Capacity utilization ascending (less over-provisioning preferred)" — ASC utilization = LOW utilization = MORE over-provisioning, which contradicts the second clause. Resolved silently in code by treating "less over-provisioning" as authoritative: tertiary = excess capacity in driver dimension ASC. Explicitly documented in ADR 0032 + the algorithm-module header comment so future readers don't re-litigate. Test case "tighter-fit tie-break: same cost + same units -> smaller excess wins" pins the chosen semantics.

- **Forgot to update three consumer call sites referencing `winner.modelCode` before running build.** The first `npm run build` failed type-check at `src/app/(app)/calculator/calculator-form.tsx:586` (post-submit recommendation panel). Grep then surfaced two more in `src/lib/email/submission-notification.ts:54` + `:83` (sales + partner notification email bodies). All three changed to `winner.productGroup` (family-friendly, matching Q5a) in one batch. The Pipedrive deal test fixture also needed updating from the old candidate shape — caught by `npm test` after the calculator-form fix.

- **`server_specs` absence probe used a stale regex.** A late verification ran `await admin.from('server_specs').select('*').limit(1)` and expected `/does not exist/i` in the error message. PostgREST actually returns code `PGRST205` + message `"Could not find the table 'public.server_specs' in the schema cache"` — the words "does not exist" never appear. The first probe printed `FAIL`; the corrected probe `/(does not exist|Could not find the table|PGRST205|42P01)/i` returned `CONFIRMED MISSING`. Not a real failure, just a regex bug in the verification one-liner.

- **One algorithm test miscounted warnings.** "Large workload — VX5-V500-240 cheapest at 2 units" asserted `warnings.length === 1` but 500 cameras > 325 (the largest single SKU's max_cameras) so the "exceeds the largest single VideoX SKU" warning also fires. Bumped to `length === 2` and added a positive match for the second warning string. Caught on first test run.

- **PostgREST embed-via-FK stops working when the FK is dropped.** `load-submission.ts` used `products:recommended_product_id(name, description, sku)` to fetch the joined product row in a single query. After Q1(b) drops the FK, that embed silently returns null even when the target SKU exists. Rewrote into two sequential queries (submission, then products by SKU, skipping if the value is UUID-shaped) — a few extra ms but explicit and resilient to legacy strings.

- **`server-only` import blocks tsx scripts.** A planned smoke test (`node --import tsx` calling `loadSubmissionPdfInput` directly) failed with `Cannot find module 'server-only'`. That module is a Next.js convention to prevent server-side modules from being bundled into client code; it's a no-op at runtime under Next but resolves to an empty package under plain tsx via Node's resolution. Couldn't fix in-session without restructuring the PDF module, and the smoke value vs. the build's full type-check is marginal. Documented as a known limitation in the verification gates above — the live UI smoke remains the canonical confirmation if the algorithm or PDF renderer ever needs deeper scrutiny.

- **Post-deploy regression on `/submissions` + `/admin/submissions` list pages — PostgREST embed-via-FK to a dropped FK.** Within ~10 minutes of `b0493f4` landing on Vercel, Andy hit `Failed to load submissions: Could not find a relationship between 'submissions' and 'recommended_product_id' in the schema cache` on the partner-facing `/submissions` page. Same error on `/admin/submissions`. Both list pages had their own inline Supabase query using the embed-alias syntax `products:recommended_product_id(name, sku)`, which PostgREST resolves by walking the FK metadata — gone after Step 3+4 dropped `submissions_recommended_product_id_fkey`. The detail-page loader (`_components/load-submission.ts`) was correctly rewritten to the two-query pattern in the original commit; the list pages were missed because the pre-commit grep ran on `winner.modelCode | winner.productId` — those terms catch the algorithm-output rename — but the embed syntax uses the *column name* as an alias, so a grep on `recommended_product_id` (or `products:`) would have surfaced both list pages. Hotfix `d02556c` mirrors the load-submission.ts pattern on both list pages: drop the embed, batch-fetch products with `WHERE sku IN (...)` for the rows on the current page, render `N × {product_group}` (family-friendly per Q5a) for SKU-shaped values and `N × (legacy)` for UUID-shaped historical FKs. Build + test suite still green. Lesson: when dropping a FK, grep both the column name and the embed-alias patterns (`<column>(...)`) — they're the two places PostgREST relies on schema-cache FK metadata. Folded into the Step 5+6 brief's verification section.

### Decisions captured

- [`0031-step-3-4-schema-migration.md`](./decisions/0031-step-3-4-schema-migration.md)
- [`0032-sku-level-recommendation-algorithm.md`](./decisions/0032-sku-level-recommendation-algorithm.md)

### Pending / follow-ups

- **Manual dev-server smoke** — deferred (gate 11). Recommended at the start of the next session: `npm run dev`, submit a calculation at `/calculator`, confirm a specific SKU is recommended; view at `/submissions` + `/admin/submissions/[id]`; download the PDF and check the SKU + price; pull up one of the 12 pre-migration submissions and confirm "(legacy data — product details unavailable)" renders.
- **Real FK on `submissions.recommended_product_id`** is not added now because the value space still includes legacy UUID strings. After the legacy rows age out (or are pruned) and Step 5 lands the full SKU population, a `references public.products(sku)` constraint can be added in a follow-up migration.
- **`unitMsrp` field on `RecommendationCandidate`** is currently not displayed anywhere. Retained as an audit field (sales can reconcile `units × unitMsrp = totalCostUsd`); drop if it stays unused after Step 6 / 7.
- `docs/phase-2/step-3-4-pause-handoff.md` — written mid-session as a resume recipe when the session was almost out of budget. Now superseded by this JOURNAL entry; deleted as part of the same commit.

---

## 2026-05-21 — Phase 2 Step 2: Master Sheet validation

### Work done

- Installed `csv-parse` as a devDependency (standards-compliant CSV parser; handles quoted fields and ragged trailing columns the sheet has in its header row).
- Created `scripts/validate-prices-sheet.ts` — standalone CLI that fetches the master sheet as CSV, validates all rows, and prints a structured report. Exports `validateSheet()` so Step 5's push script can import the validation function without duplication. Run via: `node --import tsx scripts/validate-prices-sheet.ts`
- Ran validation against the live sheet. **36 data rows, all pass.** Zero violations.

**Validation report (2026-05-21):**

| Check | Result |
|---|---|
| Fetch CSV | HTTP 200, 36 data rows + 1 header |
| All SKUs non-empty | ✓ |
| All SKUs match `VX5-<GROUP>-<TIER>` | ✓ |
| No duplicate SKUs | ✓ |
| All MSRPs are NUMERIC / MKT / "Call for Quote" | ✓ |

Derived Product Groups (20): `GPU, NIC, RAM, SW10, SW20, SW25, SW30, SW35, V100, V150, V200, V250, V255, V260, V270, V400, V500, V600, V700, V800`

MSRP ranges per group:
- GPU: $1,575 | NIC: $300–$1,024 | RAM: MKT (no numeric)
- SW10: $6,085 | SW20: $7,532 | SW25: $8,359 | SW30: CFQ | SW35: CFQ
- V100: $8,317–$9,558 | V150: $7,030 | V200: $15,657–$18,139
- V250: $13,748 | V255: $16,175 | V260: $14,029 | V270: $17,890
- V400: $24,975–$29,861 | V500: $32,978–$40,425 | V600: $37,728–$47,657
- V700: $48,615–$63,509 | V800: $64,922–$87,971

MKT rows: `VX5-RAM-32GB` | CFQ rows: `VX5-SW30-300`, `VX5-SW35-300`

**VX5-PP5-V100 not present** (see Decision 3 below).

### Andy's five decisions (locked)

1. **Sheet is canonical.** The Sheet at `12zwFhDynV6T4ehxui7y-i6F-8XjEYFRBPgsAicpksmk` is the single master. No rival copy.
2. **SKU naming convention confirmed.** All future products follow `VX5-<GROUP>-<TIER>` (GROUP: uppercase/digit; TIER: starts uppercase/digit, allows mixed case). Push script will reject rows that break this.
3. **VX5-PP5-V100 — add to sheet (option a).** Andy will add `VX5-PP5-V100 / 5 Year Protection Plan / $1,995` to the sheet. Validation script will pick it up on next run. Step 5 will push it to Supabase/Pipedrive.
4. **Partner Discount Price column — leave in sheet, ignore in scripts (option a).** Column D stays informational; push script and all downstream tooling ignore it. Step 8 HTML price book will also ignore it (MSRP-only per PQ3).
5. **SW group taxonomy — keep granular.** SW10, SW20, SW25, SW30, SW35 stay as separate product groups in Supabase and Pipedrive. No collapse rule in the push script.

### Verification gates passed

- `npm run lint` — 0 errors (2 warnings from Step 1's `<img>` tags, pre-existing).
- `npm test` — 19/19 pass.
- `npm run build` — clean.
- `node --import tsx scripts/validate-prices-sheet.ts` — exits 0, all checks pass.

---

## 2026-05-21 — Phase 2 Step 1: Minimal portal branding

### Work done

- Added Arxys brand tokens to `src/app/globals.css` `@theme inline` block: `--color-arxys-gold: #fbb040`, `--color-arxys-gold-hover: #e69e2c`, `--color-arxys-text-on-gold: #1a1a1a`, `--color-arxys-grey: #d1d2d4`. Source: ADR 0025. This makes Tailwind classes `bg-arxys-gold`, `hover:bg-arxys-gold-hover`, `text-arxys-text-on-gold`, `border-arxys-grey` available app-wide.
- **Logo (Q1 — reused email asset)**: No new asset supplied. `public/email/arxys-logo.png` (250×43, transparent, Arxys Gold wordmark) used directly at its existing path. Email templates are unaffected.
- Replaced the text title "Arxys Partner Portal" in `src/app/(app)/layout.tsx` header with a plain `<img>` tag referencing the logo at 140px wide. Partner name / contact info line retained below.
- Replaced the `<h1>` title in `src/app/(auth)/layout.tsx` auth card with the same logo `<img>` (centered, `inline-block`). Text sub-title dropped as it was redundant with page context.
- Swapped primary button colors from `bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-400` to `bg-arxys-gold text-arxys-text-on-gold hover:bg-arxys-gold-hover disabled:opacity-50` in four files:
  - `src/app/(auth)/login/login-form.tsx` — "Sign in" submit
  - `src/app/(auth)/forgot-password/forgot-form.tsx` — "Send reset link" submit
  - `src/app/(auth)/reset-password/reset-form.tsx` — "Update password" submit
  - `src/app/(app)/admin/partners/new/invite-form.tsx` — "Send invite" submit
- Updated `src/app/(app)/calculator/calculator.css` `.ax-save-btn` rule: background changed from `var(--ac)` (#2563eb blue) to `#fbb040`; text color from `#fff` to `#1a1a1a`; hover from `#1d4ed8` to `#e69e2c`. The broader `--ac` blue variable was left intact so focus rings, range sliders, and chart elements inside the calculator are unchanged.
- `Suspend` button on `/admin/partners` left on its existing `danger` variant (red border/text). Row actions Reactivate/Resend Invite left on `primary`/`neutral` as-is — these are not CTA-level primary actions.

**Verification gates passed:**
- `npm run lint` — 0 errors, 2 warnings (both expected: ESLint flags plain `<img>` vs `next/image`; brief explicitly chose `<img>`).
- `npm test` — 19/19 pass.
- `npm run build` — Turbopack, clean, 15 routes.
- Dev server started, `/login` returned HTTP 200. Visual browser verification skipped (Chrome extension not connected); code changes are mechanically correct.

### Logo Q1 decision

Reused `public/email/arxys-logo.png` (default fallback). At 140px render width the 250px source will be crisp on 1× screens and acceptable on 2× retina. A higher-res asset can be dropped at `public/arxys-logo.png` later — the `src` attribute in both layout files is the single change needed.

---

## 2026-05-20 — Portal Phase 2 plan locked + scope cuts

### Work done

Scoped Portal Phase 2 in a single session immediately after the Step 11 close-out. Andy supplied five concrete partner-facing goals (minimal portal branding, real MSRP pricing on calculations, automatable Sheet → Supabase + Pipedrive sync with **no** Slides, partner XLSX download, HTML price book in the portal). The five goals plus the six "PQ" questions left open at Step 11 closure all locked in this session.

Artifacts created or revised:

- [`docs/phase-2-plan.md`](./phase-2-plan.md) — operational plan for Portal Phase 2. **10 Phase 2 Steps + 1 optional**, each with explicit blockers. Locked PQ resolutions, scope cuts, and internal-only-testing stance recorded at the top. Open scoping question for Step 8 (Slides content audit) parked at the bottom.
- ADR [`0029-phase-2-step-naming-convention.md`](./decisions/0029-phase-2-step-naming-convention.md) — **"Phase 2 Step N"** naming for new entries; existing Phase 1 entries keep their bare "Step N" form (no retroactive renames). Pipeline-proposal sub-phases referenced in writing as "Pipeline Phase X" for disambiguation.
- ADR [`0030-phase-2-scope-and-locked-decisions.md`](./decisions/0030-phase-2-scope-and-locked-decisions.md) — single consolidated record of every Phase 2 scope decision: the two scope cuts (Slides removed, internal-only-during-Phase-2) and the six PQ resolutions, each with options considered and rationale.
- [`docs/README.md`](./README.md) — appended a "Forward-looking plans" section indexing `phase-2-plan.md` and the proposal. Doesn't change the three-doc discipline; just makes Phase 2 discoverable.
- [`docs/proposals/phase-2-pricing-pipeline.md`](./proposals/phase-2-pricing-pipeline.md) — banner added at top documenting scope cuts (Slides out, Sheet stays as-is, script in this repo, internal-only testing, full SKU-PK migration). Body below the banner unchanged — it remains the verbatim reference copy of Andy's Google Doc.

No code changes. Phase 2 Step 1's scoping brief is the next session's deliverable.

### Scope cuts vs the original proposal

- **Google Slides removed entirely.** No automation, no retirement step, no comms work. The HTML price book inside the portal (Phase 2 Step 8) replaces Slides functionally. Andy: *"remove from project entirely."*
- **Internal testing only during Phase 2.** No external partners until end of Phase 2 (= "MVP final" = Phase 2 Step 10).

### Decisions locked (six PQs)

- **PQ1** launch-blocker treatment: moot. Internal-only-during-Phase-2 means the `/submissions` placeholder-price view is invisible to anyone outside Arxys; Step 6 unblocks with real numbers before external partners arrive.
- **PQ2** Sheet reconciliation: **(ii)** — work with Sheet as-is. Push script derives Product Group from SKU prefix and parses inline MKT/CFQ. Zero data-entry burden on the Sheet maintainer.
- **PQ3** discount mechanic: partial. XLSX download is MSRP-only. HTML price book defers per-user discount to its own scoping.
- **PQ4** schema appetite: full SKU-PK migration. Forced by Goal 4 (partner XLSX of the full ~35-SKU price list).
- **PQ5** push script location: **(a)** — `scripts/push-prices.ts` in this repo.
- **PQ6** sub-phase sequencing: per-step scoping briefs in the Step 11 shape, at `docs/phase-2/step-N-<title>.md`.

### Decisions captured

- [`0029-phase-2-step-naming-convention.md`](./decisions/0029-phase-2-step-naming-convention.md)
- [`0030-phase-2-scope-and-locked-decisions.md`](./decisions/0030-phase-2-scope-and-locked-decisions.md)

---

## 2026-05-20 — Step 11: pre-launch verification (Phase 1 closed, partner-launch reframed to Phase 2)

### Work done

Structural pre-launch verification of Portal Phase 1 per the Step 11 brief. Phase 1 is **feature-complete and structurally verified**; partner-facing launch is **blocked on Phase 2** (Pricing Pipeline project per ADR [0019](./decisions/0019-defer-real-pricing-to-phase-2.md)) for one specific reason captured under Detours & fixes. That blocker is treated as the trigger event for Phase 2 — not a Step 11 bug to fix in place. Step 11 closes here, not partial-incomplete.

**§A1 Vercel — verified clean:**

- All 10 required Production env vars present. Orphan `PIPEDRIVE_API_KEY` (from the Step 8 follow-up detour 2026-05-19) removed.
- Deployment Protection Production = Disabled (incognito `https://portal-arxys.vercel.app/` returns 307 → `/login`, not Vercel SSO).
- `.vercel/project.json` pins working copy to the `portal` project (`prj_tu3RWtzjhh7ao4mAELuJVaFWgkJV` in org `arxys`).
- Production deployment `dpl_CDefAByY...` Ready, aliased to `portal-arxys.vercel.app`, `portal-git-main-arxys.vercel.app`, `portal-flame-eta.vercel.app`. The `-git-main-` alias plus a 2h-old auto-deploy from `main` HEAD `9514b62` together evidence Production Branch = `main`.
- Framework Preset = Next.js (Andy eyeball-confirmed; corroborated by Next.js routes + `/_next/static/...` URLs being served).
- Sibling Vercel project `forecast` exists (RUNBOOK §10 step 9 partially satisfied — `arxys-com` placeholder optional, not created).

**§A2 Supabase — verified clean:**

- Supabase CLI linked to cloud project `ddqnpwpouvkgivvbjpju` (matches `NEXT_PUBLIC_SUPABASE_URL`).
- All four canonical templates at [`docs/email-templates/*.html`](./email-templates/) use `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=…&amp;next=…` — zero references to `{{ .ConfirmationURL }}` (the Step 9 follow-up detour bug). Per-template `<type>` + `<next>` correct.
- `scripts/test-rls.ts` end-to-end run against the production database: **8/8 PASS**, including 8c (suspended admin loses cross-partner SELECT). This is the long-standing "pending" item from Step 9 Phase B closed out. Side-observation from 8b: the production DB already has ~14 submissions across 4 owner UUIDs (real partner activity beyond the ephemeral test personas).
- Site URL / Redirect URLs / SMTP credentials / template paste / Auth logs eyeball: Andy confirmed via dashboard.

**§A3 Gmail deliverability — verified via DNS:**

- SPF includes `_spf.google.com` (`v=spf1 ip4:173.236.43.242 include:_spf.google.com include:arxys.com.spf.auto.dnssmarthost.net ~all`).
- DKIM at `google._domainkey.arxys.com` actively signing (RSA key published).
- DMARC `v=DMARC1; p=none; rua=mailto:info@arxys.com` — meets the brief's "p=none minimum"; aggregate reports flow to `info@arxys.com`.
- MX routes to `aspmx.l.google.com` cluster.
- Two non-blocking observations: SPF is `~all` (soft fail; tightening to `-all` is a future hardening step) and DMARC `p=none` (monitor-only; tightening to `p=quarantine` is a future step). App Password + `sales@arxys.com` alias + mailbox monitoring: Andy confirmed.

**§A4 Pipedrive — verified clean against live tenant:**

- Pipeline `"Project Pipeline"` exists (id=1, active). Stage `"New Lead"` exists in pipeline 1 (id=1, order 2).
- User `"Andy Newbom"` resolves (id=6039322, active).
- All 6 `arxys_*` custom fields exist with correct `field_type` (auto-created on prior submissions; no first-run risk for the launch cohort).
- All 13 admin-curated calculator fields exist by exact name (`Project Name`, `VMS`, `Camera Streams`, `Recording`, `Motion Activity Est. %`, `Frame Rate`, `Resolution`, `Retention Days`, `CODEC`, `Total Storage`, `Scene Complexity`, `Recording hours`, `Recommended Server`).
- All VMS / CODEC / Scene Complexity / Recording option IDs in [`src/lib/pipedrive/deal.ts`](../src/lib/pipedrive/deal.ts) match the live tenant exactly. Zero drift from the Step 8 follow-up baseline.

**RLS regression — closed (see §A2 above).** Ephemeral users teardown clean; no residual state in cloud DB after the run.

**Step 11 close-out doc work — landed in this commit:**

- ADR [`0027-silent-log-for-non-blocking-integrations.md`](./decisions/0027-silent-log-for-non-blocking-integrations.md) — accepts the current silent-`console.error` behavior on Pipedrive deal-create + partner-copy email failures as a deliberate Phase 1 choice (not an oversight). Revisit on volume or real-incident trigger.
- ADR [`0028-defer-per-flow-reset-password-heading.md`](./decisions/0028-defer-per-flow-reset-password-heading.md) — accepts the shared "Reset your password" heading as a known limitation; Phase 2's partner-portal copy pass takes it as tracked work.

### Detours & fixes

- **Partner-visible nonsense prices — the launch blocker that reframes Phase 2.** ADR [0019](./decisions/0019-defer-real-pricing-to-phase-2.md) instructed "Calculator, PDF, and email show 'Pricing TBD' or equivalent text in any price field." Implementation got three of four surfaces right (calculator UI, PDF, partner email — none of these render pricing). Step 9 Phase B introduced two routes that ADR 0019 was written before and therefore didn't enumerate: `/submissions` (partner-facing list) and `/submissions/[id]` (partner-facing detail). Both render `formatPrice(submission.total_list_price_usd)`, and `formatPrice()` at [`src/app/(app)/_components/submission-detail.tsx:67`](../src/app/(app)/_components/submission-detail.tsx) returns `"Pricing TBD"` only for **null** values — not for the placeholder `products.list_price_usd` rows (1.00..6.00 dollars). A real partner submitting today sees totals like `$57.00` for "19 units × V500 placeholder $3" on their submission detail. Confirmed by reading the production `submissions` table: 10 most recent rows show values from `$1.00` to `$57.00`. Not fixed in Step 11 by deliberate choice — fixing it cleanly belongs to Phase 2 (Pricing Pipeline), which can either ship real prices from the now-existing Master Sheet or short-circuit with a "partner price suppression" precursor commit before any real partner is invited. Step 11 surfaces the blocker; Phase 2 owns the resolution. The 2–3-partner launch cohort from Step 11 §D5 does not get invited until that resolution lands.

- **Pricing master Google Sheet now exists.** The Phase 2 proposal at [`docs/proposals/phase-2-pricing-pipeline.md`](./proposals/phase-2-pricing-pipeline.md) anticipated this Sheet but treated it as future Phase 0 work. As of Step 11 the Sheet is live at `https://docs.google.com/spreadsheets/d/12zwFhDynV6T4ehxui7y-i6F-8XjEYFRBPgsAicpksmk/` with 35 data rows (header + 34 product rows, "Valid as of 5/5/2026"). Mismatches against the proposal's Phase 0 spec, captured for Phase 2 reconciliation rather than fixed in Step 11: (a) no `Product Group` column; (b) `Price Type` not a separate column — MKT/CFQ values are inline strings in the MSRP cell; (c) row count is 35, doc expected 41 after 4 named additions; (d) one named addition `VX5-PP5-V100` is still absent; (e) extra `Partner Discount Price` column derived from a sheet-level discount % rather than the doc's per-user `partners.discount_tier`. These are Pipeline Phase 0 cleanup items, not Step 11 work.

- **Step 11 scope reframe (mid-pass).** Started executing the brief's §A → §B sequence, completed §A1–§A4 + RLS clean, then surfaced the partner-visible-prices issue during §A5 (branding/copy review). The remaining §A5 (price-display review), §A6 (cohort timing), §B1 partial (Pipedrive smoke), and §B3 (page-by-page production pass) all overlap Phase 2 work and would be redone there. Closing Step 11 now with the structural verification green is the cheaper move than pretending to complete a checklist whose remaining items belong to a different scoping cycle. The pre-launch verification function the brief was written to serve has been served; the partner-shipping function is Phase 2's job.

### Decisions captured

- [`0027-silent-log-for-non-blocking-integrations.md`](./decisions/0027-silent-log-for-non-blocking-integrations.md)
- [`0028-defer-per-flow-reset-password-heading.md`](./decisions/0028-defer-per-flow-reset-password-heading.md)

### Handed off to Phase 2 (Pricing Pipeline)

These were on the original Step 11 brief but defer rather than complete:

- **Partner-visible price display on `/submissions` + `/submissions/[id]`** (the launch blocker). Resolution path: either Pipeline Phase 2 (Portal Price Book Page) ships real partner pricing, or a precursor "Path B" suppression commit lands first and a no-pricing Phase 1 ships to a canary partner.
- **Auth-flow smoke tests in production** (forgot-password recovery, suspend → `/login?error=suspended` banner, Resend Invite). Step 9 transitivity argues these work; defer to Phase 2 pre-launch where the page-by-page pass touches them anyway.
- **Page-by-page production pass** (Step 11 §B3). Folded into Phase 2 pre-launch — pages will change in Phase 2 so doing this now would be wasteful.
- **Custom domain `portal.arxys.com`** (Step 11 §D1 deferred per ADR [0025](./decisions/0025-supabase-custom-smtp-and-branded-templates.md) "when to revisit").
- **2–3 partner launch cohort invite** (Step 11 §D5). Now a Phase 2 decision: shape of "what does launch look like" depends on Phase 2's pricing-display resolution.

---

## 2026-05-20 — Step 9 follow-up: branded auth emails + Vercel production protection

### Work done

- **Logo asset** at [`public/email/arxys-logo.png`](../public/email/arxys-logo.png). Pulled the canonical Arxys gold wordmark from `https://www.arxys.com/wp-content/uploads/Arxys-logo-gold-e1503013560806.png` (the header logo on the marketing homepage). 250×43 RGBA PNG, transparent background, 6.5 KB. Smaller than the brief's recommended 400×120 source but renders at `width="140"` in the templates — slight downscale on retina, no upscaling, stays crisp.
- **Four canonical email templates** in [`docs/email-templates/`](./email-templates/) — `invite.html`, `magic-link.html`, `reset-password.html`, `confirm-signup.html`, plus a [`README.md`](./email-templates/README.md) calling out the source-of-truth rule and the per-template subject lines. One Montserrat-based skeleton (700 heading / 400 body, with the `-apple-system, BlinkMacSystemFont, ...` fallback stack for clients that strip `<link>` to Google Fonts). Brand Gold `#fbb040` CTA with dark `#1a1a1a` text (WCAG AAA 9.5:1; white-on-Gold would fail AA at 2.0:1). Brand Grey `#d1d2d4` used only for the card border and the divider above the footer — too light for text per the `arxys-company` skill's usage notes.
- **ADR** [`0025-supabase-custom-smtp-and-branded-templates.md`](./decisions/0025-supabase-custom-smtp-and-branded-templates.md) — custom SMTP + all four templates, with the reasoning for choosing this over template-only or generateLink+nodemailer.
- **RUNBOOK** — added two new sections after §8: §8a (Supabase custom SMTP recipe) and §8b (Vercel production deployment protection). Both are now part of recreating the project from zero.
- **WCAG fix on form inputs** — `src/app/globals.css` had `create-next-app`'s default `prefers-color-scheme: dark` block flipping `--foreground` to `#ededed` (near-white). Native form elements (`<input>`, `<textarea>`, `<select>`) inherited that color and rendered near-white on white cards for any user with OS dark mode enabled. Surfaced on the invite form at `/admin/partners/new` during smoke-test prep. Removed the dark-mode auto-switch (portal is light-mode only in Phase 1 — see ADR 0026), and added explicit form-element CSS in the same file: `color: #171717` / `background-color: #ffffff` on inputs, `::placeholder` set to `#6b7280` (gray-500, ~4.7:1 on white, passes WCAG AA) with `opacity: 1` to override Firefox's 0.54 default, and a `-webkit-autofill` override so Chrome's pale autofill paint doesn't recreate the same bug.

### Verification & dashboard configuration

All five dashboard steps completed, in this order:

1. **Vercel** → Portal → Settings → Deployment Protection — Production set to **Disabled**, Preview kept as "Only Vercel Team". Verified incognito `https://portal-arxys.vercel.app` lands on `/login`, not Vercel SSO. Logo URL `https://portal-arxys.vercel.app/email/arxys-logo.png` returned 200 + `image/png` immediately after the toggle (had been 401 across 30 polls beforehand — the chicken-and-egg confirmation that the whole portal domain was behind Vercel SSO).
2. **Supabase** → Authentication → URL Configuration — Site URL is `https://portal-arxys.vercel.app`, Additional Redirect URLs include `https://portal-arxys.vercel.app/**` and `http://localhost:3000/**`. Unchanged from earlier setup; only a sanity-check.
3. **Supabase** → Authentication → Emails → SMTP Settings (note: Supabase moved this page since the brief was written — it's now under Authentication, not Project Settings → Auth) — custom SMTP enabled with Host `smtp.gmail.com`, Port `587`, **Username `andy.newbom@arxys.com`** (the Google account that owns the App Password, per ADR 0002), Password = the 16-character App Password pasted without spaces, Sender email `sales@arxys.com` (the "Send mail as" alias), Sender name `Arxys Partner Portal`. Supabase emits a generic "Check your SMTP provider — designed for personal email" warning on Gmail SMTP; acknowledged and dismissed per ADR 0025 "When to revisit" (Gmail Workspace deliverability is fine at MVP volume; migrate to a transactional provider if/when we exceed ~2000 messages/day).
4. **Supabase** → Authentication → Email Templates — all four templates pasted from `docs/email-templates/*.html` with updated subject lines per the table in `docs/email-templates/README.md`. Preview pane confirmed the Arxys logo + Gold CTA + branded footer before saving each.
5. **Smoke test (invite path) passed end-to-end** after the `{{ .TokenHash }}` URL fix landed:
   - Anonymous incognito → `/login`, not Vercel SSO.
   - Invite from `/admin/partners/new` to a personal Gmail.
   - Branded email arrived in Inbox (not Spam), From `Arxys Partner Portal <sales@arxys.com>`, Subject `You're invited to the Arxys Partner Portal`, Gold CTA + logo + footer all rendering correctly.
   - CTA link `https://portal-arxys.vercel.app/auth/confirm?token_hash=...&type=invite&next=/reset-password` (note: lands directly on our route handler — no Supabase verify round-trip).
   - `/auth/confirm` exchanged the token for a session and redirected to `/reset-password`. No URL fragment, no `error=missing_token`.
   - Setting the password signed the invitee in and landed them on `/dashboard`.
   - Phase A's layout gate auto-flipped `partners.status` from `'invited'` to `'active'` on first protected-page load.
6. **Smoke test (other paths) not yet exercised but high-confidence by transitivity**: forgot-password → recovery email, suspend → `/login?error=suspended` banner, Resend Invite → second invite email. All three use the same SMTP + template plumbing as the invite path. Worth a live pass when a real partner is onboarded; not blocking ship.

**Accepted minor UX limitation**: `/reset-password` is shared between the invite flow (set initial password) and the forgot-password flow (set new password). Heading reads "Reset your password" — slightly awkward for a brand-new invitee who has no existing password. Functionally correct and a common pattern (GitHub, Google, many B2B tools use the same one-page-two-flows shape). Captured here as a known UX nit; revisit if a partner comments on it or when marketing brings a brand-voice opinion. Not ADR-worthy.

### Decisions captured

- [`0025-supabase-custom-smtp-and-branded-templates.md`](./decisions/0025-supabase-custom-smtp-and-branded-templates.md)
- [`0026-light-mode-only-in-phase-1.md`](./decisions/0026-light-mode-only-in-phase-1.md)

### Detours & fixes

- **Template CTA used `{{ .ConfirmationURL }}` — wrong for our route handler.** First branded invite email landed at `/login?error=missing_token` with a giant `#access_token=...` URL fragment hanging off the end. Diagnosis: `{{ .ConfirmationURL }}` resolves to Supabase's legacy `/auth/v1/verify` endpoint, which returns the session as a URL fragment (implicit-flow style). Our `/auth/confirm` route handler (`src/app/auth/confirm/route.ts:9-34`) reads `token_hash` + `type` from **query params** (modern OTP / `@supabase/ssr` PKCE), and fragments are invisible to it server-side. Fix: replace `{{ .ConfirmationURL }}` in all four templates with a manually-constructed URL using `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<flow>&next=<path>`. Per-template `<flow>`: `invite` / `magiclink` / `recovery` / `signup`. Per-template `<next>`: `/reset-password` for invite + recovery (need to set/reset password), `/dashboard` for magic link + signup. Ampersands are XML-escaped as `&amp;` in the HTML. ADR 0025 now documents the pattern; the brief had this wrong and the README at `docs/email-templates/README.md` was updated to match. Lesson: when `@supabase/ssr` is in play with PKCE, **never** use `{{ .ConfirmationURL }}` — always construct via `{{ .TokenHash }}`.
- **First Supabase SMTP send returned `535 5.7.8 BadCredentials`.** Diagnosis via Supabase Auth logs (Logs → Auth Logs, filter by error level). Initial assumption was Username/Sender alias mismatch (the divergence we'd already documented); actual cause was simpler — the App Password was entered with the spaces Google displays it with. Stripping spaces fixed it. Lesson for the RUNBOOK: emphasise "no spaces" in the SMTP recipe loud enough that no one re-trips on this.
- **The first branded email was actually the Supabase default — not Arxys-branded.** Despite the templates living in `docs/email-templates/*.html`, the Supabase dashboard's Email Templates page still had the default HTML on the Invite template. Easy to skip in a multi-step dashboard pass; flagging here so the smoke-test checklist explicitly verifies the preview pane shows the Gold CTA + logo before sending a test invite.
- **Dark-mode auto-switch from `create-next-app` was producing white-on-white form fields** on macOS dark mode. Mostly masked across the app because components pin text colors explicitly with Tailwind classes — but native form elements didn't, and inherited the near-white `--foreground` from globals.css under `prefers-color-scheme: dark`. Initial diagnosis assumed placeholder contrast (Tailwind's default placeholder shade); the real cause was the dark-mode media query swapping the body color. Removing the media query and pinning form-element colors explicitly fixes the visible bug AND prevents the next unstyled component in Phase 2+ from re-introducing it. Documented in ADR 0026.
- **Brief said Port 587, ADR 0002 / RUNBOOK §2 establish 465.** Both work against Gmail (587 = STARTTLS, 465 = SSL). The nodemailer transport at runtime uses 465; the Supabase form is being set to 587 because that's the port Supabase recommends in-product. Captured the divergence in ADR 0025 so future readers don't see "two ports for one SMTP host" and assume one is wrong.
- **Brief instructed `Username: sales@arxys.com` in the Supabase SMTP form.** ADR 0002 documents the actual App Password as belonging to `andy.newbom@arxys.com` with `sales@arxys.com` set up as a "Send mail as" alias under that account — Google App Passwords are bound to the authenticating account, not the alias, so the Supabase `Username` field must use the owning account. The `Sender email` (the visible From) is correctly the alias. Surfacing this in the pending list so the dashboard step uses the right credential, not the literal brief text.
- **Logo source.** Brief noted "user attached it earlier in the conversation history" — not available in a fresh session. Fell back to the brief's documented fallback ("pull from `https://www.arxys.com/` — the homepage header logo is the canonical asset"). Confirmed via `grep` of the homepage HTML; `Arxys-logo-gold-e1503013560806.png` is the canonical wordmark.

---

## 2026-05-20 — Step 9 Phase B: admin panel + partner submission history

### Work done

- **`src/app/(app)/admin/layout.tsx`** — admin-only shell. Re-checks `partners.role='admin' AND status='active'` defensively and calls `notFound()` if either is missing — a 404 (not 403) so the admin section doesn't leak its existence to non-admins. Inherits the header + signOut from `(app)/layout.tsx`. Renders a thin left side-nav with Overview / Partners / Submissions / Back to Dashboard.
- **`src/app/(app)/admin/page.tsx`** — landing page with three KPI cards (Partners broken down by status, all-time submissions, submissions in the last 30 days) and a 10-row "Recent submissions" table linking each row to `/admin/submissions/[id]`. The 30-day cutoff goes through a `cutoffIsoDaysAgo()` helper so the impure `Date.now()` read isn't inline in the render body (eslint's `react-hooks/purity` rule treats async Server Components as render functions; see Detours).
- **`src/app/(app)/admin/partners/page.tsx`** — table of all partners, ordered by `created_at desc`. Columns: company, contact, email, role, status (colored pill), created date, actions. Email comes from `auth.admin.listUsers({ perPage: 200 })` joined in memory — `partners` doesn't store email (it's the `auth.users` source of truth). Top-right "Invite partner" CTA links to `/admin/partners/new`.
- **`src/app/(app)/admin/partners/partner-row-actions.tsx`** — client component wrapping the per-row Suspend / Reactivate / Resend Invite buttons. Each button is its own `<form>` with `useActionState` so inline errors (from the self-suspend / last-active-admin / TOCTOU guards) render next to the offending button. Suspend has a `window.confirm` prompt to defuse misclicks. Buttons are rendered conditionally on `row.status` — Suspend only for `active`, Reactivate only for `suspended`, Resend Invite only for `invited`.
- **`src/app/(app)/admin/partners/actions.ts`** — four Server Actions (`invitePartner`, `suspendPartner`, `reactivatePartner`, `resendInvite`). All four start with a `requireAdmin()` helper that re-verifies the caller via the user-scoped client before opening the service-role client. Guards as committed: `invitePartner` rolls back the auth user with `admin.auth.admin.deleteUser` if the partners-row INSERT fails; `suspendPartner` refuses self-suspend and the last-active-admin case (count via service-role); `resendInvite` re-reads `partners.status` and refuses if no longer `'invited'` (TOCTOU). Redirect URL for both invite calls mirrors the `headers().get('origin')` pattern from `src/app/(auth)/forgot-password/actions.ts:23-30`.
- **`src/app/(app)/admin/partners/new/page.tsx` + `invite-form.tsx`** — server page wrapping a client form. Three fields (email, contact name, company name); validation with zod inside the Server Action, field-level errors surfaced via `useActionState`. Submit button shows pending state.
- **`src/app/(app)/admin/submissions/page.tsx`** — paginated (`LIMIT 50 OFFSET ?`) table of every submission across partners. `?partnerId=` GET filter via a dropdown sourced from the partners list (admin-only read OK via existing RLS). Columns: date, partner company, project, recommendation (`N × Model`), camera count, list price, View link.
- **`src/app/(app)/admin/submissions/[id]/page.tsx`** — read-only admin submission detail. Uses the shared `<SubmissionDetail mode="admin" partner={...} />` component.
- **`src/app/(app)/submissions/page.tsx`** — partner-facing list of the caller's own submissions. Same shape as the admin list minus the partner column. RLS scopes automatically; no application-level `partner_id` filter (per ADR 0024).
- **`src/app/(app)/submissions/[id]/page.tsx`** — partner-facing detail, same shared component in `mode="partner"`. No partner header line, no Pipedrive link, no partner-price row.
- **`src/app/(app)/_components/submission-detail.tsx`** — shared Server Component renderer. The `mode` prop is the only difference between admin and partner views; the partner-price row and the Pipedrive link key off it. Renders the calculator inputs table, the per-group breakdown from `groups_payload`, the recommendation block (joined `products.name + description + sku`), the Download PDF link, and (admin only) the Pipedrive deal link.
- **`src/app/(app)/_components/load-submission.ts`** — `loadSubmissionDetail(id)` helper used by both detail pages. Single Supabase SELECT with the products embed; flattens the Supabase array-vs-object embed shape into a normalised object.
- **`src/app/(app)/calculator/actions.ts`** — defense-in-depth at the top of `submitCalculation`: refuse with a clear error if the caller's `partners.status !== 'active'`. The Phase A layout gate already blocks suspended partners from the UI; this catches a stale tab or scripted POST.
- **`scripts/test-rls.ts`** — extended with an `admin` persona (`provisionPersona("ADMIN", { role: "admin" })`). Added three test cases: admin SELECT partners returns at least A + B + self (8a), admin SELECT submissions returns rows for both A and B (8b), suspending the admin (via service-role) strips their cross-partner reads — they go from "sees all" to "sees only self" without dropping the session (8c, proves `is_admin()` correctly requires `status='active'`). Server Action guards (self-suspend, last-active-admin, resend-invite TOCTOU) are explicitly noted as out-of-scope for `test-rls.ts` because they live in Server Actions, not RLS.
- **ADRs.**
  - [`0023-partner-management-actions.md`](./decisions/0023-partner-management-actions.md) — minimal action surface: Invite + Suspend/Reactivate + Resend Invite. Explicit non-features: no delete, no edit-profile, no role-flip.
  - [`0024-partner-submission-history.md`](./decisions/0024-partner-submission-history.md) — partner routes at `/submissions`, RLS-only scoping, shared detail renderer with `mode` prop.
- **Verification** — `npm run build` clean (15 routes, ~2.8s compile + 2.6s TS), `npm run lint` clean (after the purity-rule workaround), `npm test` 19/19. `scripts/test-rls.ts` not executed in this session (requires service-role credentials in the local env) — extension is mechanical and the existing pattern is unchanged.
- **RUNBOOK** — unchanged. Phase B introduces no new env vars, scripts, or setup steps.
- **Local commits** — five, grouped by area: admin shell + landing; partner management (list + actions + invite + row-actions); submissions (admin + partner + shared component + loader); calculator defense + RLS test extension; docs (ADRs + this JOURNAL entry). Not pushed.

### Detours & fixes

- **`react-hooks/purity` flagged `Date.now()` inside the admin landing's Server Component.** First write put `new Date(Date.now() - 30 * 86_400_000).toISOString()` directly inside the `Promise.all([...])` body for the last-30-days submission count. ESLint v9 with `eslint-config-next` 16.2.6 now ships a purity rule that treats async RSCs as render functions and flags impure calls like `Date.now()` inline. Workaround: hoist into a one-line `cutoffIsoDaysAgo(days: number)` helper at module scope and call it once before the parallel reads — the rule allows function calls to non-render helpers. Captured here because the rule is recent enough that future authors writing similar "cutoff" logic in Server Components will hit the same warning.
- **Server Action result state doesn't reach the page when used as a plain `<form action={...}>`.** Initially planned the row actions as plain server-rendered forms with the action functions wired directly. That works for the happy path (`revalidatePath` causes a re-render) but loses the inline error case — when `suspendPartner` returns `{ status: 'error', error: 'You cannot suspend yourself' }`, the page just re-renders without the message. Wrapped the buttons in a small client component (`partner-row-actions.tsx`) using `useActionState`. Trade-off acknowledged: an extra small client bundle on the partners page; the alternative (writing the error into a query string and reading it back) would have leaked partner IDs into the URL bar and required custom plumbing per action.
- **`auth.admin.listUsers` is paginated, capped at 200 per page by default.** The partners table joins email from `auth.users` because email isn't denormalised onto `partners`. The current implementation calls `listUsers({ perPage: 200 })` once. For partner bases >200 we'd need to walk pages. Recorded as a known limitation in this entry rather than building speculative pagination — the current partner count is in single digits and the comment in [`admin/partners/page.tsx`](./../src/app/(app)/admin/partners/page.tsx) flags the limit.
- **`recovery` vs `invite` confirm route.** The Supabase docs and `src/app/auth/confirm/route.ts` already accept `type=invite` (it's a value in `EmailOtpType`). The invite redirect goes to `/auth/confirm?next=/reset-password`; the verifyOtp call sets the session and forwards to `/reset-password` where the invitee picks a password. No new route was needed.
- **No new migrations and no new RLS policies were introduced.** Every column referenced by Phase B (`partners.status`, `submissions.pipedrive_deal_id`, `submissions.groups_payload`, the embedded `products` columns) was already in place by the end of Step 8. The admin-aware select policies (`partners_select_self_or_admin`, `submissions_select_own_or_admin`, `products_select_active_or_admin`) cover every read; service-role writes cover the four partner-management actions.

### Decisions captured

- [`0023-partner-management-actions.md`](./decisions/0023-partner-management-actions.md)
- [`0024-partner-submission-history.md`](./decisions/0024-partner-submission-history.md)

### Pending / explicit non-goals

- Smoke test in production: invite a real test partner, confirm the invite email arrives, click through `/reset-password`, set a password, sign in, verify dashboard renders with `partners.status` now `'active'`, suspend the test partner from `/admin/partners`, confirm the next request bounces to `/login?error=suspended`.
- `scripts/test-rls.ts` end-to-end run requires the service-role key — defer to a session where Andy has env access loaded.
- No partner self-service profile editing, no role-flip UI, no hard delete (ADR 0023).
- No customised Supabase invite email — defaults are acceptable for Phase 1.

---

## 2026-05-20 — Step 9 Phase A: foundation gates + dashboard cleanup

### Work done

- **`src/app/(app)/layout.tsx`** — extended the existing partner-row `select` to include `status`. Inserted two branches between the partner load and the render:
  1. `if (partner?.status === "suspended")` → `await supabase.auth.signOut()` then `redirect('/login?error=suspended')`. The signOut is load-bearing: without it, the proxy's authed-on-`/login` redirect (`src/lib/supabase/proxy.ts:59-64`) would bounce the still-authenticated user back to `/dashboard` and produce an infinite redirect loop.
  2. `if (partner?.status === "invited")` → service-role `UPDATE partners SET status='active' WHERE id=?` via `createSupabaseAdminClient()`. Errors are logged, not thrown — a failed flip leaves the user `'invited'` until the next request, which is harmless because `'invited'` and `'active'` are functionally equivalent for non-admin paths (only `is_admin()` requires `status='active'`).
  3. Added a conditional "Admin" link in the header chrome next to "Sign out", rendered only when `partner.role === 'admin'`. The link points at `/admin`, which doesn't exist yet — Phase B will add the route. Only admins see the link; non-admin partners never get a 404.
- **`src/app/(auth)/login/page.tsx`** — widened the `Search` promise type to accept an optional `error` query string. When `error === 'suspended'`, renders a small red banner above the sign-in form: "Your account has been suspended. Contact your administrator." Banner uses the same `text-red-*` palette as the existing `LoginForm` error pattern (`login-form.tsx:44-48`).
- **`src/app/(app)/dashboard/page.tsx`** — deleted the dashed-border "Coming in Step 5" stub. Added two cards, both styled to match the existing Calculator card so the dashboard reads coherently:
  - "Submission history" → `/submissions` for all users. Route 404s today; Phase B adds the partner-facing submissions list.
  - "Admin" → `/admin`, rendered only when the current user is an admin. Same 404 caveat; Phase B adds it.
- **ADRs.**
  - [`0021-suspend-gate-in-app-layout.md`](./decisions/0021-suspend-gate-in-app-layout.md) — why the gate lives in the layout (vs. proxy or RLS) and why the signOut-before-redirect is required.
  - [`0022-auto-activate-on-first-sign-in.md`](./decisions/0022-auto-activate-on-first-sign-in.md) — why the `'invited' → 'active'` flip happens on first protected-page load via service-role rather than manually or via a webhook.
- **Local commits** — grouped as: layout + login banner; dashboard cards; docs (ADRs + this JOURNAL entry). Not pushed.

### Decisions captured

- [`0021-suspend-gate-in-app-layout.md`](./decisions/0021-suspend-gate-in-app-layout.md)
- [`0022-auto-activate-on-first-sign-in.md`](./decisions/0022-auto-activate-on-first-sign-in.md)

### Phase B handoff brief

> The next session reads this cold. Everything below is the locked input for Phase B; if any of it conflicts with new information discovered during implementation, update *here* before changing course.

#### Locked decisions (re-state verbatim in the Phase B session)

1. **Suspend gate lives in `src/app/(app)/layout.tsx`** (not the proxy, not RLS). Signs the user out and redirects to `/login?error=suspended`. Done in Phase A — Phase B does not re-implement.
2. **Auto-activate on first protected-page load** flips `partners.status` from `'invited'` to `'active'` via the service-role client. Done in Phase A — Phase B does not re-implement. Phase B's admin partner table simply reads the current status; it does not need to provide a "Mark active" action separate from "Suspend/Reactivate."
3. **Dashboard stub folded** into real navigation cards (Submission history for all; Admin for admins). Done in Phase A.
4. **Partner actions in Phase B = exactly three:** Invite (new partner email → `inviteUserByEmail` + partners row insert via service-role), Suspend / Reactivate (toggle `partners.status` between `'active'` and `'suspended'`), Resend Invite (re-trigger the invite email; only visible for rows still at `status='invited'`). No edit-profile, no delete, no role-flip in Phase B.

#### Confirmed guards (must be enforced in the Phase B Server Actions)

- **Self-suspend block.** A suspended admin loses admin privileges immediately (`is_admin()` requires `status='active'`), which can lock the org out if the *only* active admin suspends themselves. The Suspend action MUST refuse when `targetId === auth.uid()`.
- **Last-active-admin block.** The Suspend action MUST refuse if the target is the last partner with `role='admin' AND status='active'`. Run the count inside the same Server Action with the service-role client.
- **Resend Invite hidden for non-invited rows.** Only render the button when `row.status === 'invited'`. The Server Action should also re-check and refuse if status has changed between page render and submit (TOCTOU).

#### Brief-vs-reality deltas discovered during scoping

These bit us during Phase A planning; surfacing them so Phase B doesn't re-trip:

1. **No migrations needed.** `partners.status` with CHECK `('active','invited','suspended')` is already in `supabase/migrations/20260515193702_initial_schema.sql:34-35` since the project's first migration. No new column, no new policy.
2. **`submissions.recommendation jsonb` does not exist and should NOT be added.** Earlier Step 9 drafts assumed a denormalised JSON column for the recommendation payload. The current schema stores the recommendation as the normalised columns `recommended_product_id`, `recommended_units`, `total_list_price_usd`, `total_partner_price_usd` (initial schema lines 114-117) — Phase B's submission detail page reads from those + a join to `products`, not from a JSON blob.
3. **`pipedrive_deal_id` is already in the initial schema** (line 119). Step 8 discovered this the hard way (duplicate `alter table` error in CI). Phase B's submission detail page can read it directly.
4. **The proxy file is `src/proxy.ts`, not `src/middleware.ts`** (Next 16 convention; see ADR [0009](./decisions/0009-proxy-replaces-middleware-next16.md)). Reusable session logic lives at `src/lib/supabase/proxy.ts`. Phase B does NOT touch either file.
5. **`is_admin()` already requires `status='active'`** (initial schema lines 131-145). So a suspended admin automatically loses admin RLS privileges — no Phase B work needed to keep them out of admin tables. The layout gate handles UX; RLS handles enforcement.
6. **RLS already grants admin SELECT on partners + submissions.** The `partners_select_self_or_admin` policy (lines 172-175) and the analogous submissions policy admit `is_admin(auth.uid())`. Phase B's `/admin/partners` and `/admin/submissions` pages can use the regular user-scoped client for reads; service-role is only needed for writes that bypass RLS (Invite, Suspend, Reactivate, Resend Invite) and for any read where we deliberately want to ignore RLS.
7. **The PDF route at `src/app/(app)/api/submissions/[id]/pdf/route.ts` is already admin-accessible via existing RLS.** Because the submission-select policy admits admins, an admin hitting an arbitrary submission's PDF URL succeeds. Phase B's admin submission detail page can link to the existing PDF route directly — no separate admin handler needed.

#### Phase B file-by-file task list

```
src/app/(app)/admin/layout.tsx                  NEW  — admin-only shell: defensive is_admin() re-check; side-nav (Partners / Submissions / back to Dashboard)
src/app/(app)/admin/page.tsx                    NEW  — admin landing: KPI cards (partner counts by status, recent submissions) + quick links
src/app/(app)/admin/partners/page.tsx           NEW  — table of all partners (company, contact, email, role, status, created_at). Row actions: Suspend/Reactivate, Resend Invite (if invited). "Invite partner" CTA → /admin/partners/new
src/app/(app)/admin/partners/actions.ts         NEW  — Server Actions: invitePartner({ email, name, company }), suspendPartner(id), reactivatePartner(id), resendInvite(id). All use createSupabaseAdminClient(). Self-suspend + last-active-admin guards live here.
src/app/(app)/admin/partners/new/page.tsx       NEW  — invite form (email, contact_name, company_name). On submit: invitePartner() → supabase.auth.admin.inviteUserByEmail() + partners row insert with status='invited' role='partner'. Use headers().get('origin') for the redirect (mirror src/app/(auth)/forgot-password/actions.ts:23-30).
src/app/(app)/admin/submissions/page.tsx        NEW  — table of ALL submissions across partners (joined to partners.company_name). Filterable by partner. Rows link to /admin/submissions/[id].
src/app/(app)/admin/submissions/[id]/page.tsx   NEW  — read-only submission detail: project name, partner, calculator inputs, recommended product + units, total prices, pipedrive_deal_id (linkified to Pipedrive if non-null), Download PDF (re-uses /api/submissions/[id]/pdf).
src/app/(app)/submissions/page.tsx              NEW  — partner-facing list of THEIR own submissions (RLS already enforces). Same row layout as admin list minus the partner column.
src/app/(app)/submissions/[id]/page.tsx         NEW  — partner-facing submission detail. Same content as admin detail, no admin-only metadata.
scripts/test-rls.ts                             EDIT — extend the existing RLS verification harness to cover: suspended-partner read denial, admin cross-partner reads, invited-partner read (no admin), and the new admin write paths.
docs/decisions/0023-*.md                        NEW  — ADR covering the partner-management action surface (Invite + Suspend/Reactivate + Resend Invite; explicit non-features: no delete, no role flip).
docs/decisions/0024-*.md                        NEW  — ADR covering the partner-facing submission history routes (path scheme, RLS-only enforcement, mirror of admin detail).
docs/JOURNAL.md                                 EDIT — Phase B entry at top with a short walkthrough of the admin partners flow.
```

Out-of-scope reminders that should NOT silently creep back into Phase B:

- No edits to `src/proxy.ts` or `src/lib/supabase/proxy.ts`. The gate is in the layout by deliberate design.
- No new RLS policies. Existing policies cover every Phase B read path; service-role covers every Phase B write path.
- No new migrations. Every column is already in place.
- No customisation of the Supabase invite email. Default template is acceptable for Phase 1; revisit when the marketing site lands.
- Pipedrive integration is not touched in Phase B. Submission rows already carry `pipedrive_deal_id` from Step 8; admin detail just links out.

#### Definition of done for Phase B

- Admin can invite a new partner from `/admin/partners/new`; partner receives the Supabase invite email; first sign-in lands them on `/dashboard` with status auto-flipped to `'active'`.
- Admin can suspend any partner *except themselves and except the last active admin*; suspended partner is bounced to `/login?error=suspended` on their next request.
- Admin can reactivate any suspended partner.
- Admin can resend the invite to any partner still at `'invited'`.
- Partner sees `/submissions` and `/submissions/[id]` for their own rows. No cross-partner reads possible (verified by `scripts/test-rls.ts`).
- Admin sees `/admin/partners` and `/admin/submissions` lists, can drill into either.
- `npm run build` clean. `npm run lint` clean. `tsx --test` clean. `scripts/test-rls.ts` clean.

---

## 2026-05-19 — UI polish: widen app shell max-width from 1024 to 1280

### Work done

- `src/app/(app)/layout.tsx` line 50: `max-w-5xl` → `max-w-7xl` on `<main>` (1024 → 1280px). The 1024px cap squeezed the calculator's 3 KPI cards + bar charts on wide screens and forced needless vertical scroll. Dashboard at 1280px still reads cleanly. Header bar at line 24 stays `max-w-5xl` — the asymmetry is intentional, keeps the top nav compact while letting page content breathe.
- Verified with `npm run build` — clean. No other layout changes needed.
- Lands as its own commit before Step 9 (Admin) so the admin pages inherit the wider shell from day one.

---

## 2026-05-19 — Step 8 follow-up: populate admin-curated Pipedrive deal fields

### Work done

First production smoke test confirmed the Deal was created in the right pipeline/stage with the partner's Person + Org and the six `arxys_*` custom fields populated. But the admin-curated calculator fields that already existed in Pipedrive — `Project Name`, `VMS`, `Camera Streams`, `Recording`, `Motion Activity Est. %`, `Frame Rate`, `Resolution`, `Retention Days`, `CODEC`, `Total Storage`, `Scene Complexity`, `Recording hours`, `Recommended Server` — were all empty (screenshot from Andy). The Step 8 brief had locked the field set to only the six `arxys_*` fields, but the real Pipedrive tenant has a richer schema that the calculator inputs map onto directly. This entry adds that mapping.

- **Hit `GET /v1/dealFields`** on the live Pipedrive tenant (via `curl` + the local `PIPEDRIVE_API_TOKEN`) to enumerate every existing deal field. Captured names, hashed keys, field types, and option IDs for the enum/set fields. The screenshot confirmed which ones the calculator should fill.
- **`src/lib/pipedrive/lookups.ts` — added `resolveCalculatorFieldKeys()`** that reads `/dealFields` and returns a `Partial<Record<CalculatorFieldName, key>>`. Missing fields are logged via `console.warn` but do not throw — a Pipedrive admin renaming a single field shouldn't block the rest of the deal from saving. Refactored the dealFields fetch into a shared `getDealFieldsCached()` so this lookup and `ensureCustomFields()` share one HTTP call. `__resetLookupCache` extended to clear the new cache slots.
- **`src/lib/pipedrive/deal.ts` — extended the input contract** with `vms`, `retentionDays`, and a `primaryGroup` object carrying `resolutionLabel`, `codec`, `complexity`, `fps`, `recordingPercent`, `motionPercent`. Added three option-ID maps (`VMS_OPTION_IDS`, `CODEC_OPTION_IDS`, `COMPLEXITY_OPTION_IDS`) keyed by the calculator's string values; values are the Pipedrive option IDs captured from the live tenant. Added the Recording-mode heuristic (recordingPercent ≥ 100 → "24 Hour Continuous" id 118, else "Record Only On Motion" id 119). Added the recording-hours derivation (`round(recordingPercent / 100 * 24)`). `Total Storage` formatted as `"X.XX TB"` (matches the calculator's storage_tb column and reads better than raw GB for humans). `Recommended Server` mirrors `arxys_recommended_models` (`"N × MODEL"`).
- **`src/app/(app)/calculator/actions.ts`** — pass `vms`, `retentionDays`, and the primary-group characteristics (resolution label / codec / complexity tier / fps / recording% / motion%) from the existing `primary` variable into `createDealFromSubmission`.
- **`src/lib/pipedrive/deal.test.ts`** — three new cases:
  - Calculator fields are populated with mapped option IDs (`VMS=14` for Milestone, `Recording=118` for 100% continuous, `CODEC=139` for h265, `Scene Complexity=288` for medium) and string values (`Resolution="4MP (2560×1440)"`, `Total Storage="1500.00 TB"`, `Recording hours="24"`).
  - `recordingPercent=50` flips `Recording` to `119` and `Recording hours` to `"12"`.
  - When `/dealFields` doesn't expose the calculator field names (rename or admin tenant without them), the deal still saves with the arxys_* fields populated and the calculator-field keys absent from the payload.
- Fixture data updated to include the new required `vms`, `retentionDays`, and `primaryGroup` inputs.
- Test count: 19/19 (previously 16). Build + lint clean.

### Detours & fixes

- **The Step 8 brief was scoped too narrowly.** It locked the deal-field set to six `arxys_*` fields invented for the portal; the real Pipedrive tenant already had ~30 admin-curated fields that the calculator inputs map onto. Symptom: deal created successfully, every form field empty in the screenshot. Root cause: brief assumption rather than a code bug. Resolution: extend the deal builder with a separate `resolveCalculatorFieldKeys` path that reads (but never creates) the admin-curated fields, and populate them. The `arxys_*` fields are still useful — they encode the canonical/numeric values (camera count, bandwidth Mbps, storage GB) without going through Pipedrive's varchar formatting.
- **Set vs. enum vs. varchar matters at write time.** The calculator-matching Pipedrive fields are a mix: `VMS` and `Scene Complexity` are *sets* (option IDs, comma-separated string for multi-select), `Recording`, `CODEC`, `Failover Recorder` are *enums* (single option ID), `Frame Rate`, `Motion Activity Est. %`, `Retention Days`, `Total Storage`, `Recording hours`, `Resolution` are *varchar* (free text). Wrote each value in the type Pipedrive expects — option ID number for enums/sets, string for varchars. Captured the option-ID maps in `deal.ts` so a rename in Pipedrive surfaces as a missing-key skip rather than a silent wrong-ID write.
- **Three fields can't be populated yet.** `VMS Edition`, `Vms Key Features`, and `Failover Recorder` are admin-curated Pipedrive fields with no matching calculator input. Left them blank for now; if/when the calculator grows these inputs, the mapping is a one-line addition each.
- **Hanwha → Wisenet mapping.** Calculator's `VMS_OPTIONS` includes "Hanwha"; Pipedrive's VMS set has "Wisenet" (Hanwha's security-product brand). Mapped Hanwha → Wisenet option id 169. Logged here for traceability.

### Pending

- Smoke test post-redeploy: save a new calculation, confirm all visible Pipedrive fields are now populated (not just the `arxys_*` ones). Expected populated fields on a typical submission: `Project Name`, `VMS`, `Camera Streams`, `Recording`, `Motion Activity Est. %`, `Frame Rate`, `Resolution`, `Retention Days`, `CODEC`, `Total Storage`, `Scene Complexity`, `Recording hours`, `Recommended Server`.

---

## 2026-05-19 — Step 8: Pipedrive Deal creation per submission

### Work done

- **New module tree** under `src/lib/pipedrive/`:
  - `client.ts` — thin fetch wrapper around `https://api.pipedrive.com/v1/...`, `api_token` appended from `env.PIPEDRIVE_API_TOKEN`. Typed methods for the 10 endpoints Step 8 touches (`getPipelines`, `getStages`, `searchUsers`, `searchPersons`, `searchOrganizations`, `createPerson`, `createOrganization`, `getDealFields`, `createDealField`, `createDeal`, `createNote`). All paths return parsed `data` or throw a typed `PipedriveError` carrying status + `error_info` so callers can log without re-parsing.
  - `lookups.ts` — `resolvePipelineId`, `resolveStageId`, `resolveOwnerId`, `ensureCustomFields`. Module-level promise cache: each lookup runs once per process and subsequent calls are free. `resolveOwnerId` honors `PIPEDRIVE_DEAL_OWNER_ID` as an optional override before the name lookup. `ensureCustomFields` reads `/dealFields`, finds the six `arxys_*` fields by `name`, creates any that are missing, returns a `{ friendly_name: hashed_key }` map (the hashed key is what `createDeal` requires when writing custom values).
  - `contacts.ts` — `upsertPerson({ name, email, orgId? })` and `upsertOrganization({ name })`. Search-by-email / search-by-name first; create if no hit. Idempotent — re-running a submission for the same partner returns the same IDs.
  - `deal.ts` — `createDealFromSubmission(submission, recommendation, partner)`. Resolves pipeline + stage + owner + custom-field keys in parallel (cached), upserts org then person, builds the payload (`value=0`, currency USD, six custom fields keyed by their hashed keys, title falls back to `${company} — submission ${id}` when project name is blank), posts the deal, and pins a placeholder note explaining the $0 value (ADR 0019). Returns `{ dealId }`. Note-creation failure is logged but does not invalidate the deal.
- **No migration needed.** `submissions.pipedrive_deal_id bigint` is already in `20260515193702_initial_schema.sql` at line 119. Discovered this on `supabase db push` when the duplicate `alter table` errored with `column "pipedrive_deal_id" of relation "submissions" already exists`. Deleted the redundant migration file; the column already exists on the cloud DB and locally. No RLS change required; per-partner RLS already gates the row.
- **Server Action wire-up** in `src/app/(app)/calculator/actions.ts` — after `sendSubmissionNotification(...)` returns, call `createDealFromSubmission(...)` inside its own `try/catch`. On success: `UPDATE submissions SET pipedrive_deal_id = ?`. On failure: `console.error("pipedrive deal creation failed", { submissionId, error })`. Submission success is already committed to the client at this point; a Pipedrive outage cannot regress the persist/PDF/email path.
- **Test** `src/lib/pipedrive/deal.test.ts` — 7 cases, all mocking `globalThis.fetch`:
  - Deal payload has `title`, `value=0`, `currency=USD`, resolved `pipeline_id`/`stage_id`/`user_id`/`person_id`/`org_id`, and all six custom-field hashed keys mapped to the right values.
  - Title falls back to `${company} — submission ${id}` when `projectName` is null.
  - A pinned `/v1/notes` POST follows the deal create with the Phase 1 placeholder text + ADR 0019 reference.
  - Pipeline / stage / owner / dealFields lookups fire exactly once across two `createDealFromSubmission` invocations (cache works).
  - When `/persons/search` and `/organizations/search` hit, no create POSTs are issued.
  - When they miss, `/persons` + `/organizations` are POSTed with the expected name/email/org_id.
  - When `/dealFields` returns only a subset, the missing ones are created and their returned hashed keys appear in the final deal payload.
- **Docs** — ADR [`0020-pipedrive-deal-creation-on-submission.md`](./decisions/0020-pipedrive-deal-creation-on-submission.md). RUNBOOK unchanged (no new env var; `PIPEDRIVE_API_TOKEN` already in `REQUIRED_VARS`).
- **Verification** — `npm test` 16/16, `npm run lint` clean, `npm run build` clean (Turbopack, 6.1s compile + 4.0s TS, 10 static pages).

### Detours & fixes

- **Vercel had `PIPEDRIVE_API_KEY`, not `PIPEDRIVE_API_TOKEN`.** First production smoke test: email + PDF arrived, no Pipedrive deal created. `vercel logs --json` on the production deployment showed the caught error: `Error: Missing required environment variable: PIPEDRIVE_API_TOKEN` — the lazy `env.ts` getter threw, the defensive `try/catch` in `submitCalculation` ate it (correct behaviour), submission + email succeeded but no deal. Root cause: Vercel had `PIPEDRIVE_API_KEY` set (orphaned from a Phase 1 scaffold attempt — referenced only in the Phase 2 proposal doc, not in any current code); `.env.local` and `env.ts`'s `REQUIRED_VARS` both use the canonical name `PIPEDRIVE_API_TOKEN`. The handoff brief's assumption that `PIPEDRIVE_API_TOKEN` was already in Vercel production was wrong. Same shape of bug as Step 5's "SMTP vars missing from Vercel" (logged 2026-05-19). Fix: `vercel env add PIPEDRIVE_API_TOKEN production --sensitive` with the value from `.env.local`, `vercel redeploy <prod-url>` so the new env reaches the running deployment. Left the stale `PIPEDRIVE_API_KEY` in place at user request (orphan, no current consumer; Phase 2 will use `PIPEDRIVE_API_TOKEN` too).
- **The `pipedrive_deal_id` column was already in the initial schema.** Wrote a fresh migration per the brief, ran `supabase db push`, hit `ERROR: column "pipedrive_deal_id" of relation "submissions" already exists`. Confirmed via grep: `20260515193702_initial_schema.sql:119` already declares `pipedrive_deal_id bigint`. Deleted `20260519224318_step8_submissions_pipedrive_deal_id.sql`. No schema change needed for Step 8; the column has been in place since the project's first migration. Worth noting because the Step 8 brief explicitly called for a new migration, which would have been a hard error in CI if the duplicate had landed.
- **Linking the cloud project after the iCloud → ~/Developer move.** `supabase/.temp/` only carried `cli-latest` from the clone; the project ref was not preserved. `supabase db push` failed with `Cannot find project ref. Have you run supabase link?`. Re-linked via `supabase link --project-ref ddqnpwpouvkgivvbjpju --password '…'`, extracting the ref from `NEXT_PUBLIC_SUPABASE_URL`. This is a one-time chore in the new working copy and only matters until the link is cached.
- **`import "server-only"` blocks the test.** Initial draft followed the brief's "(same pattern as the email transport)" and put `import "server-only"` on all four pipedrive modules. The deal test imports `deal.ts` directly, which fails under `tsx --test` with `Cannot find module 'server-only'` — the marker package is not a direct dependency of the repo (Next.js carries its own compiled copy at `node_modules/next/dist/compiled/server-only/` and the bundler aliases the bare import internally). First workaround attempt: pass `--conditions=react-server` so Node resolves to the empty stub. That broke the existing PDF test because `@react-pdf/renderer` exposes a different (less complete) entry under the `react-server` condition (`Cannot read properties of undefined (reading 'S')`). Settled on dropping the marker from the four pipedrive modules entirely. Server-side enforcement comes indirectly from `env.PIPEDRIVE_API_TOKEN` being non-`NEXT_PUBLIC` — a client component that tried to use the pipedrive client would throw at the env read. Documented this tradeoff in `client.ts`'s header comment and in ADR 0020's "Negative" consequences.
- **Pipedrive Deals don't have a description field.** The brief said "Deal description: include a one-line note…". Initial draft tried to bundle the note into the deal `title` in a parenthetical; that's ugly and visible everywhere the title appears (lists, notifications, Slack integrations). Replaced with a separate `POST /v1/notes` after `createDeal`, with `pinned_to_deal_flag: 1` and `deal_id` set. Note-creation failure is caught + logged so it cannot fail the deal write that already succeeded.
- **Storage in GB has fractional precision.** Bandwidth and storage totals from the calculator have many decimals (e.g. `1500000.789`). Trimmed both to 2 decimals before sending to the custom fields — Pipedrive accepts arbitrary precision but `1500000.79` reads more clearly to a human browsing the deal.

### Decisions captured

- [`0020-pipedrive-deal-creation-on-submission.md`](./decisions/0020-pipedrive-deal-creation-on-submission.md) — synchronous Pipedrive write in the Server Action, defensive catch, runtime name → ID resolution with module-level cache, $0 Deal value + pinned placeholder note pending Phase 2.

### Pending

- End-to-end smoke test on Vercel production: save a calculation, confirm a new Deal lands in `Project Pipeline → New Lead`, owned by Andy, with the partner's Person + Organization linked, all six custom fields populated, value $0, pinned note visible. Verify `submissions.pipedrive_deal_id` is non-null afterwards.
- Negative smoke test: temporarily set `PIPEDRIVE_DEAL_OWNER_ID` to a clearly-invalid value (e.g. `99999999`) in Vercel, save another submission, confirm the partner still sees a success response and `pipedrive_deal_id` remains `NULL`.

---

## 2026-05-19 — Planned: Step 8 (Pipedrive Deal creation) — scope locked

### Work done

Locked the inputs for the upcoming Step 8 implementation session. No code yet; values recorded here so they survive any session-compaction or context switch:

- **Trigger:** every successful `submitCalculation` Server Action call creates a Pipedrive Deal after the existing sales + partner emails go out. Pipedrive failure must not block the submission, the emails, or the PDF download — same defensive pattern Steps 6+7 used for PDF.
- **Pipedrive target:**
  - Pipeline: **"Project Pipeline"** (resolved at runtime by name → ID lookup against `GET /v1/pipelines`)
  - Initial stage: **"New Lead"** (resolved at runtime by name → ID against `GET /v1/stages?pipeline_id=N`)
  - Owner: **"Andy Newbom"** (resolved at runtime via `GET /v1/users?term=Andy+Newbom`, cached; failure surfaces a clear error suggesting a `PIPEDRIVE_DEAL_OWNER_ID` env override)
- **Custom fields:** implementation session creates them on first run if absent (idempotent — check by `key` then create). Fields:
  - `arxys_submission_id` (varchar)
  - `arxys_total_cameras` (double)
  - `arxys_bandwidth_mbps` (double)
  - `arxys_storage_gb` (double)
  - `arxys_recommended_models` (varchar, e.g. "3 × V800")
  - `arxys_portal_url` (varchar, URL back to portal — placeholder route for now, e.g. `https://portal-arxys.vercel.app/dashboard`)
- **Field mapping (confirmed):**

  | Submission field | Pipedrive Deal field |
  |---|---|
  | Project name | Deal title |
  | (placeholder $0 — real pricing in Phase 2 per ADR 0019) | Deal value |
  | Partner contact email | Person (lookup by email; create if missing) |
  | Partner company | Organization (lookup by name; create if missing) |
  | Submission ID | Custom `arxys_submission_id` |
  | Total cameras | Custom `arxys_total_cameras` |
  | Total bandwidth Mbps | Custom `arxys_bandwidth_mbps` |
  | Total storage GB | Custom `arxys_storage_gb` |
  | Recommended models | Custom `arxys_recommended_models` |
  | Link to submission | Custom `arxys_portal_url` |

- **Phase 1 placeholder rule (per ADR 0019):** Deal value = 0, with a `[Phase 1 placeholder — pricing in Phase 2]` note added to the Deal description so internal users browsing Pipedrive see the gap explicitly.
- **Scope reaffirmed:** next session is **Step 8 only**. Step 9 (Admin) is a separate future session. Step 10 (real pricing) is removed from Phase 1, replaced by the Phase 2 Pricing Pipeline project (`docs/proposals/phase-2-pricing-pipeline.md`).

### Decisions captured

- ADRs to author at Step 8 implementation:
  - `0020-pipedrive-deal-creation-on-submission.md` — Pipedrive Deal trigger, defensive failure path, runtime lookups (pipeline/stage/owner/custom-field IDs) over hardcoded constants.

---

## 2026-05-19 — Planned: defer real pricing to Phase 2; Phase 1 uses placeholders

### Work done

- Inspected the actual VideoX MSRP price list (43 SKUs across 12 product families, storage-tier-specific SKUs). Discovered that real pricing forces a schema rewrite, an algorithm rewrite (SKU-level recommendation), and depends on data work that is not yet done.
- Read Andy's Pricing Pipeline planning doc (Google Sheet → Pipedrive → Supabase → Portal, with its own Phase 0/1/2/3) and saved it verbatim at [`docs/proposals/phase-2-pricing-pipeline.md`](./proposals/phase-2-pricing-pipeline.md). Outstanding reconciliation questions captured at the bottom of that file (count mismatch, V255/V270 group assignment, schema collision with existing `products`, etc.).
- **Scope decision:** Portal Phase 1 will not implement real pricing. The originally-planned Portal Step 10 is dropped. Placeholders are used everywhere until Phase 2 (the Pricing Pipeline project) replaces them.
  - `products.list_price_usd` placeholders (1..6) from Step 5 stay as-is.
  - Calculator, PDF, and email show "Pricing TBD" or equivalent text in any price field.
  - Pipedrive Deal creation (Portal Step 8) omits the `value` field or sets it to 0, with a placeholder note.
- Captured the rationale in [`decisions/0019-defer-real-pricing-to-phase-2.md`](./decisions/0019-defer-real-pricing-to-phase-2.md).
- Revised Portal Phase 1 remaining work: Step 8 (Pipedrive Deals, no real pricing) → Step 9 (Admin) → Step 11 (pre-launch checklist). Step 10 deferred to Phase 2.

### Detours & fixes

- **Sandbox blocked reading the xlsx from `~/Library/CloudStorage/Dropbox/`.** macOS TCC denies terminal access to Dropbox-managed paths. Worked around by asking Andy to `cp` the file to `~/Desktop/` where shell access is unrestricted. The price list itself was set aside after reading — it's being retired in favor of the Master Google Sheet (Pricing Pipeline Phase 0).
- **First scope cut was too narrow.** Initially proposed combining Steps 8+10 (Pipedrive + Pricing) as a single 4–6 hour session. The price-list inspection revealed Step 10 alone was 6–8 hours and would force schema + algorithm changes; bundling it with Step 8 became infeasible. The Phase 2 deferral resolves this cleanly.

### Decisions captured

- [`0019-defer-real-pricing-to-phase-2.md`](./decisions/0019-defer-real-pricing-to-phase-2.md) — real pricing moves to the Pricing Pipeline project; Phase 1 uses placeholders.

---

## 2026-05-19 — Ops: moved repo out of iCloud Documents to ~/Developer/

### Work done

- Relocated the working copy from `~/Documents/Documents - Andy’s Gold Mac/ARXYS/Arxys Portal/` to `~/Developer/Arxys Portal/`. Clone-fresh approach (not `mv` or `cp -R`) so no iCloud-specific metadata follows.
- Procedure: ran `/tmp/move-portal-to-developer.sh` (saved in case of repeat). Pre-flight required clean working tree + `local main == origin/main`. Script: cloned from `git@github.com-arxys:Arxys-Projects/Portal.git`, copied `.env.local`, ran `vercel link --yes --project=portal`, `npm ci`, `npm run build`. Old folder left intact for rollback.
- Updated RUNBOOK §1 to direct future clones into `~/Developer/` and to call out the iCloud penalty explicitly so the lesson doesn't have to be re-learned.
- The U+2019 curly-apostrophe note from the previous JOURNAL entry is now obsolete for any working-copy path under the new location (`~/Developer/Arxys Portal/` has no special characters). The previous entry stays in the JOURNAL as history; the in-memory note in `~/.claude/projects/-Users-andynewbom/memory/MEMORY.md` has been superseded.

### Detours & fixes

- **Why this was triggered.** Step 6+7's implementation session reported `npm run build` and `tsc --noEmit` "wedged at 0% CPU on iCloud Documents I/O" and had to push to Vercel CI to get an authoritative build. That CI run caught a TypeScript error (`9b6c032` — `cast SubmissionPdf element to DocumentProps for renderToBuffer`) that should have been a local 3-second check. The penalty was no longer "build is slow" — it was "build doesn't run." Time to leave iCloud.
- **Measured improvement.** Same code, same machine, just a different path: post-move `npm ci` = 9s, `npm run build` (turbopack) = 6.5s total (3.7s compile + 2.6s typecheck + 0.17s static gen). Prior iCloud-folder runs hung indefinitely.
- **Pre-flight catch.** Script's `local main == origin/main` check forced verification that the other chat's commits (`cd14c28` then `9b6c032`) had all reached origin before the move. Without that check the move would silently take a stale snapshot.
- **`git ls-files --others -i --exclude-standard` output exploded.** The pre-flight prints gitignored files for visibility; with `node_modules` populated this is tens of thousands of lines. Cosmetic, not a functional issue, but worth noting for anyone re-using the script — pipe through `head` if you want to skim.

### Decisions captured

- No new ADR. This is an environmental move, not an architectural decision; the rationale lives in this JOURNAL entry and in the RUNBOOK §1 caveat.

---

## 2026-05-19 — Note: repo path uses U+2019, not ASCII apostrophe

### Work done

- Caught a recurring error in the handoff briefs: the working-directory path was being written as `Andy's Gold Mac` (ASCII `'`) when the actual folder is `Andy’s Gold Mac` (U+2019, RIGHT SINGLE QUOTATION MARK, UTF-8 `0xE2 0x80 0x99`). Verified via `pwd | od -c`.
- Effect of the typo: `cd "/Users/andynewbom/Documents/Documents - Andy's Gold Mac/..."` silently fails (no such directory), then a fresh session burns time looking for the folder via `find` or `ls`.
- Future briefs and any shell snippets shared with fresh sessions must use the curly `’`. Copy-paste from this JOURNAL entry or from the file path in your terminal — do not retype.

---

## 2026-05-19 — Steps 6 + 7: submission PDF + partner-facing email

### Work done

- **PDF module** under `src/lib/pdf/`:
  - `colors.ts` — palette constants (Arxys gold, cameras blue, bandwidth cyan, storage green, slate/muted text, light bg/border, note bg/border/text). Mirrors the legacy WordPress mailer hex values; one source of truth, no hardcoded hexes inside the renderer.
  - `types.ts` — `SubmissionPdfInput` view model. Pure data shape; the renderer never sees Supabase or the legacy schema.
  - `SubmissionPdf.tsx` — `@react-pdf/renderer` `Document` rendering the eight sections from the legacy `arxys_build_pdf_html()` (gold-bar header, title, 3-up summary boxes, Project Information table, Camera Details table, Recommended Hardware box, 20%-overhead note, footer). US Letter portrait, 50px margins / 80px bottom, default Helvetica font (no font registration — keeps the bundle small).
  - `render.ts` — `renderSubmissionPdfBuffer(input)` returns a `Buffer` via `renderToBuffer`; `pdfFilename(input)` produces `Arxys-Report-YYYY-MM-DD-<submissionId>.pdf`; `loadSubmissionPdfInput(submissionId, supabase)` assembles the view model from a persisted row + partners + products + server_specs joins (used by the Route Handler).
- **Route Handler** `src/app/(app)/api/submissions/[id]/pdf/route.ts` — GET-only, `runtime = 'nodejs'` (React-PDF needs Node builtins), Supabase SSR auth; RLS on `submissions` does the per-partner authorization implicitly. Returns the PDF with `Content-Disposition: attachment` and `Cache-Control: private, no-store`.
- **Email sender** `src/lib/email/submission-notification.ts` — accepts optional `pdfBuffer + pdfFilename` (attached to both messages when present) and optional `partnerEmail`. Sales message keeps the Step-5 plain-text body. Partner message gets a partner-friendly subject ("Your Arxys Video Storage Report") and a short partner-framed body. Both preserve ADR 0015's BCC-to-`SMTP_USER`. Partner-send failure is caught and logged so it cannot regress the sales-send path.
- **Server Action** `src/app/(app)/calculator/actions.ts` — server_specs query now also pulls `products.name` and `products.description`. After `recommend()` runs, the action builds the `SubmissionPdfInput` from in-memory data (no re-query of the row it just inserted), renders the PDF in a `try/catch` (render failure → `pdfBuffer` stays undefined and the sales email goes out without an attachment, submission still persists), and passes `pdfBuffer + pdfFilename + partnerEmail` to `sendSubmissionNotification`.
- **Calculator UI** — `RecommendationPanel` in `calculator-form.tsx` gets a `Download PDF` anchor (`href` to the new Route Handler, `download` attribute, opens the file with the partner-branded filename). Styled via a new `.ax-pdf-btn` rule in `calculator.css`, scoped under `#arxys-calc-root`.
- **Test** `src/lib/pdf/render.test.ts` — golden case asserts the renderer produces a non-empty buffer beginning with the `%PDF-` magic header. Imports `SubmissionPdf` + `@react-pdf/renderer` directly to dodge the `import "server-only"` marker on `render.ts` (the marker is intentional for the production path; the test exercises the same composition without it). Runs in ~210ms; all nine tests (eight existing recommend + one new PDF) pass under `tsx --test`.

### Detours & fixes

- **`@react-pdf/renderer` was already installed.** ADR 0014 mentioned it was in `package.json` but unused — confirmed at `^4.5.1` with the lockfile committed. No new install needed; brief Step 1 was a no-op.
- **Brief said "iterate `RecommendationResult.units[]`".** Wrong shape. `RecommendationResult.winner` is a single `RecommendationCandidate` (one model + N units), not a list of different models. The PDF's Recommended Hardware section is one line: `<winner.units> x <product description>` + capacity sub-line. Warnings render as additional yellow note boxes below the recommend box.
- **No `failover` column on `submissions`.** Confirmed in the schema (and noted in the previous JOURNAL entry's known mismatches). Omitted that row from the PDF Project Information section per the brief.
- **`daily_ingest` column also absent, but the value is derivable.** Computed as `totals.storageGb / retentionDays` at render time and surfaced in the Project Information section to preserve parity with the legacy report.
- **`server-only` blocks the test runner.** `render.ts` uses `import "server-only"`, which throws under plain Node. The test was rewritten to import `SubmissionPdf.tsx` + `renderToBuffer` directly — exercises the same composition `renderSubmissionPdfBuffer` does, without the marker. The marker stays on the production module to fail fast if anyone tries to bundle the renderer into a client component.
- **Product description sourcing.** Legacy PHP used `server['description']`. The portal's `products` table has both `name` ("VideoX V200 1U 4Bay Rack") and `description` ("V5 NVR Server — …"). The PDF shows `name — description` when both exist, falling back to `name`, then `modelCode`. Same logic in the action (in-memory) and the route handler (from the persisted row).

### Decisions captured

- [`0016-pdf-library-react-pdf.md`](./decisions/0016-pdf-library-react-pdf.md) — `@react-pdf/renderer` over Puppeteer/pdf-lib (Vercel-friendly, JSX maintainability, no Chrome dependency).
- [`0017-pdf-no-storage.md`](./decisions/0017-pdf-no-storage.md) — render on every read; no Supabase Storage, no `pdf_path` column.
- [`0018-partner-email-on-submission.md`](./decisions/0018-partner-email-on-submission.md) — partner now receives their own copy of the report via a separate sendMail call; supersedes ADR 0014. ADR 0014 status updated to "Superseded by 0018".

### Pending

- End-to-end smoke test on Vercel production: save a calculation, confirm both sales and partner mailboxes receive the email with the attached PDF, confirm the Download PDF button returns a valid file.

---

## 2026-05-19 — Planned: Steps 6 + 7 combined (PDF + partner email)

### Work done

- Decided to combine Steps 6 (PDF) and 7 (email) into a single implementation session. Rationale: both modify the same Server Action (`submitCalculation`), the same email sender (`submission-notification.ts`), and consume the same artifact (the PDF buffer). Splitting them would create duplicate plumbing across two sessions for no benefit.
- Step 7 scope confirmed narrow: **partner-facing email only**. The partner who saved the submission receives the same PDF the sales group already gets (per Step 5). No unsubscribe management, no email service migration, no customer end-user email. Email preferences and CAN-SPAM compliance are deferred to a later step if/when needed.
- The combined session adds one ADR beyond the original Step 6 set: `0018-partner-email-template.md` (Context: partner now gets a copy; Options: identical body to sales / partner-friendlier wording; Decision: TBD by implementation).

---

## 2026-05-19 — Planned: Step 6 (PDF generation) — scope locked

### Work done

- Confirmed Step 6 in the Phase 1 plan (kickoff entry, 2026-05-14) is **PDF generation**. Eleven-step plan ordering: scaffold → schema → auth → calculator integration → API route → **PDF** → email → Pipedrive → admin → pricing → pre-launch.
- Decisions locked for the implementation session:
  - **Audience:** both partner + sales. Same PDF, two delivery channels — a Download button on `/calculator` after submit, and an attachment on the existing internal sales notification email.
  - **Content:** mirror what `reference/arxys-calculator-mailer-FINAL.php`'s `arxys_build_pdf_html()` produced. Sections in order: gold-bar header, title, 3-up summary boxes (cameras / bandwidth / storage), Project Information table, Camera Details table (per-group), Recommended Hardware box, 20%-overhead note, footer.
  - **Library:** `@react-pdf/renderer`. JSX-based, runs in Node/Vercel without headless Chrome.
  - **Storage:** none. Generate on-demand. Partner click re-renders from the live submission row. Email attachment generated in-memory at notification time. `submissions` schema **does not** get a `pdf_path` column.
- Reference PHP confirmed on disk at `reference/arxys-calculator-mailer-FINAL.php` (709 lines; PDF html builder at lines 209–308; uses Dompdf 3.1.5 on the legacy WordPress side).
- Two known mismatches between the legacy PDF and the current submission schema that the implementation session will need to handle:
  1. The legacy PDF shows `failover` and `daily ingest` per-row. Current Step-2 schema does not have a failover field. Either drop those fields from the new PDF, or surface them from the form if they exist there but aren't persisted yet.
  2. Legacy "Recommended Hardware" assumed a single model row (`N x [server description]`). Step 5's recommendation can return multiple units of different models. The new PDF must iterate the `RecommendationResult.units[]` and may render multiple rows or a single combined row — implementation choice.

### Decisions captured

- ADRs to author at implementation time:
  - `0016-pdf-library-react-pdf.md` — why `@react-pdf/renderer` over Puppeteer or pdf-lib (Vercel-friendly, JSX maintainability, no Chrome dependency)
  - `0017-pdf-no-storage.md` — why generate on-demand instead of persisting to Supabase Storage (current submissions are immutable in practice; storage cost + signed-URL complexity not yet justified; revisit when a "share this submission" feature lands)

---

## 2026-05-19 — Step 5 closed

### Work done

Step 5 (save-and-recommend on `/calculator`, with internal sales notification) is shipped to production and verified end-to-end. The original Step 5 Definition of Done is met:

- Migration applied to the cloud Supabase project. `server_specs` seeded with six VideoX rows; `submissions.groups_payload` jsonb in place.
- `npm run build` clean (Turbopack, 8 routes, 0 errors).
- `npm run lint` clean.
- `npm test` — 8/8 recommendation-algorithm golden cases pass.
- Save click on `/calculator` writes the submission row, sends a notification through Gmail SMTP to the `sales@arxys.com` Google Group, and renders the recommendation inline below the form without a page reload.
- Two real submissions placed in production. Both rendered correctly (3 × V800 with both warnings; 2 × V200 with stacking warning), both visible in the Sales group's Conversations view, owner receives a direct copy via the BCC fix.

ADRs 0012 (bandwidth gate dropped; supersedes 0006), 0013 (inline result), 0014 (internal-only email), and 0015 (BCC SMTP user) are on disk.

### Deferred to future work — non-blocking

These came up during Step 5 verification but were never in the Step 5 brief. They are tracked here so they don't rotate out of head:

- **DKIM alignment for outbound `arxys.com` mail.** Half-done already — the DKIM TXT record at `google._domainkey.arxys.com` exists (1024-bit RSA, selector `google`). What's missing is flipping **Workspace Admin → Apps → Google Workspace → Gmail → Authenticate email → Start authentication** so outbound Gmail-SMTP mail signs as `d=arxys.com` instead of `d=arxys-com.YYYYMMDD.gappssmtp.com`. Optional upgrade to a 2048-bit key in the same pass. DNS hosted at SiteGround; the TXT-record swap goes through SiteGround's DNS Zone Editor. Effect: stops the DMARC alignment-fail signal in arxys.com's daily Mimecast reports, lowers spam-classification risk on Workspace member mailboxes, and is a prerequisite for ever tightening DMARC from `p=none` to `p=quarantine`/`p=reject`. **Not a portal code change.**
- **Member spam-folder confirmation.** Three non-owner members of `sales@arxys.com` should confirm portal notifications aren't landing in Spam. If they are, the DKIM work above is the durable fix.

### Decisions captured

None new in this entry. ADR 0015 (the BCC fix) was captured in yesterday's verification entry below.

---

## 2026-05-19 — Step 5 verification + Google Groups loopback fix

### Work done

- End-to-end smoke test on Vercel production with two real submissions ("test andy" → 3 × V800 with both warnings; "ttt" → 2 × V200 with stacking warning). Submissions persisted, recommendation algorithm produced correct results, emails landed in the Sales Google Group's Conversations view.
- **Detour:** group owner (`andy.newbom@arxys.com`) reported not receiving the notification despite being a member of `sales@arxys.com`. Root cause: Google Groups suppresses fan-out delivery back to the sending member by design. Send-mail-as alias does not escape this rule. Fixed by BCC'ing `SMTP_USER` on every notification (see ADR 0015). Implementation: one conditional in `src/lib/email/submission-notification.ts` — no new env var.
- Also resolved the **Vercel env-var gap** discovered during the same test run: none of the six `SMTP_*` / `INTERNAL_NOTIFICATION_EMAIL` vars existed in Vercel production, only in `.env.local`. The lazy validator in `env.ts` therefore threw at first SMTP read; the catch in the Server Action swallowed it (by design) and the UI showed success. Pushed all six via `vercel env add --sensitive`, then `vercel redeploy` (Vercel only applies new env vars to new deployments).

### Detours & fixes

- **"No email received" looked like an SMTP failure but was three separate issues.** In order of discovery:
  1. Missing env vars in Vercel production → fixed by `vercel env add` + redeploy.
  2. Loopback suppression on the owner's own group → fixed by ADR 0015's BCC.
  3. DKIM alignment failure on outgoing Gmail-SMTP mail (signed `d=gappssmtp.com` instead of `d=arxys.com`) — flagged in the original DMARC report. Today this is harmless (`arxys.com` is `p=none`). Logged as a follow-up; the fix is in Google Workspace Admin, not in portal code.

### Decisions captured

- [`0015-bcc-smtp-user-on-group-notifications.md`](./decisions/0015-bcc-smtp-user-on-group-notifications.md) — BCC the SMTP user to bypass Google Groups loopback suppression.

### Pending follow-ups

- Configure `arxys.com` DKIM signing in Google Workspace Admin so outbound Gmail-SMTP mail signs as `d=arxys.com` and aligns with DMARC. Not a portal code change.
- Members of the Sales group should confirm the notifications aren't landing in their Spam folders. If they are, the DKIM alignment work above is the durable fix.

---

## 2026-05-18 — Step 5: submission save, recommendation algorithm, sales notification

### Work done

- **Migration `supabase/migrations/20260519052732_step5_submissions_and_seeds.sql`:**
  - Dropped `NOT NULL` on `server_specs.max_bandwidth_mbps` and replaced the CHECK with `is null or > 0` (ADR 0012 supersedes 0006 — bandwidth gate removed).
  - Added `submissions.groups_payload jsonb` so the per-camera-group form snapshot is preserved alongside the single-row recommendation. Resolves the open question from ADR 0011.
  - Seeded six `products` rows (VideoX V200–V800) with `list_price_usd` = 1..6 as the order-proxy pricing the Step 5 decision called for. Stable UUIDs so server_specs FK references are deterministic.
  - Seeded six `server_specs` rows referencing those products. `max_storage_tb` = configurator MAX; configurator MIN recorded in `notes`. `max_bandwidth_mbps` left NULL.
- **`src/lib/recommend/`** — pure module with no I/O:
  - `types.ts`: `ServerSpec`, `RecommendationInput`, `RecommendationCandidate`, `RecommendationResult`. `GB_PER_TB = 1000` (vendor convention).
  - `algorithm.ts`: multi-unit packer per ADR 0003, bandwidth gate removed per ADR 0012. Tiebreak: total cost, then unit price, then alphabetical model code. Emits warnings for `units > 1` and for workloads that exceed the largest single VideoX on cameras or storage.
  - `algorithm.test.ts`: 8 golden cases including the tricky 2×V200-beats-1×V400-on-unit-price-tiebreak. All pass under `npm test` (added `"test": "tsx --test 'src/**/*.test.ts'"` to package.json).
- **`src/lib/email/`** — Gmail SMTP transport per ADR 0002 (`transport.ts` lazy-caches the nodemailer instance) + `submission-notification.ts` plain-text template that sends to `INTERNAL_NOTIFICATION_EMAIL` (already in `env.ts`). Internal-only for Phase 1 — ADR 0014.
- **`src/app/(app)/calculator/actions.ts`** — Server Action `submitCalculation`. Validates with zod, **server-side recomputes** totals (client values are never trusted), loads active `server_specs` with their product price via a single FK join, runs `recommend()`, inserts the submission (the primary group's resolution/codec/complexity becomes the canonical single-row record; the full per-group payload lives in `groups_payload`), sends the sales notification, stamps `email_sent_at`. Email failure does not block the submission — it is logged server-side.
- **`src/app/(app)/calculator/calculator-form.tsx`** — added Save button + inline RecommendationPanel below the form. Wired via `useActionState`. Panel shows unit count, model, cameras + storage coverage, driving dimension, warnings, and the submission ID. ADR 0013 — no `/submissions/[id]` route.
- **CSS** — appended `.ax-save*` and `.ax-rec*` selectors to `calculator.css`, all scoped under `#arxys-calc-root`.
- **Docs** — three new ADRs (0012 supersedes 0006 inline, 0013, 0014). ADR 0006 status line updated to "Superseded by 0012 on 2026-05-18".

### Detours & fixes

- **Brief assumed schema state that didn't match disk.** The brief proposed creating `server_specs` and a new `submission_groups` table. In reality `server_specs` was already in `20260515193702_initial_schema.sql` with the final ADR-0006 shape (including `max_bandwidth_mbps NOT NULL CHECK > 0`), and `submissions` already had `recommended_product_id` + `recommended_units` for a single-recommendation-per-submission shape. Confirmed with the user before writing code: skip `submission_groups`, add `groups_payload jsonb` to `submissions` instead.
- **Three blockers surfaced in a single AskUserQuestion before writing the algorithm.** Decisions: drop the bandwidth gate (option C → ADR 0012); use 1..6 order-proxy pricing on `products.list_price_usd`; skip `submission_groups` and use the jsonb column.
- **`INTERNAL_NOTIFICATION_EMAIL` already existed in `src/lib/env.ts`** as a required var. The brief's "hardcode `sales@arxys.com`" was wrong — used the env var to stay aligned.
- **No test runner was set up.** Added an `npm test` script using `tsx --test` (tsx was already a devDep, no new packages needed).
- **ESLint runs appeared to hang** under the harness — the `npm run lint` script is bare `eslint`, which on flat-config lints with no output on success. Two completed background runs returned exit 0 with empty stdout; that's the success signal. Future: add `--max-warnings 0` for explicit confirmation.

### Decisions captured

- [`0012-bandwidth-gate-resolution.md`](./decisions/0012-bandwidth-gate-resolution.md) — drop the bandwidth gate; supersedes 0006.
- [`0013-submission-result-inline.md`](./decisions/0013-submission-result-inline.md) — inline result on the calculator page; no `/submissions/[id]`.
- [`0014-submission-email-notification.md`](./decisions/0014-submission-email-notification.md) — internal-only sales email for Phase 1; no partner email or PDF.

### Pending

- `supabase db push` against the cloud project — the migration is on disk but needs `SUPABASE_DB_PASSWORD` from the user's password manager. Run from the repo root:
  ```
  SUPABASE_DB_PASSWORD='<from-password-app>' supabase db push
  ```
- End-to-end smoke test on a real Supabase project: sign in as a partner, fill the calculator, click Save, confirm the submission row + the email to `sales@arxys.com`.

---

## 2026-05-18 — Planned: Step 5 handoff brief patches (transport, auth, ADR title)

### Work done

Three clarifications folded into the Step 5 handoff brief before the implementation session opens:

1. **Email transport is Gmail SMTP, already decided.** ADR [`0002-gmail-smtp-over-siteground.md`](./decisions/0002-gmail-smtp-over-siteground.md) is authoritative — env vars `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (with `SMTP_FROM=noreply@arxys.com` via Gmail "Send mail as" alias). The internal notification recipient is `sales@arxys.com` (the brief used `INTERNAL_NOTIFICATION_EMAIL` as a placeholder — confirm whether that env var exists or hardcode `sales@arxys.com` in the action; user preference: hardcode for Phase 1, no need for an env var). If `src/lib/email/` does not yet exist, the implementation session creates it using nodemailer against the env vars above. Do **not** pick a different transport (Resend, SES, etc.) — that would silently supersede ADR 0002.

2. **Auth posture: all behind login.** `/calculator` lives under `(app)/`, the protected route group. Anonymous submissions are not in scope. RLS on `submission_groups` therefore mirrors `submissions` exactly: `partner_id = auth.uid() OR is_admin()`. The Server Action reads the Supabase user from the server-side client and writes `partner_id` from `auth.uid()` — never trusts a client-supplied id.

3. **ADR 0012 title generalized.** Renamed from `0012-server-specs-bandwidth-resolution.md` to `0012-bandwidth-gate-resolution.md` so the title fits all three branches (A: add column, B: derive from cameras, C: drop the gate and supersede ADR 0006). The ADR records which option the user picked and the rationale; if option C, it also carries the `Supersedes: 0006` link and ADR 0006 gets its `Status:` line updated in the same commit.

These three points are now part of the handoff brief the user is pasting into the Step 5 session.

---

## 2026-05-18 — Planned: Step 5 configurator data received + bandwidth-gate open question

### Work done

- User supplied the configurator capacity table for `server_specs` seed (six rows):

  | model | description | max_cameras | storage_min_tb | storage_max_tb |
  |---|---|---|---|---|
  | V200 | VideoX V200 1U 4Bay Rack - V5 NVR Server | 100 | 10 | 64 |
  | V400 | VideoX V400 2U 8Bay Rack - V5 Video & Analytics Server | 200 | 65 | 118 |
  | V500 | VideoX V500 2U 12Bay Rack - V5 Video & Analytics Server | 275 | 119 | 210 |
  | V600 | VideoX V600 3U 16Bay Rack - V5 Video & Analytics Server | 275 | 211 | 300 |
  | V700 | VideoX V700 4U 24Bay Rack - V5 Video & Analytics Server | 325 | 301 | 430 |
  | V800 | VideoX V800 4U 36Bay Rack - V5 Video & Analytics Server | 325 | 431 | 640 |

  Notes:
  - V500 / V600 are identical in camera capacity (275); they differ only in storage range — confirming the earlier "storage-only differentiation" given by the user.
  - V700 / V800 likewise identical in cameras (325); storage-only differentiation.
  - V200 is **NVR-only** (no analytics) — included in this table because Step 5 sizes a bandwidth + storage workload from the existing calculator and V200 is a legitimate cheapest-fit candidate. V200 is **excluded** from the future VideoX Analytics Sizing calculator (that calculator's recommendation set starts at V400).

### Open question (BLOCKING for Step 5 implementation, not for scope)

- **No bandwidth-cap column in the configurator.** ADR 0006 (bandwidth gate) presupposes per-model `max_bandwidth_mbps`. Three options to resolve before code lands:
  - **A)** User supplies per-model bandwidth caps (preferred — keeps the gate as a real constraint).
  - **B)** Derive bandwidth implicitly: `max_bandwidth_mbps = max_cameras × X` for some constant `X` per Mbps/camera. Requires `X` from user.
  - **C)** Drop the bandwidth gate. Recommendation becomes camera-count + storage-only. ADR 0006 would be amended/superseded.
  The implementation session must NOT proceed with the recommendation algorithm until this is answered.

---

## 2026-05-18 — Planned: Step 5 scope locks (inline result on calculator page)

### Work done

- Confirmed Step 5 (submission save / recommendation algorithm) will display its result **inline on the calculator page** rather than redirect to a separate submission detail view. Saves design surface area and keeps the calculator → recommendation → "looks good, submit to sales" flow on one screen.
- `server_specs` seed data confirmed to come from the **configurator data** (per-model capacity table: model, max_cameras, max_bandwidth_mbps, max_storage_tb, optional notes), not the price list. User to supply the sheet at the start of the Step 5 session.
- Step 5 itself deferred to a future fresh Claude Code session. Estimated 3–5 hours focused work.

### Decisions captured

- ADR to author at Step 5 implementation: `NNNN-submission-result-inline.md` (Context: needs a result surface after Save; Options: dedicated `/submissions/[id]` page vs inline panel on `/calculator`; Decision: inline; Consequences: simpler routing, no shareable submission URL until later).

---

## 2026-05-18 — Planned: VideoX Analytics Sizing Calculator (new step, scoped only)

### Work done

- Captured the scope for a new self-contained calculator page to be added to the Portal. **Not yet implemented** — recorded here so the next session has a clean handoff and the open questions don't rotate out of head.
- Scope as provided:
  - **Purpose:** size Avigilon NVR6 workloads (Appearance Search, Appearance Search + Facial Recognition, ALPR) and recommend a VideoX model.
  - **Inputs:** AS-only streams (0–200, used raw), FR streams (0–50, buffered), ALPR lanes (0–60 nominal, real cap depends on FPS tier) + FPS tier selector (5/10/20/30), plus a read-only total stream count.
  - **Buffer step (CONFIRMED 2026-05-18 after a clarification round):** tiered multiplier on FR and ALPR based on stream-count band. AS used raw. *An earlier exchange briefly recorded this as a flat ×1.10; that was wrong and has been reverted.* The authoritative tables:
    - **FR** (max 50): 0–16 → ×1.05; 17–33 → ×1.10; 34–50 → ×1.15.
    - **ALPR 5 FPS** (max 40): 0–13 → ×1.05; 14–26 → ×1.10; 27–40 → ×1.15.
    - **ALPR 10 FPS** (max 20): 0–6 → ×1.05; 7–13 → ×1.10; 14–20 → ×1.15.
    - **ALPR 20 FPS** (max 10): 0–3 → ×1.05; 4–6 → ×1.10; 7–10 → ×1.15.
    - **ALPR 30 FPS** (max 6): 0–2 → ×1.05; 3–4 → ×1.10; 5–6 → ×1.15.
    Integer bands are authoritative; the "% of max" wording in the original spec is rationale, not the implementation rule.
  - **Budget formula:** `(AS/200) + (FR_buffered/50) + (ALPR_buffered/LPR_tier_max)` = single budget fraction.
  - **Tier mapping:** ≤0.50 → NVR6 Standard, 0.51–0.75 → Premium, 0.76–1.00 → Premium Plus, >1.00 → multi-server warning.
  - **VideoX recommendation (FINAL 2026-05-18):** the 20% rule is a per-model **headroom guarantee**, motivated by Arxys product economics (Arxys is ~½ Avigilon's price, so over-spec rather than under-spec). Mechanically: pick the smallest VideoX model whose capacity satisfies `budget ≤ 0.80 × model_capacity`. The "tier-boundary bump" language used earlier is just the visible behavior of this rule near tier ceilings. The Avigilon tier label (Standard / Premium / Premium Plus) is still shown to the user as context but is *not* what drives the model recommendation — the headroom rule does.
  - **UI:** live recalc, visual budget bar (green→amber→red), Avigilon tier label, VideoX recommendation. Client-side only, no backend, no persistence. Match the Arxys Portal styling conventions established for the bandwidth calculator (`#arxys-calc-root` scoped CSS, gold accents).
- Frontend-only. Sits under the protected `(app)/` route group like the existing calculator. No DB migrations, no Route Handlers, no email.

### Open questions / problems flagged before coding

**Resolved 2026-05-18:**
- ~~Asymmetric buffering rationale~~ → AS load is less variable per stream than FR/ALPR. Capture in ADR when authored.
- ~~Whether buffer is tiered or flat~~ → tiered, per the original spec table. The intermediate "flat ×1.10" exchange was a misunderstanding and is reverted.

**Still open:**

1. ~~Per-tier VideoX capacity values~~ → **CONFIRMED 2026-05-18**: V400=0.50, V500/V600=0.75, V700/V800=1.00. Compute tiers are three: {V400}, {V500, V600}, {V700, V800}. Storage choice within a paired tier is out of scope for this calculator.
2. **Boundary comparators on the tier mapping.** Original spec: "≤ 0.50", "0.51–0.75", "0.76–1.00." With floats, 0.501 needs an explicit home. Confirm: `budget ≤ 0.50` → Standard, `0.50 < budget ≤ 0.75` → Premium, `0.75 < budget ≤ 1.00` → Premium Plus, `budget > 1.00` → multi-server.
3. **Single-category overflow.** FR=50 buffered = 57.5 → contributes 1.15 alone. ALPR at tier max → 1.15 alone. So budget > 1.0 is reachable from a single maxed category. Multi-server warning every time, or is there a "V800 covers it" path?
4. ~~V500 in two tier ranges~~ → resolved: V500/V600 are one compute tier; V500 reached from "Standard" workloads is just the headroom rule promoting from V400 to the V500/V600 pair.
5. ~~Premium / Premium Plus showing one or two models~~ → resolved: always show the pair when the recommendation lands in the V500/V600 or V700/V800 compute tier. Note that storage choice within the pair is out of scope.
6. **FPS tier change behavior.** ALPR lanes at 40 (valid for 5 FPS), user switches to 30 FPS (max 6). Clamp value, warn, or allow overflow into budget > 1.0?
7. **ALPR input range 0–60 vs per-tier max of 40/20/10/6.** Clamp input to selected tier's max, or allow 0–60 nominal?
8. **Total stream count.** Display-only, unused in calc. Keep as a sanity check? Label accordingly?
9. **Routing + dashboard entry.** Route path (`/videox-calculator`? `/analytics-sizing`?) and whether the dashboard gets a third card.
10. **Styling scope.** Recommendation: separate `videox-calculator.css` with `#arxys-videox-root` id-scope, share CSS variables via globals.
11. **Input shape.** Recommendation: combined number-input + range-slider per input row.

### Spec status (2026-05-18, post-clarification round)

All blocking questions resolved. Calculator is ready to implement in a fresh Claude Code session. ADRs to author at implementation time:
- One ADR for the buffer-rule rationale (asymmetric AS-no-buffer + tiered FR/ALPR multipliers)
- One ADR for the 20% headroom selection rule + the three-compute-tier model (V400 / V500-V600 / V700-V800) and the capacity values 0.50 / 0.75 / 1.00
- One ADR for the routing/dashboard integration (route name, dashboard card placement)

### Implementation plan (for the fresh session)

**File layout** (mirrors the existing bandwidth calculator under `src/app/(app)/calculator/`):

```
src/app/(app)/analytics-sizing/
  page.tsx                  # server component, ↶ Back to dashboard link + <SizingForm />
  sizing-form.tsx           # "use client" — form state, live recalc
  sizing.css                # scoped to #arxys-videox-root, imports CSS vars from globals
  icons.tsx                 # any new SVGs (or import from ../calculator/icons.tsx if reusable)
src/lib/analytics-sizing/
  tables.ts                 # buffer bands + capacity table, verbatim from JOURNAL spec
  compute.ts                # pure functions, fully unit-testable
  compute.test.ts           # vitest if present, else node:test
```

Dashboard card added in `src/app/(app)/dashboard/page.tsx` — third card alongside the existing Calculator + Submission History cards.

**`tables.ts` shape:**

```ts
export const AS_MAX = 200;
export const FR_MAX = 50;

export const FR_BUFFER_BANDS: readonly { max: number; mult: number }[] = [
  { max: 16, mult: 1.05 },
  { max: 33, mult: 1.10 },
  { max: 50, mult: 1.15 },
];

export const ALPR_FPS_TIERS = [
  { fps: 5,  laneMax: 40, bands: [{ max: 13, mult: 1.05 }, { max: 26, mult: 1.10 }, { max: 40, mult: 1.15 }] },
  { fps: 10, laneMax: 20, bands: [{ max: 6,  mult: 1.05 }, { max: 13, mult: 1.10 }, { max: 20, mult: 1.15 }] },
  { fps: 20, laneMax: 10, bands: [{ max: 3,  mult: 1.05 }, { max: 6,  mult: 1.10 }, { max: 10, mult: 1.15 }] },
  { fps: 30, laneMax: 6,  bands: [{ max: 2,  mult: 1.05 }, { max: 4,  mult: 1.10 }, { max: 6,  mult: 1.15 }] },
] as const;

export const COMPUTE_TIERS = [
  { id: "small",  models: ["V400"],         capacity: 0.50 },
  { id: "medium", models: ["V500", "V600"], capacity: 0.75 },
  { id: "large",  models: ["V700", "V800"], capacity: 1.00 },
] as const;

export const HEADROOM_FACTOR = 0.80;  // budget must be ≤ 0.80 × capacity

export const AVIGILON_TIERS = [
  { id: "standard",     label: "NVR6 Standard",     max: 0.50 },
  { id: "premium",      label: "NVR6 Premium",      max: 0.75 },
  { id: "premiumPlus",  label: "NVR6 Premium Plus", max: 1.00 },
] as const;
```

**`compute.ts` shape** — pure functions, no React:

```ts
export function bufferFor(count: number, bands: readonly { max: number; mult: number }[]): number;
// returns the multiplier whose band the count falls in (count <= band.max)

export function bufferedFr(count: number): number;            // count * bufferFor(count, FR_BUFFER_BANDS)
export function bufferedAlpr(lanes: number, fps: 5|10|20|30): number;

export interface SizingInputs {
  asStreams: number;          // 0..200
  frStreams: number;          // 0..50
  alprLanes: number;          // 0..tier.laneMax
  alprFps: 5 | 10 | 20 | 30;
}

export interface SizingResult {
  budget: number;                       // raw fraction, can exceed 1.0
  avigilonTier: "standard" | "premium" | "premiumPlus" | "overflow";
  recommendation:
    | { kind: "model"; tier: "small" | "medium" | "large"; models: readonly string[] }
    | { kind: "multiServer" };
  totalStreams: number;                 // as + fr + alpr (display only)
  contributions: {                      // for the budget bar tooltip
    as: number;
    fr: number;
    alpr: number;
  };
}

export function computeSizing(inputs: SizingInputs): SizingResult;
```

`computeSizing` is the single entry point the form calls on every change. Selection rule: walk `COMPUTE_TIERS` in order; first tier where `budget <= HEADROOM_FACTOR * capacity` wins. None pass → `{ kind: "multiServer" }`.

**`sizing-form.tsx` shape:**

- `useState<SizingInputs>` with sensible defaults (e.g. `{ as: 0, fr: 0, alpr: 0, alprFps: 10 }`).
- `useMemo` → `computeSizing(inputs)`.
- Four input rows, each: label + tooltip + `<input type="number">` + `<input type="range">` synchronized via `onChange`. ALPR row also has a `<select>` for FPS tier; on FPS change, clamp `alprLanes` to the new tier's `laneMax`.
- Output panel: budget bar (width: `min(100, budget*100)%`, color: green ≤0.66, amber ≤1.0, red >1.0), Avigilon tier label, VideoX recommendation (single model or pair, multi-server warning), total stream count as a small subdued line.
- Reset button → restores defaults.

**Styling:** wrap the form root in `<div id="arxys-videox-root" className="ax-root">`. Copy the relevant ax-* class structure from `src/app/(app)/calculator/calculator.css` for visual consistency (summary cards, body card, results panel) and add new id-prefixed selectors in `sizing.css` only where the new UI diverges (the budget bar, the FPS-tier selector, the model-pair badge). Share `--ac`, `--bg`, `--tp`, `--ts` etc. via the global stylesheet so theme drift can't happen.

**Tests:**
- `bufferFor` boundary cases: 0, 16, 17, 33, 34, 50 for FR.
- `computeSizing` golden cases: pick 6–8 hand-calculated input combos covering each compute tier and the multi-server case. Numbers in the test should match the JOURNAL spec's worked examples.

**ADRs to write at the start of implementation:**

1. `NNNN-analytics-sizing-buffer-rule.md` — why AS uses raw streams while FR/ALPR get tiered buffers; alternatives considered (flat ×1.10, no buffer).
2. `NNNN-analytics-sizing-headroom-and-tiers.md` — the 20% headroom rule, three-compute-tier model, V500=V600 and V700=V800 storage-only differentiation, capacity values 0.50/0.75/1.00.
3. `NNNN-analytics-sizing-route-and-integration.md` — route at `/analytics-sizing` (product-name-neutral), dashboard third-card placement, scoped CSS pattern (`#arxys-videox-root`).

**Definition of done:**

- `/analytics-sizing` renders behind auth, shows the form, recalculates live with no submit button.
- Compute tests pass.
- Dashboard has a third card linking to the new route.
- JOURNAL appended with an implementation entry; RUNBOOK unchanged (no setup-recipe change); three ADRs landed.
- No `TODO` / placeholder values anywhere; no `any` types in compute.

### Decisions captured

- None yet — ADRs land with the implementation.

---

## 2026-05-18 — Ops: stray `vercel deploy` clobbered prod, recovery + prevention

### Work done

- Another Claude session ran `vercel deploy` from a different folder while my Vercel CLI auth was active. The Vercel org `arxys` only had one project at the time (`portal`), so the CLI's "link to existing project?" prompt offered `portal` and the deploy went to the Portal's production alias. Live URL temporarily served the wrong app ("Arxys Forecast").
- Recovery: pushed an empty commit `9ffd053` to force Vercel's GitHub webhook to rebuild from `main` (`5762733`). The new build went to production automatically as `dpl_942kfHsRHdFAHH6kgnHTz4AqrGKJ`. Verified via `vercel inspect` (target=production, status=Ready) and `vercel curl` (live URL renders the Portal `/login` page).
- Prevention layer A: created an empty `forecast` Vercel project (`vercel projects add forecast`). Now there are two projects in the `arxys` org, so future `vercel deploy` from the Forecast folder has an obvious correct destination — no path of least resistance back to `portal`.
- Prevention layer B: ran `vercel link --yes --project=portal` here so `.vercel/project.json` pins this folder to `prj_tu3RWtzjhh7ao4mAELuJVaFWgkJV`. Future `vercel inspect`/`vercel curl` from this directory don't prompt and can't accidentally target the wrong project. `.vercel/` is already in `.gitignore` (line 37, from create-next-app).

### Detours & fixes

- **No `.vercel/project.json` existed anywhere on disk.** I expected to find one in the Forecast folder and `vercel unlink` it. Wider `find` came up empty. The rogue deploy must have been one-shot (CLI prompted for project, deployer chose `portal`, no link persisted to disk). So the prevention had to operate at the *project existence* level (make `forecast` exist as an alternative) plus *this folder's link* (so our own commands stay safe).
- **Vercel CLI uses ambient auth.** Whoever is logged in to `vercel` on this Mac can deploy to any project in the `arxys` org. Folder-level unlinking is only a hint, not a guard. The real defense is making the right project obvious at the prompt, plus running deploys from explicitly-linked folders.

### Decisions captured

- None new. Documented inline; the choice of "create a placeholder project to give CLI prompts an unambiguous destination" is straightforward enough that an ADR would be over-formal.

---

## 2026-05-18 — Step 4 follow-up: full reference-CSS port

### Work done

- Copied the calculator stylesheet from `reference/Arxys-React-calculator.clean.html` verbatim into `src/app/(app)/calculator/calculator.css`. All ~190 selectors prefixed with `#arxys-calc-root` so the stylesheet cannot leak into auth pages or the dashboard. CSS custom properties (`--ac`, `--bg`, `--ts`, etc.) preserved exactly.
- Created `src/app/(app)/calculator/icons.tsx` with the inline SVG icons from the reference (CameraIcon, PlusIcon, TrashIcon, DuplicateIcon, BarsIcon, StorageIcon, InfoIcon, ResetIcon).
- Rewrote `calculator-form.tsx` to mirror the reference JSX structure: summary cards (`.ax-sum`), global settings row (`.ax-gl`), camera cards with header/body/results (`.ax-cam` / `.ax-ch` / `.ax-cb` / `.ax-cr`), dashed Add Camera Group button (`.ax-add`), per-group results table (`.ax-tw`), bandwidth + storage bar charts (`.ax-cht`), and footer note (`.ax-fn`). Reset button included. Hrs/Day input converts between hours and the `recordingPercent` state. Motion is a `<input type="range">` slider. Tooltips on Codec / Hrs/Day / Motion match the reference. The page now looks essentially identical to the public arxys.com calculator.
- Updated `calculator/page.tsx` to import the CSS and drop my page-level header — the form provides its own visual hierarchy via the summary cards.
- Deliberately omitted from the reference: the tabs (everything renders on one page now that we're inside a logged-in portal, not a public landing page), the "Get Your Full Report" CTA box and email-collection (auth replaces it), the failover checkbox (not in our schema yet).

### Detours & fixes

- **Inputs were invisible** before the restyle landed — text inherited a near-white color from Tailwind v4 defaults on `bg-white`. Fixed immediately with `text-neutral-900` in commit 3dfa3e8. The full restyle replaced that scaffolding with explicit `color: var(--tp)` rules from the reference CSS, so the workaround is no longer needed but doesn't hurt either.
- **Initial Step 4 used minimal Tailwind** because I'd applied the auth-pages styling choice ("minimal Tailwind, functional" from Step 3) to the calculator without re-asking. The calculator is the partner's main tool and has a battle-tested design on the public arxys.com site. Should have asked separately. Lesson for the discipline: when styling matters to recognizability or familiarity, ask scope per page, not once globally.

---

## 2026-05-18 — Step 4: Calculator UI

### Work done

- Extracted the lookup tables from `reference/Arxys-React-calculator.clean.html` into `src/lib/calculator/tables.ts`:
  - 26 resolutions (QVGA through 29MP), exact widths/heights preserved
  - 3 codecs (H.265, H.264, H.264-Smart) with per-codec bitrate factors
  - 3 complexity tiers (Low office / Med retail / High outdoor)
  - 6 VMS options
  - `STORAGE_OVERHEAD = 1.20` as a named constant
- Ported the four computation functions into `src/lib/calculator/compute.ts` as named, typed, pure functions: `estimateFrameKb`, `applyMotionAdjustment`, `computeBandwidthMbps`, `computeRawStorageGb`. Plus a `computeGroup` aggregator and three display formatters (`formatNumber`, `formatStorageGb`, `formatBandwidthMbps`).
- Built the calculator page at `/calculator`:
  - `page.tsx` is a Server Component shell.
  - `calculator-form.tsx` is the Client Component holding all the state. Supports add / duplicate / remove on camera groups (legacy parity).
  - Totals roll up live across groups as the user edits.
  - Project-level fields: project name, retention days (1–3650), VMS dropdown.
  - Per-group fields: cameras, fps, resolution, codec, scene complexity, recording %, motion %.
  - Each group shows per-camera bitrate, group bandwidth, group storage (post-overhead), and raw group storage (for transparency).
- Updated `/dashboard` to be a two-card grid: a live "Calculator" card linking to `/calculator`, and a stub "Submission history" card flagged "Coming in Step 5."

### Detours & fixes

- **The legacy calculator's per-group breakdown doesn't fit the current `submissions` schema.** The Step 2 migration designed `submissions` as a single-row aggregate (single `resolution_code`, single `codec`, etc.). Groups need to be persisted as child rows or as JSON. Decided to defer the schema change to Step 5 (when save lands anyway) and recorded the eventual choice in [`decisions/0011`](./decisions/0011-camera-groups-schema-tbd.md): a `submission_groups` child table. Step 4 has no save, so this isn't blocking.
- **Motion adjustment applied to all three codecs**, not just `smart`. The legacy code does `["h264","h265","smart"].includes(cod)` to gate the adjustment, but every codec in `COD` matches that condition, so the gate is a no-op. Faithful port keeps the multiplier on all codecs. If we ever discover a codec that genuinely shouldn't motion-scale, we'll move the multiplier into a per-codec table.

### Decisions captured

- [`0011-camera-groups-schema-tbd.md`](./decisions/0011-camera-groups-schema-tbd.md) — defer to Step 5, but committing to `submission_groups` child table

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
