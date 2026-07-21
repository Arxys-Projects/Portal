# Claude Code brief — Customer Proposal + partner logo system (ADR 0089)

**Model:** Opus 4.8
**Effort:** xhigh
**Why:** touches schema (new column + Storage bucket), a partner-facing access
path behind RLS, PDF render pipeline with a pricing-leak safety requirement, and
cross-module judgment (assembler/renderer split). Not mechanical.

Read first: ADR 0089, ADR 0083, ADR 0086, JOURNAL entries for 2026-07-17
(price-source fix, msrp column drop), 2026-07-20 (Portal UX pass / 0083 build).
Follow the three-document discipline and every hard rule (no git push, no
`supabase db push`, no price math in portal beyond the MSRP×qty display total
defined here, no autonomous production writes, stop-and-flag before anything
touching live records / RLS / schema).

The style skills apply to all copy in this build (no em dashes, no "not X but Y",
no AI-slop). Any user-facing string you add goes through `no-ai-slop`.

---

## Plan-first gate

Before writing implementation code, produce a plan that:

1. Reports the answer to the **MSRP source-of-truth question** (Task 0). This
   determines whether Task 4 (freeze MSRP) is a no-op or a real change. Do not
   skip this — it changes the shape of the snapshot work.
2. Confirms the exact current column set and header layout of the Project Quote
   renderer and where the discount fields are introduced into the render object,
   so the assembler-level strip (Task 3) targets the right layer.
3. Lists every migration and its paired rollback, and marks each with its
   stop-and-flag gate.
4. Surfaces any hidden gotcha found while reading the code.

Surface the plan and stop for review before implementation.

---

## Task 0 — Investigate MSRP source of truth (read-only, do this first)

Determine whether the `project_quotes` snapshot **stores** MSRP-each per line at
generation, or **resolves it live** from `current_products.msrp` at render time.

- Trace the Project Quote assembly (`assemble.ts`, `snapshot.ts`) and the
  commercial-page render for the MSRP-each column.
- Report: stored or live. If stored, Task 4 is verification only. If live,
  Task 4 adds a stored MSRP-each per line at generation.

Read-only. No writes. Report findings in the plan.

---

## Task 1 — Partner logo: schema + storage

Stop-and-flag: this adds a column and a Storage bucket.

