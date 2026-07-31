# 0107 — Datasheet photos are public paths, and the usage paragraph is a spec column

- **Status**: Accepted
- **Date**: 2026-07-30

## Context

The datasheet template ([ADR 0105](./0105-datasheet-renders-at-three-pages.md)) renders two
photo frames per server sheet and one usage paragraph, and had no column for any of them.

For the photos, the assumption going in was that product imagery already lived in Supabase
storage, since that is where partner logos live. It does not. The Price Book heroes are
files under `public/price-book/`, referenced from `families.ts` as `heroImage`, and
`src/lib/pdf/assets.ts` already turns such a path into a data URI for the Project Quote's
showcase. Supabase storage holds exactly one thing today: partner logos, with their own
bucket and RLS.

For the usage paragraph, equivalent copy already exists as `greatFor` in `families.ts` — but
it is per-*family* TypeScript that only the Price Book can read, and it ships in a deploy.

Rear-panel photography does not exist for any SKU, and product photography exists only as
the Price Book heroes, several of which are shared across models (`1u-chassis-hero.png`
serves three).

## Options considered

- **Supabase storage keys.** Consistent with ADR 0097's "everything editable through the
  form, never a deploy" — marketing could add rear-panel shots without an engineer. Costs a
  bucket, RLS policies, an upload control in both forms, and a network fetch on the PDF
  render path, which is the exact dependency [ADR 0106](./0106-datasheet-fonts-committed-locally.md)
  refused for fonts.
- **Public paths under `public/`.** Reuses the heroes that already exist and the loader that
  already reads them; renders stay hermetic. New photos arrive by deploy.
- **A dedicated media table.** Correct if a SKU ever needs many images with captions and
  ordering. Two frames per sheet do not justify it.

## Decision

Six nullable `text` columns, three on each spec table:

- `product_photo_path`, `rear_io_photo_path` — a path under `public/`, e.g.
  `/price-book/v700-v800-hero.png`. **Not** a storage key.
- `usage_paragraph` — the page-1 "Recommended usage" prose.

All six are surfaced in a "Datasheet content" section on both admin forms, so they are
reachable through the only supported write path (ADR 0096's stated negative).

**The column type is the escape hatch.** It is plain text, so a storage key can replace a
path later with no schema change — the resolver discriminates on the leading `/`. Choosing
paths now does not foreclose uploads; it defers them until real photography exists to
upload.

**`greatFor` is not backfilled and not removed.** It keeps serving the Price Book from
`families.ts` until someone deliberately cuts that surface over. `usage_paragraph` is
per-SKU where `greatFor` is per-family, so a backfill is a copy, not a move — and the Price
Book is live and customer-facing.

**A bad path warns rather than refuses.** Nothing in a browser form can prove a file exists
on the server's disk, and the failure is quiet — the loader catches, returns null, and the
frame renders empty, indistinguishable from "not shot yet". So the forms warn on a URL, a
missing leading slash, or a non-`.png` extension, and still save.

**The prefill boundary differs per table**, because "sibling" means different things:

| | `product_specs` | `appliance_specs` |
|---|---|---|
| A sibling is | the same model at another drive capacity (`VX5-V400-128 / -160 / -192`) | a different model on the same chassis (V250/V255, SW10/SW20) |
| `usage_paragraph` | copies — identical by construction | excluded — per-model prose |
| `product_photo_path` | copies | copies — same chassis, same front |
| `rear_io_photo_path` | copies | **excluded** — SW20 is an SW10 plus a second GPU, which changes the rear panel's display outputs |

## Consequences

**Positive:** the heroes already in `public/` are usable immediately, with no bucket, no
policies and no upload UI. PDF rendering stays offline-safe. The datasheet reads its usage
copy from the same admin surface as every other spec value.

**Negative:** adding a photo needs a deploy, which is a step backwards from ADR 0097's
principle — acceptable only because the photos do not exist yet and arrive in batches, not
one at a time. Two sources of usage copy now coexist (`greatFor` and `usage_paragraph`) and
can drift; the drift is invisible until someone compares a datasheet with a Price Book page.

**When to revisit:** when real product and rear-panel photography lands. If it arrives as a
trickle that marketing maintains, switch to storage keys and add the upload control — the
column does not change. Also revisit the `greatFor` duplication once the datasheet is live
enough that the Price Book could read `usage_paragraph` instead.
