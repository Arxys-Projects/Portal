# Brief: generating datasheets from inside the portal

Both datasheet templates now exist and both render correctly. Neither is reachable from the
running app — the only way to produce a sheet today is a local script against a dev machine.
This session closes that: an adapter layer, a route, and an admin surface.

---

READ FIRST, BEFORE WRITING ANY CODE

The design authority is in the repo, not in your head:
  datasheets/design_handoff_videox_datasheet/README.md
Read "Ledger (Video + Management)", "Rail (Workstation)", "Components", "Template variables",
and "Known constraints" in full. Reference renders are in
datasheets/design_handoff_videox_datasheet/screenshots/ — 01/02 are V800 (Ledger),
05 is SW10 (Rail).

ADRs to read before deciding anything:
  0096  product_specs is canonical and ADMIN-FORM-EDITABLE — the form is the ONLY write path
  0097  the datasheet spec surfaces joined that pattern
  0105  why Ledger ships at three pages, not the handoff's two
  0107  datasheet photos are public paths, not Supabase storage
  0108  photo intake + the {model}-front.png / {model}-rear.png naming
  0109  Rail is a second template with its own content type, not a Ledger variant

Also read datasheets/datasheet-phase2-admin-surface-design.md. Careful: it designs the spec
*editing* surface (/admin/specs, /admin/appliance-specs), which already shipped. It does NOT
cover datasheet generation. Do not mistake one for the other.

---

WHAT ALREADY EXISTS — reuse, don't duplicate

  src/lib/datasheet/tokens.ts          px(), C, F, registerDatasheetFonts(), loadPng()
  src/lib/datasheet/types.ts           DatasheetContent — the LEDGER content contract
  src/lib/datasheet/DatasheetPdf.tsx   Ledger template, 3 pages (servers + management)
  src/lib/datasheet/placeholder.ts     V800_PLACEHOLDER — hand-assembled, NOT from the DB
  src/lib/datasheet/rail-types.ts      RailContent — the RAIL content contract
  src/lib/datasheet/RailDatasheetPdf.tsx  Rail template, 1 page (workstations)
  scripts/render-datasheet-mockup.ts   Ledger render, fed by the placeholder
  scripts/render-rail-mockup.ts        Rail render, fed by LIVE appliance_specs

The asymmetry is the whole point of this session:

- **Rail already has a working DB adapter** — `buildContent()` inside
  `scripts/render-rail-mockup.ts`. It reads a live `appliance_specs` row and returns
  `RailContent`. It is correct and tested by eye against screenshot 05. It is in the wrong
  place: a script, not `src/lib`, with no unit test.
- **Ledger has no adapter at all.** `DatasheetPdf` has only ever been fed
  `V800_PLACEHOLDER`, a hand-typed object. Nothing maps `product_specs` → `DatasheetContent`.
  That mapping is the largest single piece of work here.

Patterns to copy rather than reinvent:

  src/app/(app)/api/comparison/pdf/route.ts   the PDF route shape — auth check, zod body,
                                              renderToBuffer, Content-Disposition, the
                                              runtime/dynamic exports
  src/lib/project-quote/render.ts             where `import "server-only"` goes: on the RENDER
                                              ENTRY POINT, never on the component (the marker
                                              throws under plain Node and would put the
                                              template out of reach of tsx --test)
  src/lib/auth/require-admin-or-internal.ts   the admin gate. The /admin layout admits admin
                                              AND internal; mutations and exports gate on
                                              isAdmin specifically
  src/app/(app)/admin/appliance-specs/page.tsx  an existing admin index page, grouped by
                                              sheet_group — the closest UI analogue

---

DATA — verified live this session, do not re-derive

`product_specs` — 21 rows, 7 NVR models × 3 SKUs each:
  V100 (2 bay 1U) · V200 (4 bay 1U) · V400 (8 bay 2U) · V500 (12 bay 2U)
  V600 (16 bay 3U) · V700 (24 bay 4U) · V800 (36 bay 4U)
