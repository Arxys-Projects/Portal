# Claude Code brief — extract the shared spec-form kit (ADR 0097 build step 2)

**Model:** Opus 5
**Effort:** high
**Why:** a refactor of shipped, production-working code (`/admin/specs`, 9 files / ~1,466
lines) with a deliberate regression risk ADR 0097 accepted in writing. The extraction has to
serve a second consumer that doesn't exist yet, so the interface decisions are judgment, not
mechanics. Its live regression gate is currently red for unrelated reasons, which is exactly
the kind of thing a lower-effort session misreads.

Follow the three-document discipline and every hard rule (no `supabase db push`, no
autonomous production writes, stop-and-flag before anything touching live records / RLS /
schema). The style skills apply to any user-facing string you touch — but note that in a pure
refactor you should be touching none.

---

```
Datasheet automation — ADR 0097 build step 2: extract the shared spec-form kit and migrate
/admin/specs onto it. Pure refactor, no behaviour change. App code only — no SQL, no migrations.

CONTEXT
Build steps 1 and 3 shipped 2026-07-28 (commits 0912fbb, 8b8ff66): both datasheet migrations
are amended, applied to production and verified. appliance_specs (64 cols) + its audit table
are live and empty; product_specs is at 68 columns. So the data layer is real and writable, and
nothing in it needs touching this session.

Step 2 is ADR 0096's revisit condition firing: a second archetype's form (appliance_specs,
step 5) would duplicate ~700 lines of kind vocabulary, zod builders, coercion helpers and the
section-walking renderer. The design settled the middle path — extract a kit, keep field lists
per-table. Implement design §5; don't redesign it.

/admin/specs is LIVE IN PRODUCTION and working: ADR 0096's round-trip and the V100 RAID
corrections both shipped through it. This refactor must not change one user-visible thing —
no field label, no validation message, no ordering, no warning text.

READ FIRST, in order:
1. docs/decisions/0097-datasheet-surfaces-join-admin-editable-pattern.md decision 4
2. datasheets/datasheet-phase2-admin-surface-design.md §5 (the extraction spec) and §4
   (what the appliance form will need from the kit — the second consumer you're designing for)
3. The whole current surface, all 9 files: src/app/(app)/admin/specs/{fields.ts,schema.ts,
   actions.ts,page.tsx,new/page.tsx,[sku]/page.tsx,schema.test.ts,
   _components/{spec-form.tsx,net-usable-preview.tsx}}
4. scripts/roundtrip-product-specs.mts (your live regression gate — read the ASSERTION
   SEMANTICS before running it, see task 5)
5. AGENTS.md — this Next.js differs from your training data; read the relevant guide in
   node_modules/next/dist/docs/ before writing component or route code

TASKS
1. Create src/lib/spec-form/ — pure data + zod, NO server imports, so both surfaces and the
   test suite can import it freely. Per design §5: the SpecFieldKind union and builders
   (requiredText, optionalInt, blankToNull, blankToNumber, …), initialValuesFromRow,
   specInputFromFormData, and the section-walking <SpecFormShell> renderer with a per-table
   slot for extras.
2. Generalise the RAID select into an enum-required / enum-optional kind taking per-field
   `options`. The existing RAID select is its first instance and must render and validate
   byte-identically; family_type and the matrix codec are the next two (step 5).
3. The net-usable preview is the extras slot's first instance — it stays product_specs-only
   and must keep working. Do not generalise it; ADR 0097 §4f is explicit that appliance_specs
   gets no preview.
4. Migrate /admin/specs onto the kit. What stays per-table and must NOT move into src/lib:
   fields.ts (sections, hints, rules, warnings), schema.ts assembly, actions.ts, the three
   pages, bespoke components.
5. Verification. tsc --noEmit, npm test (317 baseline, plus whatever you add), eslint on
   changed files, and the live round-trip:
     node --env-file=.env.local --import tsx scripts/roundtrip-product-specs.mts
   READ THIS BEFORE INTERPRETING IT. The script currently exits NON-ZERO with exactly 22
   COVERS failures, naming the 22 columns the step-3 apply added — that is expected and is
   closed by step 4, not by you. Your regression signal is:
     - PARSES and PRESERVES green, 21 rows × 43/43 fields  ← a bad extraction breaks this
     - COVERS still exactly 22 failures, same column names ← if this number moves, you did it
   Capture the before/after of both in your summary. schema.test.ts (520 lines) is the other
   half of the gate and should pass untouched — if you find yourself editing an assertion to
   make it green, stop and explain why in your summary instead.
6. One genuine open question, decide explicitly and say which you chose: design §5 lists the
   new `date-optional` and `string-list` kinds as kit contents, but their first consumers
   (revision_date, security_features) don't land until step 4. Recommend deferring both to
   step 4 so step 2 stays a true no-new-surface refactor; the generalised enum kind is NOT
   deferrable since the RAID select needs it. Either way, flag the call — don't just do it.
7. Docs: JOURNAL entry. No new ADR — 0097 decision 4 covers this; if the extraction forces a
   real departure from §5, flag it in your summary and propose an ADR rather than writing one
   unasked. RUNBOOK only if the setup path changed (it shouldn't).
8. Git: check for parallel-session drift on docs/JOURNAL.md and ADR numbers before staging.
   Explicit paths, never git add -A. Direct to main, then push.

DO NOT: touch supabase/, run supabase db push, apply anything, add fields to fields.ts, or
extend the form's column coverage — that is step 4. Deviations from design §5 get flagged in
your summary, not improvised.

OUTPUT: the kit, the migrated surface, before/after numbers for both round-trip assertions and
the test suite, and the task-6 call.
```

---

## Why the two warnings are in there

**The round-trip is red before the session starts.** `roundtrip-product-specs.mts` exits
non-zero with 22 COVERS failures as of the step-3 apply (2026-07-28), and it is *also* the
designated proof that this refactor changed nothing. Without the assertion semantics spelled
out, a session either "fixes" the 22 — wandering into step 4's scope and shipping form fields
this brief forbids — or reads red as its own regression and starts unpicking a correct
extraction. PARSES/PRESERVES is the signal; COVERS holding at exactly 22 is the guardrail.

**`schema.test.ts` is the real safety net.** 520 lines, and ADR 0097 names it plus the live
round-trip as the entire gate on this refactor. A test edited into passing removes the only
thing standing between a bad extraction and production, so the brief makes that an
escalation rather than a judgment call.

## After this lands

Step 4 (extend the product_specs form to the 22 new columns, closing the round-trip window)
then step 5 (the appliance_specs surface, `roundtrip-appliance-specs.mts`, test-rls block 22).
Both depend on this kit. Design §7 has the full sequence.
