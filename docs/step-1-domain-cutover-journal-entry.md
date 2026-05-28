## 2026-05-26 — Phase 3 Step 1: Custom domain portal.arxys.com

### Work done

Phase 3 Step 1 closed. Custom domain `portal.arxys.com` is live and serving the portal as canonical. ADR 0036's two locked Phase 3 items resolve to: Step 1 (this entry) and "managed outside code by Andy" (the cohort invite — recorded in `docs/phase-3-plan.md`'s locked decisions).

**Cutover sequence:**

1. **DNS** — `portal.arxys.com` CNAME pointing at the Vercel deployment.
2. **Vercel** — domain attached to the `portal` project. Verified externally: GET `https://portal.arxys.com/` returns 307 → `/login`; login page renders with Arxys logo served from `https://portal.arxys.com/email/arxys-logo.png`.
3. **Supabase Redirect URLs** — `portal.arxys.com` added to the allow-list.
4. **Supabase Site URL** — flipped from `https://portal-arxys.vercel.app` to `https://portal.arxys.com`.
5. **Email templates** — the four canonical templates at `docs/email-templates/*.html` already use `{{ .SiteURL }}` (verified in Phase 1 Step 11), so the Site URL flip propagates automatically. No template edits needed.
6. **Smoke test** — password-reset triggered from `portal.arxys.com/forgot-password`; reset email arrived with magic link pointing at `portal.arxys.com/auth/confirm?...`. Confirms Site URL flip is live and `{{ .SiteURL }}` binding is correct in the live templates.

**Disposition of `portal-arxys.vercel.app`:** left live as a no-cost fallback. Both domains resolve; `portal.arxys.com` is canonical for partner-facing communication and email magic links.

**Plan + index housekeeping:**

- `docs/phase-3-plan.md` — created. Covers Steps 1–7 plus locked decisions extending ADR 0036. Status: Active.
- `docs/README.md` — forward-looking-plans table to be updated: `phase-3-plan.md` → Active (with link).

### Detours & fixes

None. Clean cutover.

### Decisions captured

None — Step 1's choices are recorded in `docs/phase-3-plan.md`'s locked decisions section (no separate ADR).

### Pending / Phase 3 inputs

- `docs/phase-3/step-2-polish-support-docs.md` — Step 2 scoping brief (drafted alongside this entry).
- Manual prereq for Step 2: image assets (`Windows_Server_2022.png`, `5_year_warranty-circle-2.png`) to be placed in `public/price-book/` before the Step 2 session starts.

---
