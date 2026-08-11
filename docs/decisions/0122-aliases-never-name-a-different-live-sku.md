# 0122 — `model_aliases` must never name a different live SKU

- **Status**: Accepted
- **Date**: 2026-08-11

## Context

Diffing the August 2026 Hanwha roster against `camera_specs` compares the union
of `model` and every element of `model_aliases`, so a roster entry already covered
by an alias does not present as new. That rule assumes aliases are alternate
spellings of the *same* camera — `XNV8083R`, `XNV-8083`, `Wisenet XNV-8083R`.

Four rows violated the assumption. Each carried an alias naming a **different
camera that is live in the August price list**:

| Existing row | Stray alias | Row's dimensions |
|---|---|---|
| `XNO-8082R` | `XNO-8083R` | 3328×1872 |
| `XNO-9083R` | `XNO-9082R` | 3840×2160 |
| `XNV-8083R` | `XNV-8083RZ` | 3328×1872 |
| `XNV-9083R` | `XNV-9083RZ` | 3840×2160 |

Two consequences. First, the diff silently suppressed four genuinely new models
as "already covered", under-reporting the delta. Second, and worse, the picker
resolved a search for `XNO-8083R` to the `XNO-8082R` row and fed *that* row's
resolution into the storage math — a wrong answer presented as a match. The `RZ`
pair are motorised-zoom variants whose specs cannot be assumed to equal the
fixed-lens sibling.

The likely origin is benign: an alias added as a stand-in so a not-yet-seeded
sibling would at least return something. Once the sibling has its own row, that
stand-in has no job left.

## Options considered

- **Leave the aliases and skip the four models.** Status quo; keeps returning the
  sibling's resolution for four live SKUs. Rejected.
- **Seed the four models but keep the aliases.** Correct rows exist, but one
  search term then matches two rows with different resolutions and no way for a
  non-specialist to tell which is right. Rejected.
- **Strip the stray aliases and seed the four models (chosen).** One row per SKU,
  one match per search term.

## Decision

`model_aliases` may contain only alternate designations of the row's own camera:
punctuation variants, brand-prefixed forms, order codes, and shortened forms. It
must never contain another SKU's model number.

The four stray aliases were removed and the four models seeded as their own rows
with datasheet dimensions. This is the only change made to pre-existing rows in
the August pass.

An alias retained on `XNV-9083R` (`XNV-9083RW`) was checked and left in place: it
appears nowhere in the active price list, so it names no competing row.

## Consequences

**Positive:** each live SKU resolves to its own row with its own resolution; the
alias-union diff rule becomes sound, so future refresh passes can trust it; the
wrong-resolution path is gone.

**Negative:** a partner searching an old stand-in term now gets the specific model
rather than a near sibling — correct, but a visible change for anyone who had
learned the old behaviour. Alias hygiene is not enforced by the validator, so the
rule depends on reviewers.

**When to revisit:** if this recurs, add a validator rule rejecting any alias that
equals another row's `model` within the same vendor. That check was deliberately
not built now — one occurrence across three vendors is not yet a pattern.