Part numbers are `VX5-{MODEL}-{RAW_TB}`, e.g. VX5-V400-128 / -160 / -192.

  ONE DATASHEET PER MODEL, NOT PER SKU. The three SKUs of a model ARE the rows of that
  sheet's orderable-configurations table. A picker listing 21 datasheets is wrong.

`appliance_specs` — 7 rows, keyed by `product_group`, with a `family_type`:
  management   V250, V255      → Ledger template
  workstation  SW10, SW20      → Rail template
  acm          V150, V260, V265 → NO TEMPLATE EXISTS

  The ACM line is explicitly out of scope in the handoff — no ACM-specific fields (door
  counts, certified-platform lists) are designed anywhere. Do not improvise a third
  template or render an ACM row through Ledger. The picker must state plainly that these
  three have no sheet yet, in words, not by omitting them silently.

  SW25/SW30/SW35 appear in old test fixtures. They were EOL'd from the Price Book and have
  no rows. Only SW10 and SW20 are live.

Camera stream data differs by table, and this trips people:

- `appliance_specs.camera_matrix` is a JSON column. It exists, it is populated for SW10/SW20,
  and it drives Rail's four-row matrix (H.264 and H.265 as separate rows).
- **`product_specs` has NO camera_matrix column.** Ledger's VSR table has to be DERIVED:
  `max_cameras_h265` is the 4MP baseline, and the handoff's published rule is
  `8MP streams = round(baseline × 0.55)`. Two rows, H.265 only — the handoff is explicit
  that Ledger does not split codecs. Do not fabricate per-resolution rows, and do not copy
  the illustrative numbers out of V800_PLACEHOLDER into an adapter.

Read-only, always: `node --env-file=.env.local ...` with a PostgREST GET, or read
`scripts/render-rail-mockup.ts`, which already does exactly this.

---

THE WORK — three pieces, in this order

1. **Adapters in `src/lib/datasheet/`.** `from-appliance-specs.ts` (lift `buildContent()` out
   of the Rail script; the script then imports it, so there is one mapping and not two) and
   `from-product-specs.ts` (new — NVR rows → `DatasheetContent`, grouping the three SKUs of a
   model into the orderable table). Both take already-fetched rows and return content; keep
   the fetch outside so they are testable without a network.

   `src/lib/datasheet/` has ZERO tests today. These adapters are where the correctness lives —
   a wrong RAID level or a fabricated spec row is a customer-facing error — so they are the
   part that must be unit tested. Baseline is 442 passing; that number should go up.

2. **A route.** Model in, PDF out, template chosen by family. Copy the comparison route's
   shape. `registerDatasheetFonts()` must run on the render entry point before layout, not
   only inside the component.

3. **An admin surface** to pick a model and download. Match the existing admin index pages.

---

TRAPS — most of these have already cost someone real time

1. **Never UPDATE `product_specs` or `appliance_specs` directly.** The admin form is the only
   write path (ADR 0096). This session reads only.
2. **The warranty seal must be chosen by term.** `/price-book/3_year_warranty-circle.png` for
   3-year (workstations), `/price-book/5_year_warranty-circle-2.png` for 5-year (everything
   else). They are adjacent files with near-identical names. Derive from `warranty_years`;
   never hardcode. The wrong seal is a false warranty claim on a customer-facing document,
   not a cosmetic slip.
3. **An empty spec column produces NO row.** SW10 has empty raid_support, cooling,
   remote_mgmt, storage_temp, regulatory_emissions and security_features. A row's own `notes`
   column records which blocks its source factsheet lacks. Never invent a row, and never
   claim TPM or encryption for a product that does not list it.
4. **"Camera streams", never "cameras".** A multisensor device presents several streams to the
   VMS. The handoff calls this terminology load-bearing.
5. **Ledger's 4MP is 2560×1440. Rail's 4MP is 2592×1944.** Not a typo — the two source
   factsheets genuinely differ.
6. **RAID level is a template variable, not a constant** — V800 is RAID 60, V400 is RAID 6.
   The handoff calls this its single most important gotcha; it was caught by testing the
   template against a second model. Test your Ledger adapter against at least two models.
