# Claude Code Brief — Datasheet Automation, Phase 1 (Schema)

**Model:** Opus 4.8
**Effort:** xhigh
**Mode:** Design + write migrations. Do not apply them. Stop-and-flag — Andy applies via the usual
process. No RLS policy changes beyond what's needed to mirror the existing read pattern (see below).

## Context

Reference `docs/datasheetplan.md` and the Phase 0 JOURNAL entry (2026-07-23) for full background.
Three decisions are already made and should be treated as fixed, not reopened:

1. Management/ACM/workstation archetypes get a **new companion table**, not relaxed constraints on
   `product_specs`. `product_specs` stays rack-video-only, exactly as it is today.
2. The 7-VMS compliance-strip list is authoritative. `product_specs.vms_certified` is known-stale;
   leave it alone, don't touch it in this phase, it's a separate cleanup.
3. Rear-panel photography is confirmed real-photo, not vector art, and mostly doesn't exist yet.
   Not a schema concern for this phase, flagged here so it isn't accidentally scoped in.

## Tasks

### 1. New companion table

Design a table for V150/V250/V255/V260/V265 (management/ACM) and SW10/SW20 (workstation), following
the `camera_specs` precedent (new table mirroring `product_specs`'s reference-table pattern: text PK
matching the SKU, RLS read-open to `authenticated`, admin-only write, no `created_at`/`updated_at`
if that matches the sibling tables).

Needs, at minimum:
- `family_type` discriminator (`management`, `acm`, `workstation`) driving which optional fields a
  template expects populated
- Base fields every archetype needs: CPU model, cores/threads, cache, RAM spec, OS edition, network
  port counts, form factor, rack units (nullable where not applicable, e.g. tower workstations)
- Storage: nullable, and able to represent "NA" (the V250 management server has no HDD bays) rather
  than assuming a numeric value
- Power: wattage, redundancy, AC input spec, and an **optional** DC input spec (V250 has both AC and
  DC listed on one sheet, most SKUs have AC only)
- A way to represent **two CPU variants on one sheet** (V250 vs V255 differ only in CPU/RAM, same
  physical sheet) — decide whether that's two rows with a shared `sheet_group` key, or one row with
  paired CPU columns, and note the tradeoff in the migration comment
- Workstation-only: GPU spec (model, VRAM, encode/decode counts, CUDA/Tensor/RT core counts),
  monitor support, front/rear IO ports, camera count matrix (small structured table — 4 rows of
  resolution/codec/FPS/camera-count/bandwidth per sheet; a JSONB column is probably the right shape
  here rather than a child table, but use judgment)
- Dimensions (depth/width/height, mm and inches), shipping weight, warranty years + terms text,
  environmental (operating/storage temp, humidity — confirmed to vary per SKU, don't hardcode),
  regulatory (safety/emission standards — also varies: CE/UKCA/FCC/RCM/UL on servers,
  BSMI/CE/FCC(B)/Energy Star on workstations), NDAA disclosure text, security feature list, remote
  management description, display ports description, VMS/OS drive description, revision date

Decide and document the table name (working name `appliance_specs` in the plan doc — change it if a
better name fits the repo's naming conventions once you're looking at the actual schema).

### 2. `product_specs` additive migration

Same additive-migration pattern as the two prior migrations on this table. Missing fields, rack-video
archetype only: power (wattage, redundancy, AC input), dimensions, shipping weight, warranty years +
terms, environmental (temp/humidity, varies per SKU), regulatory (standards + NDAA text), security
feature list, remote management description, VMS/OS drive description, revision date.

### 3. Feature-block template scaffolding (schema only, not the prose itself)

The five page-1 feature headings (Flexible Storage, Lower Deployment Costs/H.265, High Data
Availability, Strengthen Cybersecurity, Advanced Support) don't exist anywhere in the repo. Don't
write the prose in this phase — that's a content task for a later step. Do add whatever columns are
needed to hold the **substitution values** the prose will need per family (drive-failure tolerance,
RAID level, cachevault presence), if they aren't already fully covered by existing `families.ts` /
`product_specs` fields. Confirm what's already covered before adding anything redundant.

## Decision capture

This phase makes real architectural calls (new table shape, the two-CPU-variant representation,
JSONB vs. child table for the camera matrix). Write an ADR for it, following the existing numbering
in `decisions/` — check the current highest number rather than assuming one.

## Report format

JOURNAL.md entry per the usual format. Migrations left unapplied in the repo, referenced by filename
in the entry. Flag anything you had to make a judgment call on (naming, the two-CPU-variant
representation, JSONB vs. child table) explicitly, so Andy can override before applying.