1. **Column:** add `logo_path text null` (or the codebase's naming convention)
   to the partner/company record table. Migration + paired rollback. Do not
   apply — Andy applies (agent lacks DDL creds; cached CLI returns 401).
2. **Storage bucket:** create a bucket for partner logos. Logos are not secret;
   read policy can be public-read or signed-URL per the codebase's existing
   pattern — match whatever the portal already does for served images. Document
   the choice. Write access is admin-only.
3. Provide the migration, the rollback, and a short apply note for Andy.

---

## Task 2 — Partner logo: admin upload + attach

1. Admin-only UI to upload a logo for a partner and attach it (writes
   `logo_path`). Enforce PNG/JPG at upload (reject other types with a clear
   message). Transparent PNG is the expected input; no SVG.
2. Store to the Task 1 bucket; write the resolved path/key to the partner row.
3. Replace-on-reupload (one logo per partner). No hard delete of prior objects
   from the agent — if cleanup is wanted it is a separate manual step.

No autonomous production writes: the upload action is admin-triggered in the UI,
not run by the agent against prod.

---

## Task 3 — Customer Proposal renderer (critical: discount strip at assembler)

The Customer Proposal is a **second view over the identical snapshot**. No second
table, no second snapshot.

1. **Assembler-level strip.** Build (or extend) the data assembler so the object
   handed to the Customer Proposal renderer has discount %, partner-each,
   partner line total, and partner grand total **physically absent** — not
   present-but-hidden. The renderer must never receive them.
2. **Renderer variant.** Implement the Customer Proposal as a variant of the
   Project Quote template with these differences (see ADR 0089 §3 for the full
   list):
   - Header badge text → CUSTOMER PROPOSAL.
   - Header center slot → partner logo (Task 5), blank fallback.
   - Page 1: remove the "System capacity" bars. Keep everything else incl.
     "Prepared for".
   - Page 2: keep product spec blocks AND the "Quoted solution" bars.
   - Commercial page columns: `CODE | PRODUCT | PRICE EACH | QTY | PRODUCT TOTAL`.
     `PRICE EACH` = MSRP-each (relabeled). `PRODUCT TOTAL` = MSRP × qty.
     Grand total = sum of MSRP line totals (recompute; do NOT inherit the
     partner total).
   - Commercial header block: remove the DEAL cell; keep CUSTOMER and CONTACT.
   - Footnote → "All amounts in USD." only. Drop the PO-acceptance price-lock
     line. Keep the top validity banner.
   - Remove the page-4 Terms & Conditions entirely.
   - Footer address unchanged (El Cajon).
3. **Filename + metadata scrub:** no partner/discount reference in the output
   filename or PDF metadata.

The MSRP×qty and grand-total sum are display arithmetic for the customer
document, permitted here; no other price math in the portal.

---

## Task 4 — Freeze MSRP at generation

Conditional on Task 0.

- If MSRP is already stored per line in the snapshot: verify the Customer
  Proposal and Project Quote both read that stored value; no change.
- If MSRP is resolved live: extend the snapshot to store MSRP-each per line at
  generation, and point both documents' MSRP-each column at the stored value, so
  a re-download after a price change shows the originally-quoted number.

Any snapshot schema change gets a migration + rollback, stop-and-flag, Andy
applies.

---

## Task 5 — Logo render on both documents

1. Resolve the partner logo from the submission's owning partner. Render it in
   the **center** of the header on both the Project Quote and the Customer
   Proposal. Blank fallback when `logo_path` is null; header layout must not
   shift in either case.
2. Left (Arxys lock-up) and right (badge / ref / date) header elements unchanged.
3. Confirm react-pdf renders the PNG/JPG from the bucket (fetch/embed per the
   codebase's existing image-in-PDF pattern).

---

## Task 6 — Dashboard mini-logo

Render the logged-in partner's own logo next to the "Welcome back, [name]" line
on their own dashboard only. Blank when none. Not on internal/admin views.

---

## Task 7 — Customer Proposal access path (rides on 0083)

- Wire the Customer Proposal as a **variant parameter on the existing 0083
  route**: `/api/submissions/[id]/project-quote/pdf?variant=customer-proposal`.
  Do NOT add a second route.
- Same double-gate: handler ownership check + RLS. Reads the same
  `project_quotes` row under the same widened SELECT policy — no new RLS surface.
- 0083's own migration must be applied for either document to be partner-visible;
  that is a separate approval (see ADR 0083). The Customer Proposal route can be
  built and tested now and goes live with the same policy.

---

## Task 8 — My Pipeline: two buttons per project

Partner-facing, per project, both appearing only once a quote snapshot exists:
- **Download Project Quote** (partner pricing).
- **Download Customer Proposal** (end-user version).

Reuse the shared status/action renderers from the 2026-07-20 UX pass. Both
degrade cleanly (hidden until a snapshot exists).

---

## Task 9 — Tests (the leak guard is required)

1. **Discount-leak guard (build-failing).** A test that renders a Customer
   Proposal from a snapshot carrying known discount/partner values and asserts
   NONE of those values appear anywhere in the output — text layer and PDF
   metadata. This must fail the build if a discount value leaks. Non-negotiable.
2. **Grand-total recompute:** assert the Customer Proposal grand total equals the
   sum of MSRP line totals and does NOT equal the partner total.
3. **Column set:** assert the Customer Proposal commercial table has exactly
   CODE / PRODUCT / PRICE EACH / QTY / PRODUCT TOTAL and no DISC/PARTNER columns,
   and no DEAL cell.
4. **Content deltas:** System-capacity bars absent; Quoted-solution bars present;
   page-4 T&Cs absent; validity banner present.
5. **MSRP freeze (if Task 4 applied):** re-render after a simulated price change
   shows the originally-quoted MSRP.
6. **Access (extend 0083's suite):** the `?variant=customer-proposal` path passes
   the same owner-positive / cross-partner-negative / on-behalf-positive gates as
   0083's 20a–20d. Behind the same `RUN_0083_TESTS=1` flag or a sibling flag.
7. Existing suite stays green; `npx tsc --noEmit` clean; `npm run build` green.

---

## Deliverables

- Migrations + paired rollbacks for: `logo_path` column, Storage bucket policy,
  and (conditional) snapshot MSRP-freeze. None applied by the agent.
- Assembler change (discount strip), Customer Proposal renderer variant, logo
  render on both docs, dashboard mini-logo, variant route, two Pipeline buttons.
- Full test additions incl. the build-failing leak guard.
- A JOURNAL entry (newest-first) and an apply-note listing each stop-and-flag
  migration in order for Andy to apply, with its rollback.

## Stop-and-flag checklist (do not self-clear)

- `logo_path` column migration — Andy applies.
- Storage bucket + policy — confirm read/write model with Andy before creating
  against prod.
- Snapshot MSRP-freeze migration (if needed) — Andy applies.
- 0083 SELECT-policy migration — separate approval (ADR 0083), prerequisite for
  partner visibility of either document.