7. **`loadPng` uses `readFileSync` against `process.cwd() + "public"`.** That works locally.
   Whether it works inside a deployed serverless function depends on those files being traced
   into the bundle — VERIFY IT ON A PREVIEW DEPLOY before believing the route works, because
   the failure is silent: `loadPng` swallows the error and returns null, so a broken read
   renders a held frame that looks exactly like "no photo yet". This is the single most
   likely way this session ships something that works locally and not in production.
8. **The page-fit constraint is real.** Ledger is 3 pages and Rail is exactly 1, both with
   zero slack. A model whose spec values are longer than the one you tested can overflow.
   The Rail script counts `/Type /Page` in the emitted buffer and warns — do the same in any
   new render path rather than letting a silent spill pass as success.
9. **Any new script must be plain `.ts`, not `.mts`.** tsx loads `.mts` as ESM and `.ts` as
   CJS, which gives the script a different `@react-pdf/renderer` instance than
   `src/lib/datasheet/*.ts` get — two font stores, and `registerDatasheetFonts()` writing to
   the one the renderer never reads ("Font family not registered: Montserrat", from a call
   that plainly ran). Full explanation in the header of `scripts/render-datasheet-mockup.ts`.
10. **Run render commands from the repo root** — see trap 7.

---

OPEN DECISIONS — ask, don't guess

These change the shape of the work, so settle them before building:

1. **Who can download a datasheet?** Admin-only is the safe default and matches where the
   brief points, but datasheets are marketing collateral — the argument that every partner
   should get them from the Price Book is a real one. This decides the route's guard and
   whether the UI lives under `/admin` or next to the Price Book.

2. **Rendered on demand, or frozen?** The Project Quote freezes a snapshot (ADR 0060) because
   pricing must not drift under a customer. A datasheet arguably wants the opposite — always
   current specs. But then a PDF a partner downloaded last quarter silently disagrees with
   today's. On-demand is simpler and is the recommendation; get it said out loud rather than
   assumed.

3. **Where does authored copy live?** This is the real one. Each sheet needs a headline
   sentence, a usage paragraph, feature blocks and table captions. Some of it is in the DB
   (`usage_paragraph`); the rest is currently hardcoded in the render scripts and marked
   AUTHORED — mockup quality, never marketing-reviewed. It cannot stay in a script once the
   portal generates these for real. The options are a new column set (the admin form is
   already the write path, so this fits the established pattern), a checked-in content module
   keyed by model, or leaving it template-generic. Each has a different blast radius.
   **Do not silently pick one — this is a content-ownership question, not an implementation
   detail.**

If a fourth question surfaces mid-build, do everything that doesn't depend on the answer
first, then ask.

---

DELIVERABLES

- Two adapters in `src/lib/datasheet/`, unit tested, with the Rail script importing the
  shared one rather than keeping its own copy
- A route that renders a datasheet for a model, correct template by family
- An admin surface to find a model and download its sheet
- ACM models visibly marked as having no sheet, in words
- Ledger and Rail templates still rendering identically to their reference screenshots

---

DOCS — required, not a follow-up (see AGENTS.md / docs/README.md)

- `docs/JOURNAL.md` entry, newest at top, with a "Detours & fixes" section if anything broke
- An ADR for whatever the three open decisions resolve to. Next free number is **0110** —
  check `docs/decisions/` first, parallel sessions share this checkout and may have taken it.
  Never reuse a number.
- `docs/RUNBOOK.md` only if the recipe to recreate or render changes

---

REPO CONVENTIONS

- Pushing main DEPLOYS TO PRODUCTION IMMEDIATELY. Commit freely; ask before pushing.
- Never `git add -A` — parallel sessions share this checkout. Stage explicit paths, and check
  `docs/JOURNAL.md` and ADR numbers for drift before staging.
- Branching is not needed for ordinary work here; land on main.
- Verify with `npx tsc --noEmit`, `npx eslint`, and `npm test` (baseline 442 passing).
