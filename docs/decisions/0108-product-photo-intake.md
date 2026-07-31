# 0108 — Product photo intake: a gitignored drop-box and a model-keyed filename

- **Status**: Accepted
- **Date**: 2026-07-31

## Context

[ADR 0107](./0107-datasheet-photos-are-public-paths.md) chose public paths over Supabase
storage for the datasheet's two photo frames, and closed with "revisit when real product and
rear-panel photography lands." The first batch has landed: front heroes and rear-panel line
drawings for the V400 and V500.

That batch exposes a step 0107 left unspecified. The columns hold a path, and the admin form
is the only write path for them (ADR 0096) — but nothing said where the *file* comes from or
what it is called. The shots arrive named for the photographer's convenience
(`Videox-V400.png`, `V400 -rear.png` — mixed case, a stray space, a product prefix), which is
not a name anyone can guess when typing a path into a form field.

There is also no way for the form to tell a not-yet-shot frame from a typo: the loader
catches, returns null, and renders an empty frame either way (0107's stated negative). So the
filename has to be derivable from the model without looking anything up.

## Options considered

- **Reference the shots where they land** (`~/Downloads`, a shared drive). Zero moves, but
  the render path reads `public/` on disk, so this cannot work at all — it only looks like it
  works on the machine that has the file.
- **Keep the photographer's filenames, tracked as-is.** No rename step. But the path in the
  form becomes unguessable per-SKU trivia, and a stray space in a URL path is a latent bug.
- **Gitignored `staging/` drop-box, renamed into `public/datasheet/` as
  `{model}-{front|rear}.png`.** One mechanical step per batch, and the path is derivable from
  the model. Costs a `.gitignore` line and a convention someone has to know.
- **Switch to Supabase storage now**, as 0107 flagged. Correct eventually; premature at a
  batch of four, and it would land an upload control before there is a trickle to justify it.

## Decision

Raw shots are dropped into `staging/product-photos/`, which is gitignored. They are renamed
into `public/datasheet/` as **`{model}-front.png`** and **`{model}-rear.png`**, model
lowercased (`v400-front.png`). The path pasted into the admin form is that name under
`/datasheet/`.

`public/datasheet/` — not `public/price-book/` — because these are datasheet assets. The
Price Book heroes stay where they are and stay referenced by `families.ts`.

**One photo shared by many models is named for the models, not duplicated per model.** The
1U chassis shot arrived twice, as `Videox-V100.png` and `Videox-V200.png`, and the two files are
RGB pixel-identical — one photograph, and it serves V100, V150, V200, V250, V255, V260 and V265.
Seven copies of identical bytes would be ~1.6 MB of duplication and seven files to keep in step,
so it lands once as `v100-v200-front.png` and all seven rows point at that path. This follows the
Price Book's existing `v700-v800-hero.png`, so the shape is precedent rather than invention, and
it is what the schema already expects: ADR 0107's sibling prefill *copies the path value* between
rows, which only makes sense if one path can serve many models.

The cost is that such a name is not derivable from a model — nothing about "V265" suggests
`v100-v200-front.png`. That is accepted for shared assets and only for shared assets: a photo of
one model keeps the `{model}-front.png` form. The pair naming is a signal in itself, since a
reader seeing two models in a filename knows to expect it in more than one row.

**The staging folder is a drop-box, never a source.** Nothing under `staging/` is tracked and
nothing reads from it, so a file left there is inert rather than half-wired.

**Alpha is preserved, not manufactured.** Each file is checked for a real alpha channel after
it lands. Where the source has none, that is recorded and left alone — compositing a fake
transparency would be a retouch decision disguised as a file operation, and it belongs with
whoever owns the artwork. In this first batch the rear-panel line drawings came back a second
time with real transparency once the baked white background was pointed out; the front heroes
remain RGB with a light-blue circuit-board background baked in, which is a design choice, not
a defect.

**Checking alpha needs more than `file`, and more than a transparent-pixel count.** `file`
reports the IHDR color type, which separates RGB from RGBA but cannot say whether an RGBA file's
alpha channel is *used* — a channel that is 255 everywhere passes a header check and still
renders a hard rectangle. Neither ImageMagick nor PIL is installed on the machine this work was
done on, so the honest check inflates the IDAT stream and reads actual alpha values.

Even a transparent-pixel *percentage* is not enough. Two rear drawings in the first batches both
reported ~60% fully transparent and looked equivalent; their alpha *distributions* were not. A
clean cutout is bimodal — nearly everything at alpha 0–31 or 224–255, with a thin antialiased
band between. Artwork exported with semi-transparent linework instead smears a fifth of its
pixels across alpha 32–127 and renders grey and soft. So the intake check is the histogram, and
the arbiter is a render (`--model`), not a number.

**Washed-out or inconsistent artwork lands anyway.** Opacity is the artwork owner's call, not a
repo fix. It is recorded in the JOURNAL and raised, and the file ships — silently retouching it
here would hide a decision someone else owns.

## Consequences

**Positive:** the form path is derivable from the model, with no per-SKU lookup. Adding a
model is a copy and a rename. `public/datasheet/` reads as an inventory of what has actually
been shot.

**Negative:** still a deploy per batch — 0107's negative, unchanged. The convention lives
only in this ADR and the RUNBOOK, so a rename done by hand can silently diverge from it. Two
photo directories now exist under `public/` with different naming rules, and the Price Book /
datasheet split is the only thing that explains which is which.

**When to revisit:** when photography arrives as a trickle rather than a batch, or when
someone outside engineering needs to add a shot. That is the trigger 0107 already named for
switching to storage keys and an upload control — the columns do not change, and this intake
convention becomes the thing the upload control replaces.
